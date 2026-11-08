import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useFirmMutation } from '@/api/queries'
import { invoiceApi } from '@/api/invoices'
import { PageHeader } from '@/components/common'
import { InvoiceEditor } from '@/components/invoices/invoice-editor'
import { buttonVariants } from '@/components/ui/button'
import { useFirm } from '@/hooks/use-firm'

type Search = { customer_id?: number; job_id?: number }
const posInt = (v: unknown) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

// Ruční faktura (bez zakázky nebo k ní); ze zakázky se fakturuje tlačítkem v detailu zakázky.
export const Route = createFileRoute('/a/$slug/invoices/new')({
  validateSearch: (s: Record<string, unknown>): Search => ({ customer_id: posInt(s.customer_id), job_id: posInt(s.job_id) }),
  component: NewInvoicePage,
})

function NewInvoicePage() {
  const { slug } = useFirm()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const create = useFirmMutation(slug, invoiceApi.create(slug), [['invoices'], ['jobs'], ['dashboard']])
  const back = () => void navigate({ to: '/a/$slug/invoices', params: { slug } })

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Nová faktura"
        description="Fakturu k zakázce vystavíte nejsnáz v detailu zakázky (řádky i zálohy se doplní samy)."
        actions={
          <Link to="/a/$slug/invoices" params={{ slug }} className={buttonVariants({ variant: 'ghost' })}>
            <ArrowLeftIcon /> Faktury
          </Link>
        }
      />
      <InvoiceEditor
        slug={slug}
        defaults={search}
        pending={create.isPending}
        onCancel={back}
        onSubmit={(body) =>
          create.mutate(body, {
            onSuccess: (inv) => {
              toast.success(`Faktura ${inv.number} vystavena`)
              void navigate({ to: '/a/$slug/invoices/$id', params: { slug, id: String(inv.id) }, replace: true })
            },
          })
        }
      />
    </div>
  )
}
