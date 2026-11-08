import { useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  FileDownIcon,
  HardHatIcon,
  LockIcon,
  RotateCcwIcon,
  SaveIcon,
  SendIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useCatalog } from '@/api/catalog'
import type { Customer } from '@/api/customers'
import { customerAddress } from '@/api/customers'
import { useFirmMutation } from '@/api/queries'
import { quoteMutations, quotePdfUrl, type Quote, type QuoteInput } from '@/api/quotes'
import type { Account } from '@/api/types'
import { FormRow, Panel } from '@/components/common'
import { CustomerPicker, type PickedCustomer } from '@/components/customers/customer-picker'
import { DateInput } from '@/components/date-input'
import {
  computeLines,
  computeTotals,
  DocTotals,
  duplicateRoomNames,
  LinesEditor,
  lineFromApi,
  lineToInput,
  NumberInput,
  RoomsEditor,
  roomsToInput,
  Select,
  syncLinesWithRooms,
  type DocLine,
  type Room,
} from '@/components/doc-editor'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { GuideLink } from '@/components/guides/guide-link'
import { useFirm } from '@/hooks/use-firm'
import { addDays, fmtDate, fmtDateTime, money, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DecisionDialog, SendQuoteDialog } from './quote-dialogs'
import { QuoteStateBadge } from './quote-list'

type Form = {
  customer: PickedCustomer | null
  title: string
  site_address: string
  issued_on: string
  valid_until: string
  intro: string
  note: string
  terms: string
  discount: number
  vat_rate: number
  show_measure: boolean
  rooms: Room[]
  lines: DocLine[]
}

function formFromQuote(q: Quote): Form {
  return {
    customer: q.customer,
    title: q.title,
    site_address: q.site_address,
    issued_on: q.issued_on,
    valid_until: q.valid_until,
    intro: q.intro,
    note: q.note,
    terms: q.terms,
    discount: q.discount,
    vat_rate: q.vat_rate,
    show_measure: q.show_measure,
    rooms: q.rooms,
    lines: q.lines.map(lineFromApi),
  }
}

function newForm(account: Account, customer: PickedCustomer | null): Form {
  const s = account.settings
  const issued = today()
  return {
    customer,
    title: '',
    site_address: customer?.address ?? '',
    issued_on: issued,
    valid_until: addDays(issued, Math.max(1, s.quote_valid_days || 30)),
    intro: s.quote_intro,
    note: '',
    terms: s.quote_terms,
    discount: 0,
    vat_rate: s.vat_payer ? s.default_vat_rate : 0,
    show_measure: false,
    rooms: [],
    lines: [],
  }
}

const autoTitle = (f: Form) => `${f.rooms[0]?.name.trim() || 'Nabídka'} — ${f.customer?.name ?? ''}`.trim()

function toInput(f: Form): QuoteInput {
  return {
    customer_id: f.customer?.id ?? 0,
    title: f.title.trim() || autoTitle(f),
    site_address: f.site_address.trim(),
    issued_on: f.issued_on || undefined,
    valid_until: f.valid_until || undefined,
    intro: f.intro,
    note: f.note,
    terms: f.terms,
    discount: Math.min(100, Math.max(0, f.discount || 0)),
    vat_rate: f.vat_rate,
    show_measure: f.show_measure,
    rooms: roomsToInput(f.rooms),
    lines: computeLines(f.lines, f.rooms).map(lineToInput),
  }
}

