import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangleIcon, CheckCircle2Icon, ClockIcon, CopyIcon, FileDownIcon, FileTextIcon, GlobeIcon, MailIcon, PhoneIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { invoiceTitle, publicInvoicePdfUrl, usePublicInvoice, type PublicInvoice } from '@/api/invoices'
import { EmptyState } from '@/components/common'
import { InvoiceDocument } from '@/components/invoices/invoice-document'
import { Logo } from '@/components/logo'
import { QrCode } from '@/components/qr-code'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { fmtDate, money } from '@/lib/format'
import { cn } from '@/lib/utils'

// Veřejný odkaz na fakturu pro zákazníka (bez přihlášení): stav úhrady, QR Platba, PDF a doklad v podobě tisku (SPEC §7).
export const Route = createFileRoute('/f/$token')({ component: PublicInvoicePage })

type Firm = PublicInvoice['firm']

function PublicInvoicePage() {
  const { token } = Route.useParams()
  const { data: inv, isPending, isError } = usePublicInvoice(token)

  if (isPending)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  if (isError || !inv)
    return (
      <Shell>
        <EmptyState
          icon={FileTextIcon}
          title="Faktura nenalezena"
          description="Odkaz je neplatný nebo faktura už není k dispozici. Kontaktujte prosím firmu, která vám ji poslala."
        />
      </Shell>
    )

  const title = invoiceTitle(inv)
  const toPay = !inv.paid_on && inv.total > 0
  return (
    <Shell firm={inv.firm}>
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            {title} {inv.number}
          </p>
          <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">{money(inv.total)}</p>
        </div>

        <PaymentState inv={inv} />

        {toPay && <PayCard inv={inv} />}

        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="lg" nativeButton={false} render={<a href={publicInvoicePdfUrl(token)} target="_blank" rel="noreferrer" />}>
            <FileDownIcon /> Stáhnout PDF
          </Button>
        </div>

        <InvoiceDocument inv={inv} firm={inv.firm} />

        <FirmCard firm={inv.firm} />
      </div>
    </Shell>
  )
}

function PaymentState({ inv }: { inv: PublicInvoice }) {
  if (inv.paid_on)
    return (
      <Banner tone="success" icon={CheckCircle2Icon} title="Uhrazeno">
        Platba přijata {fmtDate(inv.paid_on)}. Děkujeme!
      </Banner>
    )
  if (inv.total <= 0)
    return (
      <Banner tone="muted" icon={CheckCircle2Icon} title="Nic k úhradě">
        Částka je pokrytá zaplacenou zálohou.
      </Banner>
    )
  if (inv.overdue)
    return (
      <Banner tone="danger" icon={AlertTriangleIcon} title="Po splatnosti">
        Faktura byla splatná {fmtDate(inv.due_on)}. Pokud jste už platili, děkujeme a omlouváme se — platba se může připisovat pár dní.
      </Banner>
    )
  return (
    <Banner tone="warning" icon={ClockIcon} title={`K úhradě do ${fmtDate(inv.due_on)}`}>
      {inv.kind === 'advance' ? 'Zálohová faktura — výzva k platbě zálohy před zahájením prací.' : 'Zaplatit můžete QR kódem nebo převodem podle údajů níže.'}
    </Banner>
  )
}

function PayCard({ inv }: { inv: PublicInvoice }) {
  const account = inv.firm.bank_account || inv.firm.iban
  return (
    <section className="flex flex-col items-center gap-5 rounded-2xl border bg-card px-5 py-6 sm:flex-row sm:items-start sm:px-8">
      {inv.qr_payment && (
        <div className="flex flex-col items-center gap-2">
          <QrCode value={inv.qr_payment} label={`QR Platba faktury ${inv.number}`} className="w-64 max-w-full p-1 ring-1 ring-black/10 sm:w-56" />
          <p className="max-w-64 text-center text-xs text-muted-foreground">Naskenujte v mobilní aplikaci své banky (QR Platba).</p>
        </div>
      )}
      <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Platební údaje</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <PayRow label="Částka" value={money(inv.total)} copy={(inv.total / 100).toFixed(2).replace('.', ',')} strong />
          {account && <PayRow label={inv.firm.bank_account ? 'Číslo účtu' : 'IBAN'} value={account} copy={account} strong />}
          {inv.firm.bank_account && inv.firm.iban && <PayRow label="IBAN" value={inv.firm.iban} copy={inv.firm.iban} />}
          <PayRow label="Variabilní symbol" value={inv.vs} copy={inv.vs} strong />
          <PayRow label="Splatnost" value={fmtDate(inv.due_on)} />
        </dl>
        {!account && <p className="text-xs text-muted-foreground">Číslo účtu vám sdělí firma, která fakturu vystavila.</p>}
      </div>
    </section>
  )
}

function PayRow({ label, value, copy, strong }: { label: string; value: string; copy?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed pb-2 last:border-b-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className={cn('truncate tabular-nums', strong && 'font-semibold')}>{value}</span>
        {copy && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            title={`Kopírovat: ${label.toLowerCase()}`}
            aria-label={`Kopírovat: ${label.toLowerCase()}`}
            onClick={() =>
              navigator.clipboard.writeText(copy).then(
                () => toast.success('Zkopírováno'),
                () => toast.error('Kopírování se nepovedlo'),
              )
            }
          >
            <CopyIcon className="size-4" />
          </Button>
        )}
      </dd>
    </div>
  )
}

function Banner({ tone, icon: Icon, title, children }: { tone: 'success' | 'warning' | 'danger' | 'muted'; icon: typeof ClockIcon; title: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl border px-4 py-3.5',
        tone === 'success' && 'border-success/40 bg-success/10',
        tone === 'warning' && 'border-warning/50 bg-warning/15',
        tone === 'danger' && 'border-destructive/40 bg-destructive/10',
        tone === 'muted' && 'bg-card',
      )}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', tone === 'success' && 'text-success', tone === 'danger' && 'text-destructive')} />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

function Shell({ firm, children }: { firm?: Firm; children: ReactNode }) {
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
      <main className="mx-auto max-w-3xl px-3 py-5 pb-12 sm:px-4 sm:py-8">{children}</main>
    </div>
  )
}

function FirmCard({ firm }: { firm: Firm }) {
  return (
    <div className="rounded-2xl border bg-card px-5 py-4 text-sm">
      <p className="font-semibold">Dotazy k faktuře: {firm.name}</p>
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
      </ul>
    </div>
  )
}
