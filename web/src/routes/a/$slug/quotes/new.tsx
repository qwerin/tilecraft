import { createFileRoute } from '@tanstack/react-router'
import { customerAddress, useCustomer } from '@/api/customers'
import { QuoteEditor } from '@/components/quotes/quote-editor'
import { useFirm } from '@/hooks/use-firm'

// Nové zaměření = nová nabídka (SPEC §5.1): zákazník → místnosti → položky → uložit.
type Search = { customer_id?: number }

export const Route = createFileRoute('/a/$slug/quotes/new')({
  validateSearch: (s: Record<string, unknown>): Search => {
    const v = typeof s.customer_id === 'string' ? Number(s.customer_id) : s.customer_id
    return { customer_id: typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined }
  },
  component: NewQuotePage,
})

function NewQuotePage() {
  const { slug } = useFirm()
  const { customer_id } = Route.useSearch()
  const customer = useCustomer(slug, customer_id)
  if (customer_id && customer.isPending) return null
  const c = customer.data
  return <QuoteEditor key={c?.id ?? 0} initialCustomer={c ? { id: c.id, name: c.name, phone: c.phone, email: c.email, address: customerAddress(c) } : null} />
}