/** Nová nabídka (`quote` chybí) i detail a úprava existující — stejná stránka. */
export function QuoteEditor({ quote, initialCustomer }: { quote?: Quote; initialCustomer?: PickedCustomer | null }) {
  const { slug, account } = useFirm()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const vatPayer = account.settings.vat_payer
  const [form, setForm] = useState<Form>(() => (quote ? formFromQuote(quote) : newForm(account, initialCustomer ?? null)))
  const [baseline, setBaseline] = useState(() => (quote ? JSON.stringify(toInput(formFromQuote(quote))) : ''))
  const [dialog, setDialog] = useState<null | 'send' | 'accepted' | 'rejected'>(null)
  const [deleting, setDeleting] = useState(false)
  const leaving = useRef(false)
  const catalog = useCatalog(slug).data ?? []

  const create = useFirmMutation(slug, quoteMutations.create(slug), [['quotes'], ['customers']])
  const update = useFirmMutation(slug, quoteMutations.update(slug), [['quotes'], ['customers']])
  const duplicate = useFirmMutation(slug, quoteMutations.duplicate(slug), [['quotes']])
  const remove = useFirmMutation(slug, quoteMutations.remove(slug))
  const decide = useFirmMutation(slug, quoteMutations.decide(slug))
  const createJob = useFirmMutation(slug, quoteMutations.createJob(slug))

  const locked = !!quote && (quote.state === 'accepted' || quote.state === 'rejected')
  const isNew = !quote
  const input = useMemo(() => toInput(form), [form])
  const dirty = isNew ? form.rooms.length > 0 || form.lines.length > 0 || !!form.customer : JSON.stringify(input) !== baseline
  const totals = useMemo(() => computeTotals(form.lines, form.rooms, form.discount, vatPayer ? form.vat_rate : 0), [form, vatPayer])
  const saving = create.isPending || update.isPending

  useBlocker({
    shouldBlockFn: () => !leaving.current && dirty && !locked && !window.confirm('Nabídka má neuložené změny. Opravdu odejít bez uložení?'),
    enableBeforeUnload: () => !leaving.current && dirty && !locked,
  })

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const go = (to: () => Promise<unknown> | void) => {
    leaving.current = true
    void to()
  }

  const validate = (): boolean => {
    if (!form.customer) {
      toast.error('Vyberte nebo založte zákazníka.')
      return false
    }
    if (duplicateRoomNames(form.rooms).size > 0) {
      toast.error('Každá místnost musí mít jiný (a neprázdný) název.')
      return false
    }
    if (form.lines.some((l) => !l.name.trim())) {
      toast.error('Každá položka musí mít název.')
      return false
    }
    return true
  }

  /** Uloží; vrací uloženou nabídku (nebo null při chybě). */
  const save = async (): Promise<Quote | null> => {
    if (!validate()) return null
    try {
      if (quote) {
        const saved = await update.mutateAsync({ id: quote.id, body: input })
        qc.setQueryData([slug, 'quotes', saved.id], saved)
        setForm((f) => ({ ...f, title: f.title.trim() || saved.title }))
        setBaseline(JSON.stringify(toInput(formFromQuote(saved))))
        return saved
      }
      const saved = await create.mutateAsync(input)
      qc.setQueryData([slug, 'quotes', saved.id], saved)
      go(() => navigate({ to: '/a/$slug/quotes/$id', params: { slug, id: String(saved.id) }, replace: true }))
      return saved
    } catch {
      return null
    }
  }

  const onSave = async () => {
    const saved = await save()
    if (saved) toast.success(isNew ? `Nabídka ${saved.number} založena` : 'Uloženo')
  }

  const ensureSaved = async () => !dirty || (await save()) !== null

  const openPdf = async () => {
    if (!quote) return
    if (!dirty) {
      window.open(quotePdfUrl(slug, quote.id), '_blank')
      return
    }
    const w = window.open('', '_blank')
    if (await ensureSaved()) {
      if (w) w.location.href = quotePdfUrl(slug, quote.id)
    } else w?.close()
  }

  const onDuplicate = async () => {
    if (!quote) return
    const copy = await duplicate.mutateAsync(quote.id).catch(() => null)
    if (!copy) return
    toast.success(`Vytvořena kopie ${copy.number}`)
    go(() => navigate({ to: '/a/$slug/quotes/$id', params: { slug, id: String(copy.id) } }))
  }

  const onCreateJob = async () => {
    if (!quote || !(await ensureSaved())) return
    const job = await createJob.mutateAsync(quote.id).catch(() => null)
    if (!job) return
    toast.success(`Zakázka ${job.number} vytvořena`)
    go(() => navigate({ to: '/a/$slug/jobs/$id', params: { slug, id: String(job.id) } }))
  }

  const reopen = () => quote && decide.mutate({ id: quote.id, body: { state: 'draft' } }, { onSuccess: () => toast.success('Nabídka je znovu rozpracovaná') })

  const pickCustomer = (c: Customer) =>
    setForm((f) => ({
      ...f,
      customer: { id: c.id, name: c.name, phone: c.phone, email: c.email, address: customerAddress(c) },
      site_address: f.site_address || customerAddress(c),
    }))

  // --- akce (desktop: tlačítka, telefon: menu) ---
  const menuItems = quote && (
    <>
      <DropdownMenuItem onClick={openPdf}>
        <FileDownIcon /> PDF
      </DropdownMenuItem>
      {!locked && (
        <DropdownMenuItem onClick={() => setDialog('send')}>
          <SendIcon /> {quote.state === 'sent' ? 'Poslat znovu' : 'Odeslat zákazníkovi'}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={onDuplicate}>
        <CopyIcon /> Duplikovat
      </DropdownMenuItem>
      {!locked && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={async () => (await ensureSaved()) && setDialog('accepted')}>
            <ThumbsUpIcon /> Zákazník přijal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog('rejected')}>
            <ThumbsDownIcon /> Zákazník odmítl
          </DropdownMenuItem>
        </>
      )}
      {quote.state !== 'rejected' && !quote.job_id && (
        <DropdownMenuItem onClick={onCreateJob}>
          <HardHatIcon /> {quote.state === 'accepted' ? 'Vytvořit zakázku' : 'Zákazník přijal → vytvořit zakázku'}
        </DropdownMenuItem>
      )}
      {quote.state !== 'draft' && !quote.job_id && (
        <DropdownMenuItem onClick={reopen}>
          <RotateCcwIcon /> Vrátit do rozpracovaných
        </DropdownMenuItem>
      )}
      {quote.public_url && quote.state !== 'draft' && (
        <DropdownMenuItem onClick={() => window.open(quote.public_url, '_blank')}>
          <ExternalLinkIcon /> Stránka pro zákazníka
        </DropdownMenuItem>
      )}
      {!quote.job_id && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
            <Trash2Icon /> Smazat
          </DropdownMenuItem>
        </>
      )}
    </>
  )
  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/a/$slug/quotes" params={{ slug }} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Nabídky
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{isNew ? 'Nové zaměření' : quote.number}</h1>
            {quote && <QuoteStateBadge state={quote.state} expired={quote.expired} />}
            {dirty && !locked && <span className="text-xs text-muted-foreground">• neuloženo</span>}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{isNew ? 'Zákazník → místnosti → položky → uložit.' : form.title || autoTitle(form)}</p>
        </div>
        <div className="flex items-center gap-2">
          <GuideLink topic={isNew ? 'zamereni' : 'nabidka'} compact />
          {quote && (
            <div className="flex flex-wrap gap-2 max-lg:hidden">
              <Button variant="outline" onClick={openPdf}>
                <FileDownIcon /> PDF
              </Button>
              {!locked && (
                <Button variant="outline" onClick={() => setDialog('send')}>
                  <SendIcon /> {quote.state === 'sent' ? 'Poslat znovu' : 'Odeslat'}
                </Button>
              )}
              {locked && quote.state === 'accepted' && !quote.job_id && (
                <Button onClick={onCreateJob} disabled={createJob.isPending}>
                  <HardHatIcon /> Vytvořit zakázku
                </Button>
              )}
            </div>
          )}
          {!locked && (
            <Button onClick={onSave} disabled={saving || (!dirty && !isNew)} className="max-lg:hidden">
              <SaveIcon /> {isNew ? 'Uložit nabídku' : 'Uložit'}
            </Button>
          )}
          {quote && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Další akce" />}>
                <EllipsisVerticalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {menuItems}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {quote && <StateBanner quote={quote} onCreateJob={onCreateJob} onReopen={reopen} onSend={() => setDialog('send')} onDuplicate={onDuplicate} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Zákazník a stavba">
            <div className="grid gap-3 md:grid-cols-2">
              <FormRow label="Zákazník" htmlFor="q-customer" className="md:col-span-2">
                <CustomerPicker id="q-customer" slug={slug} value={form.customer} onChange={pickCustomer} disabled={locked} defaultOpen={isNew && !form.customer} />
              </FormRow>
              <FormRow label="Název nabídky" htmlFor="q-title">
                <Input id="q-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={autoTitle(form)} disabled={locked} />
              </FormRow>
              <FormRow label="Adresa stavby" htmlFor="q-site">
                <Input id="q-site" value={form.site_address} onChange={(e) => set('site_address', e.target.value)} placeholder="Ulice, obec" disabled={locked} />
              </FormRow>
            </div>
            <details className="group mt-3" open={!isNew}>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">Datum, platnost, sleva{vatPayer ? ', DPH' : ''}</summary>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <FormRow label="Vystaveno" htmlFor="q-issued">
                  <DateInput id="q-issued" value={form.issued_on} onChange={(v) => set('issued_on', v)} disabled={locked} className="h-11 md:h-8" />
                </FormRow>
                <FormRow label="Platnost do" htmlFor="q-valid">
                  <DateInput id="q-valid" value={form.valid_until} onChange={(v) => set('valid_until', v)} min={form.issued_on} disabled={locked} className="h-11 md:h-8" />
                </FormRow>
                <FormRow label="Sleva na celou nabídku" htmlFor="q-discount">
                  <NumberInput id="q-discount" value={form.discount || null} onChange={(v) => set('discount', Math.min(100, Math.max(0, v ?? 0)))} suffix="%" placeholder="0" disabled={locked} />
                </FormRow>
                {vatPayer && (
                  <FormRow label="Sazba DPH" htmlFor="q-vat">
                    <Select id="q-vat" value={String(form.vat_rate)} onChange={(e) => set('vat_rate', Number(e.target.value))} disabled={locked}>
                      <option value="12">12 % (byty a domy)</option>
                      <option value="21">21 %</option>
                      <option value="0">0 % (přenesená daň.)</option>
                    </Select>
                  </FormRow>
                )}
              </div>
            </details>
          </Panel>

          <Panel
            title="Zaměření"
            actions={
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch size="sm" checked={form.show_measure} onCheckedChange={(v) => set('show_measure', v)} disabled={locked} />
                Ukázat zákazníkovi
              </label>
            }
          >
            <RoomsEditor
              value={form.rooms}
              readOnly={locked}
              onChange={(rooms) => setForm((f) => ({ ...f, rooms, lines: syncLinesWithRooms(f.lines, f.rooms, rooms) }))}
            />
          </Panel>

          <Panel title="Položky">
            <LinesEditor value={form.lines} onChange={(lines) => set('lines', lines)} rooms={form.rooms} catalog={catalog} readOnly={locked} hidePrices={false} />
          </Panel>

          <Panel title="Texty nabídky">
            <div className="flex flex-col gap-3">
              <FormRow label="Úvod" htmlFor="q-intro" hint="Tiskne se nad položkami. Výchozí text nastavíte v Nastavení firmy.">
                <Textarea id="q-intro" value={form.intro} onChange={(e) => set('intro', e.target.value)} rows={2} disabled={locked} />
              </FormRow>
              <FormRow label="Poznámka" htmlFor="q-note">
                <Textarea id="q-note" value={form.note} onChange={(e) => set('note', e.target.value)} rows={2} disabled={locked} placeholder="Např. termín zahájení, co zajistí zákazník…" />
              </FormRow>
              <FormRow label="Podmínky" htmlFor="q-terms">
                <Textarea id="q-terms" value={form.terms} onChange={(e) => set('terms', e.target.value)} rows={4} disabled={locked} />
              </FormRow>
            </div>
          </Panel>
        </div>

        <aside className="max-lg:hidden">
          <div className="sticky top-6 flex flex-col gap-3">
            <Panel title="Součty">
              <DocTotals totals={totals} vatPayer={vatPayer} discount={form.discount} />
            </Panel>
            {!locked && (
              <Button size="lg" onClick={onSave} disabled={saving || (!dirty && !isNew)}>
                <SaveIcon /> {isNew ? 'Uložit nabídku' : dirty ? 'Uložit změny' : 'Uloženo'}
              </Button>
            )}
            {quote && <QuoteMeta quote={quote} />}
          </div>
        </aside>
      </div>

      {quote && (
        <div className="mt-4 lg:hidden">
          <QuoteMeta quote={quote} />
        </div>
      )}

      {/* telefon: součet a uložení vždy po ruce (nad spodní lištou) */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mt-4 lg:hidden">
        <MobileTotals totals={totals.total} vatPayer={vatPayer} detail={<DocTotals totals={totals} vatPayer={vatPayer} discount={form.discount} />}>
          {!locked && (
            <Button size="lg" onClick={onSave} disabled={saving || (!dirty && !isNew)}>
              <SaveIcon /> {isNew ? 'Uložit' : dirty ? 'Uložit' : 'Uloženo'}
            </Button>
          )}
          {locked && quote?.state === 'accepted' && !quote.job_id && (
            <Button size="lg" onClick={onCreateJob}>
              <HardHatIcon /> Zakázka
            </Button>
          )}
        </MobileTotals>
      </div>

      {quote && dialog === 'send' && <SendQuoteDialog slug={slug} firm={account.name} quote={quote} beforeSend={ensureSaved} onClose={() => setDialog(null)} />}
      {quote && (dialog === 'accepted' || dialog === 'rejected') && <DecisionDialog slug={slug} quote={quote} state={dialog} onClose={() => setDialog(null)} />}
      {quote && deleting && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleting(false)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Smazat nabídku {quote.number}?</AlertDialogTitle>
              <AlertDialogDescription>Nabídka i odkaz pro zákazníka přestanou existovat. Nelze vrátit.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(quote.id, {
                    onSuccess: () => {
                      toast.success('Nabídka smazána')
                      go(() => navigate({ to: '/a/$slug/quotes', params: { slug } }))
                    },
                    onSettled: () => setDeleting(false),
                  })
                }
              >
                Smazat
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

function MobileTotals({ totals, vatPayer, detail, children }: { totals: number; vatPayer: boolean; detail: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border bg-card/95 shadow-lg backdrop-blur">
      {open && <div className="border-b px-4 py-3">{detail}</div>}
      <div className="flex items-center gap-3 px-3 py-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="block text-[11px] text-muted-foreground">{vatPayer ? 'Celkem s DPH' : 'Celkem'} · {open ? 'skrýt' : 'rozpis'}</span>
          <span className="block font-heading text-xl font-semibold tabular-nums">{money(totals)}</span>
        </button>
        {children}
      </div>
    </div>
  )
}

function StateBanner({
  quote: q,
  onCreateJob,
  onReopen,
  onSend,
  onDuplicate,
}: {
  quote: Quote
  onCreateJob: () => void
  onReopen: () => void
  onSend: () => void
  onDuplicate: () => void
}) {
  const { slug } = useFirm()
  if (q.state === 'draft') return null
  const decided = q.state === 'accepted' || q.state === 'rejected'
  const tone =
    q.state === 'accepted' ? 'border-success/40 bg-success/10' : q.state === 'rejected' ? 'border-destructive/30 bg-destructive/8' : q.expired ? 'border-warning/50 bg-warning/12' : 'border-primary/25 bg-primary/5'
  return (
    <div className={cn('mb-4 flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm md:flex-row md:items-center', tone)}>
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {decided && <LockIcon className="mt-0.5 size-4 shrink-0" />}
        <div className="min-w-0">
          {q.state === 'accepted' && (
            <p className="font-medium">
              Přijatá {fmtDateTime(q.decided_at)}
              {q.decided_by && ` · ${q.decided_by}`}
            </p>
          )}
          {q.state === 'rejected' && (
            <p className="font-medium">
              Odmítnutá {fmtDateTime(q.decided_at)}
              {q.decided_by && ` · ${q.decided_by}`}
            </p>
          )}
          {q.state === 'sent' && (
            <p className="font-medium">
              {q.expired ? `Platnost vypršela ${fmtDate(q.valid_until)} — zákazník už ji nemůže přijmout.` : `Odeslaná ${fmtDateTime(q.sent_at)}${q.sent_to ? ` na ${q.sent_to}` : ''}, čeká na zákazníka.`}
            </p>
          )}
          {q.reason && <p className="mt-0.5 text-muted-foreground">„{q.reason}“</p>}
          {decided && <p className="mt-0.5 text-xs text-muted-foreground">Rozhodnutou nabídku nelze měnit — změna = duplikovat, nebo upravit zakázku.</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {q.job_id && (
          <Button size="sm" nativeButton={false} render={<Link to="/a/$slug/jobs/$id" params={{ slug, id: String(q.job_id) }} />}>
            <HardHatIcon /> Otevřít zakázku
          </Button>
        )}
        {q.state === 'accepted' && !q.job_id && (
          <Button size="sm" onClick={onCreateJob}>
            <HardHatIcon /> Vytvořit zakázku
          </Button>
        )}
        {q.state === 'sent' && (
          <Button size="sm" variant="outline" onClick={onSend}>
            <SendIcon /> Poslat znovu
          </Button>
        )}
        {decided && !q.job_id && (
          <Button size="sm" variant="outline" onClick={onReopen}>
            <RotateCcwIcon /> Vrátit do rozpracovaných
          </Button>
        )}
        {decided && (
          <Button size="sm" variant="outline" onClick={onDuplicate}>
            <CopyIcon /> Duplikovat
          </Button>
        )}
      </div>
    </div>
  )
}

function QuoteMeta({ quote: q }: { quote: Quote }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
      <dt>Číslo</dt>
      <dd className="font-mono text-foreground">{q.number}</dd>
      <dt>Upraveno</dt>
      <dd>{fmtDateTime(q.updated_at)}</dd>
      {q.sent_at && (
        <>
          <dt>Odesláno</dt>
          <dd>
            {fmtDateTime(q.sent_at)}
            {q.sent_to && ` · ${q.sent_to}`}
          </dd>
        </>
      )}
      {q.state !== 'draft' && (
        <>
          <dt>Odkaz</dt>
          <dd className="truncate">
            <a href={q.public_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              stránka pro zákazníka
            </a>
          </dd>
        </>
      )}
    </dl>
  )
}
