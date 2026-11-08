import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2Icon, ClockIcon, FileDownIcon, FileTextIcon, GlobeIcon, MailIcon, MapPinIcon, PhoneIcon, ThumbsDownIcon, ThumbsUpIcon, XCircleIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { publicDecide, publicQuotePdfUrl, usePublicQuote, type PublicQuote } from '@/api/quotes'
import { EmptyState, FormRow } from '@/components/common'
import { RoomSketch } from '@/components/doc-editor/room-sketch'
import { hasSketch } from '@/components/doc-editor/sketch-layout'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { fmtDate, fmtDateTime, money, num, unitLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

// Veřejný odkaz pro zákazníka (bez přihlášení): nabídka v podobě tisku, PDF a přijetí / odmítnutí (SPEC §5.4).
export const Route = createFileRoute('/n/$token')({ component: PublicQuotePage })

type Line = PublicQuote['lines'][number]
const sectionTitles = { work: 'Práce', material: 'Materiál', other: 'Ostatní' } as const

function PublicQuotePage() {
  const { token } = Route.useParams()
  const { data: q, isPending, isError } = usePublicQuote(token)
  const [deciding, setDeciding] = useState<'accepted' | 'rejected' | null>(null)
  const [thanks, setThanks] = useState<'accepted' | 'rejected' | null>(null)

  if (isPending)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  if (isError || !q)
    return (
      <Shell>
        <EmptyState icon={FileTextIcon} title="Nabídka nenalezena" description="Odkaz je neplatný nebo nabídka už není k dispozici. Kontaktujte prosím firmu, která vám ji poslala." />
      </Shell>
    )

  const vat = q.firm.vat_payer
  return (
    <Shell firm={q.firm}>
      <div className="flex flex-col gap-5 pb-36">
        {thanks && <ThankYou state={thanks} firm={q.firm} />}
        {!thanks && <StatusBanner q={q} />}

        <article className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <header className="border-b px-5 pt-5 pb-4 sm:px-8 sm:pt-7">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Cenová nabídka {q.number}</p>
            <h1 className="mt-1 font-heading text-2xl leading-tight font-semibold sm:text-3xl">{q.title}</h1>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <Fact label="Pro">{q.customer.name}</Fact>
              {q.site_address && <Fact label="Místo">{q.site_address}</Fact>}
              <Fact label="Vystaveno">{fmtDate(q.issued_on)}</Fact>
              <Fact label="Platí do">{fmtDate(q.valid_until)}</Fact>
            </dl>
          </header>

          {q.intro && <p className="border-b px-5 py-4 text-sm whitespace-pre-line sm:px-8">{q.intro}</p>}

          <div className="flex flex-col gap-6 px-5 py-5 sm:px-8">
            {(['work', 'material', 'other'] as const).map((sec) => {
              const lines = q.lines.filter((l) => l.section === sec)
              if (lines.length === 0) return null
              const subtotal = sec === 'work' ? q.totals.work : sec === 'material' ? q.totals.material : q.totals.other
              return (
                <section key={sec}>
                  <div className="mb-1 flex items-baseline justify-between border-b-2 border-foreground/80 pb-1">
                    <h2 className="font-heading text-lg font-semibold">{sectionTitles[sec]}</h2>
                    <span className="text-sm font-semibold tabular-nums">{money(subtotal)}</span>
                  </div>
                  <ul className="divide-y">
                    {lines.map((l, i) => (
                      <LineItem key={i} l={l} />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>

          <div className="border-t bg-muted/40 px-5 py-4 sm:px-8">
            <dl className="ml-auto flex max-w-sm flex-col gap-1 text-sm">
              {q.totals.discount > 0 && (
                <>
                  <Row label="Součet">{money(q.totals.subtotal)}</Row>
                  <Row label="Sleva">−{money(q.totals.discount)}</Row>
                </>
              )}
              {vat && (
                <>
                  <Row label="Základ bez DPH">{money(q.totals.base)}</Row>
                  <Row label={`DPH ${q.totals.vat_rate} %`}>{money(q.totals.vat)}</Row>
                </>
              )}
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t pt-2">
                <dt className="font-semibold">{vat ? 'Celkem s DPH' : 'Celkem'}</dt>
                <dd className="font-heading text-2xl font-semibold tabular-nums">{money(q.totals.total)}</dd>
              </div>
              {!vat && <p className="text-right text-xs text-muted-foreground">Nejsem plátce DPH.</p>}
            </dl>
          </div>

          {q.measurements && q.rooms.length > 0 && <Measurements q={q} />}

          {(q.note || q.terms) && (
            <div className="flex flex-col gap-4 border-t px-5 py-5 text-sm sm:px-8">
              {q.note && (
                <div>
                  <h3 className="mb-1 font-semibold">Poznámka</h3>
                  <p className="whitespace-pre-line text-muted-foreground">{q.note}</p>
                </div>
              )}
              {q.terms && (
                <div>
                  <h3 className="mb-1 font-semibold">Podmínky</h3>
                  <p className="whitespace-pre-line text-muted-foreground">{q.terms}</p>
                </div>
              )}
            </div>
          )}
        </article>

        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="lg" nativeButton={false} render={<a href={publicQuotePdfUrl(token)} target="_blank" rel="noreferrer" />}>
            <FileDownIcon /> Stáhnout PDF
          </Button>
        </div>

        <FirmCard firm={q.firm} />
      </div>

      {q.can_decide && !thanks && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_oklch(0_0_0/0.25)] backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1 max-sm:hidden">
              <p className="text-xs text-muted-foreground">{vat ? 'Celkem s DPH' : 'Celkem'}</p>
              <p className="font-heading text-xl font-semibold tabular-nums">{money(q.totals.total)}</p>
            </div>
            <Button size="lg" variant="outline" className="flex-1 sm:flex-none" onClick={() => setDeciding('rejected')}>
              <ThumbsDownIcon /> Odmítám
            </Button>
            <Button size="lg" className="flex-[2] sm:flex-none sm:px-6" onClick={() => setDeciding('accepted')}>
              <ThumbsUpIcon /> Přijímám nabídku
            </Button>
          </div>
        </div>
      )}

      {deciding && (
        <DecideDialog
          token={token}
          q={q}
          state={deciding}
          onClose={() => setDeciding(null)}
          onDone={(s) => {
            setDeciding(null)
            setThanks(s)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      )}
    </Shell>
  )
}

function Shell({ firm, children }: { firm?: PublicQuote['firm']; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {firm ? (
            <>
              {firm.logo ? (
                <img src={firm.logo} alt={firm.name} className="max-h-12 max-w-40 object-contain" />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary font-heading text-lg font-semibold text-primary-foreground">
                  {firm.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-heading font-semibold">{firm.name}</p>
                {firm.phone && (
                  <a href={`tel:${firm.phone.replace(/\s/g, '')}`} className="text-xs text-muted-foreground hover:underline">
                    {firm.phone}
                  </a>
                )}
              </div>
            </>
          ) : (
            <Logo />
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-3 py-5 sm:px-4 sm:py-8">{children}</main>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  )
}

function LineItem({ l }: { l: Line }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{l.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {num(l.quantity)} {unitLabel(l.unit)} × {money(l.unit_price)}
          {l.discount > 0 && !l.customer_supplied && <span className="text-success"> − {num(l.discount)} %</span>}
        </p>
        {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
      </div>
      <span className="shrink-0 text-right font-semibold whitespace-nowrap tabular-nums">
        {l.customer_supplied ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">dodá zákazník</span> : money(l.amount)}
      </span>
    </li>
  )
}

function Measurements({ q }: { q: PublicQuote }) {
  const m = q.measurements!
  const sum = (s: { floor: number; wall: number; perimeter: number; length: number; pieces: number }) =>
    [
      s.floor ? `podlahy ${num(s.floor)} m²` : '',
      s.wall ? `stěny ${num(s.wall)} m²` : '',
      s.length ? `délky ${num(s.length)} bm` : '',
      s.pieces ? `${num(s.pieces)} ks` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  const kindLabel: Record<string, string> = { floor: 'Podlaha', wall: 'Stěna', length: 'Délka', piece: 'Kusy' }
  return (
    <details className="group border-t px-5 py-4 sm:px-8">
      <summary className="cursor-pointer list-none font-semibold select-none">
        <span className="inline-flex items-center gap-2">
          Zaměření <span className="text-xs font-normal text-muted-foreground group-open:hidden">— zobrazit</span>
        </span>
        <span className="block text-xs font-normal text-muted-foreground">{sum(m.total)}</span>
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {q.rooms.map((r, i) => (
          <div key={i}>
            <p className="text-sm font-semibold">{r.name}</p>
            {hasSketch(r) && <RoomSketch room={r} className="mt-1" />}
            <ul className="mt-1 text-sm">
              {(r.surfaces ?? []).map((s, j) => {
                const area = m.surfaces[i]?.[j] ?? 0
                const dims =
                  s.kind === 'piece'
                    ? `${num(s.count || 1)} ks`
                    : s.kind === 'length'
                      ? `${num(s.width)} m${(s.count ?? 0) > 1 ? ` × ${s.count}` : ''}`
                      : s.area != null
                        ? `${num(s.area)} m²`
                        : `${num(s.width)} × ${num(s.height)} m${(s.count ?? 0) > 1 ? ` × ${s.count}` : ''}`
                return (
                  <li key={j} className="flex justify-between gap-3 border-b border-dashed py-1 last:border-b-0">
                    <span>
                      {s.name || kindLabel[s.kind]} <span className="text-xs text-muted-foreground">{dims}</span>
                      {(s.deductions ?? []).length > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          odečteno: {(s.deductions ?? []).map((d) => `${d.name || 'otvor'} ${num(d.width)} × ${num(d.height)}`).join(', ')}
                        </span>
                      )}
                    </span>
                    {(s.kind === 'floor' || s.kind === 'wall') && <span className="shrink-0 tabular-nums">{num(area)} m²</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}

function StatusBanner({ q }: { q: PublicQuote }) {
  if (q.state === 'accepted')
    return (
      <Banner tone="success" icon={CheckCircle2Icon} title="Nabídka je přijatá">
        {q.decided_by ? `${q.decided_by}, ` : ''}
        {fmtDateTime(q.decided_at)}. Děkujeme, ozveme se s termínem.
      </Banner>
    )
  if (q.state === 'rejected')
    return (
      <Banner tone="muted" icon={XCircleIcon} title="Nabídka byla odmítnuta">
        {q.decided_by ? `${q.decided_by}, ` : ''}
        {fmtDateTime(q.decided_at)}.
      </Banner>
    )
  if (q.expired)
    return (
      <Banner tone="warning" icon={ClockIcon} title="Platnost nabídky vypršela">
        Nabídka platila do {fmtDate(q.valid_until)}. Pokud o práci stále máte zájem, ozvěte se prosím — připravíme aktuální nabídku.
      </Banner>
    )
  return null
}

function Banner({ tone, icon: Icon, title, children }: { tone: 'success' | 'warning' | 'muted'; icon: typeof ClockIcon; title: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl border px-4 py-3.5',
        tone === 'success' && 'border-success/40 bg-success/10',
        tone === 'warning' && 'border-warning/50 bg-warning/15',
        tone === 'muted' && 'bg-card',
      )}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', tone === 'success' && 'text-success')} />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

function ThankYou({ state, firm }: { state: 'accepted' | 'rejected'; firm: PublicQuote['firm'] }) {
  const ok = state === 'accepted'
  return (
    <div className={cn('flex flex-col items-center rounded-2xl border px-5 py-8 text-center', ok ? 'border-success/40 bg-success/10' : 'bg-card')}>
      {ok ? <CheckCircle2Icon className="size-12 text-success" /> : <XCircleIcon className="size-12 text-muted-foreground" />}
      <h2 className="mt-3 font-heading text-2xl font-semibold">{ok ? 'Děkujeme, nabídka je přijatá!' : 'Děkujeme za odpověď'}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {ok
          ? `${firm.name} dostal zprávu a ozve se vám s termínem zahájení prací.`
          : `${firm.name} dostal vaši odpověď. Kdybyste si to rozmysleli, stačí se ozvat.`}
      </p>
    </div>
  )
}

function FirmCard({ firm }: { firm: PublicQuote['firm'] }) {
  return (
    <div className="rounded-2xl border bg-card px-5 py-4 text-sm">
      <p className="font-semibold">{firm.name}</p>
      <ul className="mt-2 flex flex-col gap-1.5 text-muted-foreground">
        {firm.phone && (
          <li className="flex items-center gap-2">
            <PhoneIcon className="size-4" />
            <a href={`tel:${firm.phone.replace(/\s/g, '')}`} className="hover:underline">
              {firm.phone}
            </a>
          </li>
        )}
        {firm.email && (
          <li className="flex items-center gap-2">
            <MailIcon className="size-4" />
            <a href={`mailto:${firm.email}`} className="hover:underline">
              {firm.email}
            </a>
          </li>
        )}
        {firm.web && (
          <li className="flex items-center gap-2">
            <GlobeIcon className="size-4" />
            <a href={firm.web.startsWith('http') ? firm.web : `https://${firm.web}`} target="_blank" rel="noreferrer" className="hover:underline">
              {firm.web}
            </a>
          </li>
        )}
        {firm.address && (
          <li className="flex items-center gap-2">
            <MapPinIcon className="size-4" /> {firm.address}
          </li>
        )}
        {(firm.registration_no || firm.vat_no) && (
          <li className="text-xs">
            {firm.registration_no && `IČO ${firm.registration_no}`}
            {firm.registration_no && firm.vat_no && ' · '}
            {firm.vat_no && `DIČ ${firm.vat_no}`}
          </li>
        )}
      </ul>
    </div>
  )
}

function DecideDialog({
  token,
  q,
  state,
  onClose,
  onDone,
}: {
  token: string
  q: PublicQuote
  state: 'accepted' | 'rejected'
  onClose: () => void
  onDone: (s: 'accepted' | 'rejected') => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(q.customer.name)
  const [reason, setReason] = useState('')
  const decide = useMutation({
    mutationFn: publicDecide(token),
    onSuccess: (res) => {
      qc.setQueryData(['public-quote', token], res)
      onDone(state)
    },
  })
  const ok = state === 'accepted'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            decide.mutate({ state, name: name.trim(), reason: reason.trim() || undefined })
          }}
        >
          <DialogHeader>
            <DialogTitle>{ok ? 'Přijmout nabídku' : 'Odmítnout nabídku'}</DialogTitle>
            <DialogDescription>
              {ok ? (
                <>
                  Potvrzujete nabídku <strong>{q.number}</strong> na <strong>{money(q.totals.total)}</strong>. {q.firm.name} dostane zprávu a ozve se s termínem.
                </>
              ) : (
                <>Dejte prosím vědět, proč nabídku odmítáte — pomůže nám to. Napsat důvod není povinné.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <FormRow label="Vaše jméno" htmlFor="dec-name">
            <Input id="dec-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </FormRow>
          <FormRow label={ok ? 'Vzkaz (nepovinné)' : 'Důvod (nepovinné)'} htmlFor="dec-reason">
            <Textarea
              id="dec-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={ok ? 'Např. kdy se vám hodí začít…' : 'Např. cena, termín…'}
            />
          </FormRow>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Zpět
            </Button>
            <Button type="submit" variant={ok ? 'default' : 'destructive'} disabled={!name.trim() || decide.isPending}>
              {ok ? <ThumbsUpIcon /> : <ThumbsDownIcon />} {ok ? 'Přijímám nabídku' : 'Odmítám nabídku'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
