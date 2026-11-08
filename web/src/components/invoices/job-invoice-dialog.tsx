// Vystavení faktury ze zakázky (SPEC §7): zálohová (část ceny) nebo konečná (řádky zakázky − zálohy).
import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { useFirmMutation } from '@/api/queries'
import { advanceFromPercent, invoiceApi, type JobInvoiceInput } from '@/api/invoices'
import type { components } from '@/api/schema.gen'
import { FormRow } from '@/components/common'
import { DateInput } from '@/components/date-input'
import { Segmented } from '@/components/invoices/segmented'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { fmtDate, money, toMinor, today } from '@/lib/format'

type Job = components['schemas']['Job']

export function JobInvoiceDialog({
  slug,
  job,
  open,
  onOpenChange,
  defaultKind,
}: {
  slug: string
  job: Job
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Předvolený druh (tlačítko „Zálohová faktura“ / „Vyfakturovat“); bez něj podle stavu zakázky. */
  defaultKind?: JobInvoiceInput['kind']
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <JobInvoiceForm slug={slug} job={job} defaultKind={defaultKind} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function JobInvoiceForm({ slug, job, defaultKind, onDone }: { slug: string; job: Job; defaultKind?: JobInvoiceInput['kind']; onDone: () => void }) {
  const navigate = useNavigate()
  const invoices = job.invoices ?? []
  const hasFinal = invoices.some((i) => i.kind === 'invoice')
  const advances = invoices.filter((i) => i.kind === 'advance' && !i.deducted)
  const total = job.totals?.total ?? job.total

  const [kind, setKind] = useState<JobInvoiceInput['kind']>(
    defaultKind === 'invoice' && hasFinal ? 'advance' : (defaultKind ?? (hasFinal || advances.length === 0 ? 'advance' : 'invoice')),
  )
  const [mode, setMode] = useState<'percent' | 'amount'>('percent')
  const [percent, setPercent] = useState('50')
  const [amount, setAmount] = useState('')
  const [summary, setSummary] = useState(false)
  const [issued, setIssued] = useState(today())

  const pct = Number(percent.replace(',', '.'))
  const advance = mode === 'percent' ? (Number.isFinite(pct) ? advanceFromPercent(total, pct) : 0) : (toMinor(amount) ?? 0)
  const advanceOk = advance > 0 && (mode === 'amount' || (pct > 0 && pct <= 100))

  const create = useFirmMutation(slug, invoiceApi.fromJob(slug, job.id))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const body: JobInvoiceInput =
      kind === 'advance'
        ? {
            kind,
            issued_on: issued || undefined,
            ...(mode === 'percent' ? { percent: pct } : { amount: advance }),
          }
        : { kind, issued_on: issued || undefined, summary }
    create.mutate(body, {
      onSuccess: (inv) => {
        toast.success(`${inv.kind === 'advance' ? 'Zálohová faktura' : 'Faktura'} ${inv.number} vystavena`)
        onDone()
        void navigate({
          to: '/a/$slug/invoices/$id',
          params: { slug, id: String(inv.id) },
        })
      },
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Vystavit fakturu</DialogTitle>
        <DialogDescription>
          Zakázka {job.number} — {job.title}, celkem {money(total)}.
        </DialogDescription>
      </DialogHeader>

      <Segmented
        className="w-full"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'advance', label: 'Zálohová faktura' },
          { value: 'invoice', label: 'Konečná faktura' },
        ]}
      />

      {kind === 'advance' ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">Výzva k platbě části ceny předem (není daňový doklad). Při konečné faktuře se odečte.</p>
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'percent', label: 'Procentem' },
              { value: 'amount', label: 'Částkou' },
            ]}
          />
          {mode === 'percent' ? (
            <FormRow label="Kolik procent z ceny zakázky" htmlFor="adv-pct">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-28">
                  <Input id="adv-pct" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} className="pr-7" />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                {[30, 50].map((p) => (
                  <Button key={p} type="button" variant={percent === String(p) ? 'secondary' : 'outline'} size="sm" onClick={() => setPercent(String(p))}>
                    {p} %
                  </Button>
                ))}
              </div>
            </FormRow>
          ) : (
            <FormRow label="Částka zálohy (Kč)" htmlFor="adv-amount">
              <Input
                id="adv-amount"
                inputMode="decimal"
                value={amount}
                placeholder="např. 20000"
                onChange={(e) => setAmount(e.target.value)}
                className="w-40"
              />
            </FormRow>
          )}
          <div className="flex items-baseline justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Záloha k úhradě</span>
            <span className="text-base font-semibold tabular-nums">{advanceOk ? money(advance) : '—'}</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {hasFinal && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">Zakázka už konečnou fakturu má.</p>}
          <FormRow label="Položky faktury">
            <Segmented
              size="sm"
              value={summary ? 'summary' : 'lines'}
              onChange={(v) => setSummary(v === 'summary')}
              options={[
                { value: 'lines', label: 'Rozepsat po položkách' },
                { value: 'summary', label: 'Souhrnně po sekcích' },
              ]}
            />
          </FormRow>
          <p className="text-xs text-muted-foreground">
            {summary
              ? 'Jeden řádek za Práci, Materiál a Ostatní (např. „Práce — Koupelna (zakázka ZA26001)“).'
              : 'Každý řádek zakázky s cenou bude řádkem faktury; položky „dodá zákazník“ se vynechají.'}
          </p>
          {advances.length > 0 ? (
            <div className="rounded-lg border px-3 py-2 text-sm">
              <p className="mb-1 font-medium">Zálohy</p>
              <ul className="flex flex-col gap-0.5">
                {advances.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span>
                      {a.number}{' '}
                      <span className={a.paid_on ? 'text-muted-foreground' : 'text-warning-foreground dark:text-warning'}>
                        ({a.paid_on ? `zaplaceno ${fmtDate(a.paid_on)}` : 'nezaplacená — neodečte se'})
                      </span>
                    </span>
                    <span className={a.paid_on ? 'tabular-nums' : 'text-muted-foreground tabular-nums line-through'}>−{money(a.total)}</span>
                  </li>
                ))}
              </ul>
              {advances.some((a) => !a.paid_on) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Odečítají se jen zaplacené zálohy. Nezaplacenou zálohu nejdřív označte jako uhrazenou, nebo ji zákazník doplatí zvlášť.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Zakázka nemá žádné zálohy k odečtení.</p>
          )}
          <p className="text-xs text-muted-foreground">Po vystavení se zakázka přepne do stavu Vyfakturováno.</p>
        </div>
      )}

      <FormRow label="Datum vystavení" htmlFor="inv-issued" hint="Splatnost se dopočítá podle nastavení firmy.">
        <DateInput id="inv-issued" value={issued} onChange={setIssued} className="w-44" />
      </FormRow>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Zrušit
        </Button>
        <Button type="submit" disabled={create.isPending || (kind === 'advance' ? !advanceOk : hasFinal)}>
          Vystavit
        </Button>
      </DialogFooter>
    </form>
  )
}
