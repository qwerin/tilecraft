import { useState } from 'react'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, BanknoteIcon, BriefcaseIcon, FileDownIcon, MailIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { useFirmMutation } from '@/api/queries'
import { invoiceApi, invoicePdfUrl, invoiceQuery, invoiceState, invoiceTitle, type Invoice } from '@/api/invoices'
import { Confirm, PageHeader, StatusBadge } from '@/components/common'
import { InvoiceDocument } from '@/components/invoices/invoice-document'
import { InvoiceEmailDialog, InvoicePaidDialog } from '@/components/invoices/invoice-dialogs'
import { InvoiceEditor } from '@/components/invoices/invoice-editor'
import { Button, buttonVariants } from '@/components/ui/button'
import { GuideLink } from '@/components/guides/guide-link'
import { useFirm } from '@/hooks/use-firm'
import { fmtDate, fmtDateTime } from '@/lib/format'

export const Route = createFileRoute('/a/$slug/invoices/$id')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(invoiceQuery(params.slug, Number(params.id))),
  component: InvoicePage,
})

function InvoicePage() {
  const { slug, account } = useFirm()
  const { id } = Route.useParams()
  const { data: inv } = useSuspenseQuery(invoiceQuery(slug, Number(id)))
  const [editing, setEditing] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [paying, setPaying] = useState(false)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const update = useFirmMutation(slug, invoiceApi.update(slug, inv.id), [['invoices'], ['jobs'], ['dashboard']])
  const remove = useMutation({
    mutationFn: invoiceApi.remove(slug, inv.id),
    onSuccess: async () => {
      await navigate({ to: '/a/$slug/invoices', params: { slug } })
      qc.removeQueries({ queryKey: [slug, 'invoices', inv.id] })
      await qc.invalidateQueries({ queryKey: [slug] })
      toast.success(`Faktura ${inv.number} smazána`)
    },
  })

  const st = invoiceState(inv)
  const unpaid = !inv.paid_on

  if (editing)
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={`Upravit ${inv.kind === 'advance' ? 'zálohovou fakturu' : 'fakturu'} ${inv.number}`} />
        <InvoiceEditor
          slug={slug}
          invoice={inv}
          pending={update.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(body) =>
            update.mutate(body, {
              onSuccess: () => {
                toast.success('Faktura uložena')
                setEditing(false)
              },
            })
          }
        />
      </div>
    )

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/a/$slug/invoices" params={{ slug }} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Faktury
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {invoiceTitle(inv).replace(' – daňový doklad', '')} {inv.number}
            <StatusBadge tone={st.tone}>
              {st.label}
              {inv.paid_on && <span className="ml-1 font-normal">{fmtDate(inv.paid_on)}</span>}
            </StatusBadge>
            {inv.kind === 'advance' && inv.deducted && <StatusBadge tone="info">Odečtena na faktuře</StatusBadge>}
          </span>
        }
        description={<InvoiceMeta inv={inv} slug={slug} />}
        actions={<GuideLink topic="faktury" />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={unpaid ? 'default' : 'outline'} onClick={() => setPaying(true)}>
          <BanknoteIcon /> {unpaid ? 'Zaplaceno' : 'Úhrada'}
        </Button>
        <a href={invoicePdfUrl(slug, inv.id)} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'outline' })}>
          <FileDownIcon /> PDF
        </a>
        <Button variant="outline" onClick={() => setEmailing(true)}>
          <MailIcon /> Odeslat e-mailem
        </Button>
        {unpaid && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon /> Upravit
          </Button>
        )}
        {unpaid && (
          <Confirm
            title={`Smazat fakturu ${inv.number}?`}
            description={
              <>
                Číslo {inv.number} zůstane v číselné řadě nevyužité — vznikne mezera v číslování dokladů. Mazat by se měly jen faktury
                vystavené omylem, které ještě neodešly zákazníkovi; jinak fakturu raději upravte.
                {inv.job_id && inv.kind === 'invoice' && ' Zakázka se vrátí do stavu Hotovo.'}
              </>
            }
            onConfirm={() => remove.mutateAsync().catch(() => undefined)}
            trigger={(open) => (
              <Button variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={open}>
                <Trash2Icon /> Smazat
              </Button>
            )}
          />
        )}
      </div>

      <InvoiceDocument inv={inv} firm={account} />

      {!inv.qr_payment && unpaid && inv.total > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          QR Platba se nezobrazuje: doplňte číslo účtu nebo IBAN v{' '}
          <Link to="/a/$slug/settings/company" params={{ slug }} className="underline">
            nastavení firmy
          </Link>
          .
        </p>
      )}

      <InvoiceEmailDialog slug={slug} inv={inv} open={emailing} onOpenChange={setEmailing} />
      <InvoicePaidDialog slug={slug} inv={inv} open={paying} onOpenChange={setPaying} />
    </div>
  )
}

function InvoiceMeta({ inv, slug }: { inv: Invoice; slug: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span>{inv.customer.name}</span>
      {inv.job_id && (
        <Link to="/a/$slug/jobs/$id" params={{ slug, id: String(inv.job_id) }} className="inline-flex items-center gap-1 text-primary hover:underline">
          <BriefcaseIcon className="size-3.5" /> Zakázka {inv.job_number}
        </Link>
      )}
      {inv.emailed_at ? (
        <span className="text-xs">
          Odesláno {fmtDateTime(inv.emailed_at)} na {inv.emailed_to}
        </span>
      ) : (
        <span className="text-xs">Zatím neodesláno</span>
      )}
    </span>
  )
}
