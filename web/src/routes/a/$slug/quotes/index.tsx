import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { FileTextIcon, RulerIcon, SearchIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useCustomer } from '@/api/customers'
import { useQuotes } from '@/api/quotes'
import { EmptyState, PageHeader, Pager } from '@/components/common'
import { QuoteList } from '@/components/quotes/quote-list'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GuideLink } from '@/components/guides/guide-link'
import { useFirm } from '@/hooks/use-firm'
import { cn } from '@/lib/utils'

// Seznam nabídek (SPEC §5): filtr podle stavu, hledání, zákazník; karty na telefonu, tabulka na PC.
const states = [
  { key: '', label: 'Vše' },
  { key: 'draft', label: 'Rozpracované' },
  { key: 'sent', label: 'Odeslané' },
  { key: 'accepted', label: 'Přijaté' },
  { key: 'rejected', label: 'Odmítnuté' },
] as const
type StateKey = (typeof states)[number]['key']
type Search = { state?: Exclude<StateKey, ''>; q?: string; customer_id?: number; page?: number }

const posInt = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined)

export const Route = createFileRoute('/a/$slug/quotes/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    state: states.some((x) => x.key && x.key === s.state) ? (s.state as Search['state']) : undefined,
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    customer_id: posInt(s.customer_id),
    page: (posInt(s.page) ?? 1) > 1 ? posInt(s.page) : undefined,
  }),
  component: QuotesPage,
})

function QuotesPage() {
  const { slug } = useFirm()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [q, setQ] = useState(search.q ?? '')
  const page = search.page ?? 1
  const { data } = useQuotes(slug, { state: search.state, q: search.q, customer_id: search.customer_id, page })
  const customer = useCustomer(slug, search.customer_id).data
  const setSearch = (p: Partial<Search>) => navigate({ search: (s) => ({ ...s, ...p, page: 'page' in p ? p.page : undefined }), replace: true })
  const filtered = !!(search.state || search.q || search.customer_id)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Nabídky"
        actions={
          <>
            <GuideLink topic="nabidka" />
            <Button nativeButton={false} render={<Link to="/a/$slug/quotes/new" params={{ slug }} search={{ customer_id: search.customer_id }} />}>
              <RulerIcon /> Nové zaměření
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0" role="tablist">
            {states.map((s) => {
              const active = (search.state ?? '') === s.key
              return (
                <button
                  key={s.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSearch({ state: s.key || undefined })}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
          <div className="relative md:ml-auto md:w-72">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setSearch({ q: e.target.value || undefined })
              }}
              placeholder="Číslo, název, zákazník…"
              className="pl-8"
            />
          </div>
        </div>
        {search.customer_id && (
          <span className="inline-flex items-center gap-1 self-start rounded-full bg-muted py-1 pr-1 pl-3 text-sm">
            Zákazník: {customer?.name ?? `#${search.customer_id}`}
            <button className="rounded-full p-0.5 hover:bg-background" aria-label="Zrušit filtr" onClick={() => setSearch({ customer_id: undefined })}>
              <XIcon className="size-3.5" />
            </button>
          </span>
        )}
      </PageHeader>

      {data && data.total === 0 && !filtered ? (
        <EmptyState
          icon={FileTextIcon}
          title="Zatím žádné nabídky"
          description="Nabídka začíná zaměřením: změřte místnosti na stavbě, doplňte položky z ceníku a pošlete zákazníkovi odkaz."
          action={
            <Button nativeButton={false} render={<Link to="/a/$slug/quotes/new" params={{ slug }} />}>
              <RulerIcon /> Nové zaměření
            </Button>
          }
        />
      ) : (
        <>
          <QuoteList slug={slug} items={data?.items} empty="Žádná nabídka neodpovídá filtru." />
          {data && <Pager page={page} perPage={data.per_page} total={data.total} onPage={(p) => setSearch({ page: p > 1 ? p : undefined })} />}
        </>
      )}
    </div>
  )
}
