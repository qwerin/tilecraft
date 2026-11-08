import { createFileRoute } from '@tanstack/react-router'
import { useQuote } from '@/api/quotes'
import { EmptyState } from '@/components/common'
import { QuoteEditor } from '@/components/quotes/quote-editor'
import { useFirm } from '@/hooks/use-firm'
import { FileTextIcon } from 'lucide-react'

// Detail a úprava nabídky: zaměření, řádky, odeslání, rozhodnutí, zakázka (SPEC §5).
export const Route = createFileRoute('/a/$slug/quotes/$id')({ component: QuotePage })

function QuotePage() {
  const { slug } = useFirm()
  const id = Number(Route.useParams().id)
  const { data, isError } = useQuote(slug, id)
  if (isError) return <EmptyState icon={FileTextIcon} title="Nabídka nenalezena" description="Možná byla smazána." />
  if (!data) return null
  return <QuoteEditor key={data.id} quote={data} />
}
