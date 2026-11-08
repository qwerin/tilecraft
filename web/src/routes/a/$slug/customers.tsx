import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ContactIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { useCustomers } from '@/api/customers'
import { CardList, DataTable, EmptyRow, EmptyState, PageHeader, Pager, cardClass } from '@/components/common'
import { CustomerFormDialog } from '@/components/customers/customer-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFirm } from '@/hooks/use-firm'

// Zákazníci (SPEC §3): hledání, založení; detail na /customers/$id.
type Search = { q?: string; page?: number }

export const Route = createFileRoute('/a/$slug/customers')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    page: typeof s.page === 'number' && s.page > 1 ? s.page : undefined,
  }),
  component: CustomersPage,
})

function CustomersPage() {
  const { slug } = useFirm()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [q, setQ] = useState(search.q ?? '')
  const [creating, setCreating] = useState(false)
  const page = search.page ?? 1
  const { data } = useCustomers(slug, search.q ?? '', page)
  const items = data?.items ?? []
  const setSearch = (p: Partial<Search>) => navigate({ search: (s) => ({ ...s, ...p }), replace: true })
  const open = (id: number) => navigate({ to: '/a/$slug/customers/$id', params: { slug, id: String(id) } })

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Zákazníci"
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon /> Nový zákazník
          </Button>
        }
      >
        <div className="relative max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setSearch({ q: e.target.value || undefined, page: undefined })
            }}
            placeholder="Hledat jméno, telefon, e-mail, obec…"
            className="pl-8"
          />
        </div>
      </PageHeader>

      {data && data.total === 0 && !search.q ? (
        <EmptyState
          icon={ContactIcon}
          title="Zatím žádní zákazníci"
          description="Zákazníka založíte tady, nebo rovnou při novém zaměření."
          action={
            <Button onClick={() => setCreating(true)}>
              <PlusIcon /> Nový zákazník
            </Button>
          }
        />
      ) : (
        <>
          <CardList empty={data && items.length === 0 ? 'Nikoho jsme nenašli.' : undefined}>
            {items.map((c) => (
              <Link key={c.id} to="/a/$slug/customers/$id" params={{ slug, id: String(c.id) }} className={cardClass}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.quotes > 0 && <span className="text-xs text-muted-foreground">{c.quotes} nab.</span>}
                </div>
                <p className="text-xs text-muted-foreground">{[c.phone, c.city].filter(Boolean).join(' · ') || c.email}</p>
              </Link>
            ))}
          </CardList>
          <DataTable className="max-md:hidden">
            <thead>
              <tr>
                <th>Jméno / firma</th>
                <th>Telefon</th>
                <th>E-mail</th>
                <th>Obec</th>
                <th className="text-right!">Nabídky</th>
                <th className="text-right!">Zakázky</th>
                <th className="text-right!">Faktury</th>
              </tr>
            </thead>
            <tbody>
              {data && items.length === 0 && <EmptyRow cols={7}>Nikoho jsme nenašli.</EmptyRow>}
              {items.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => open(c.id)}>
                  <td className="font-medium">
                    <Link to="/a/$slug/customers/$id" params={{ slug, id: String(c.id) }} onClick={(e) => e.stopPropagation()}>
                      {c.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">{c.phone}</td>
                  <td>{c.email}</td>
                  <td>{c.city}</td>
                  <td className="text-right tabular-nums">{c.quotes || ''}</td>
                  <td className="text-right tabular-nums">{c.jobs || ''}</td>
                  <td className="text-right tabular-nums">{c.invoices || ''}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {data && <Pager page={page} perPage={data.per_page} total={data.total} onPage={(p) => setSearch({ page: p > 1 ? p : undefined })} />}
        </>
      )}
      {creating && <CustomerFormDialog slug={slug} onSaved={(c) => open(c.id)} onClose={() => setCreating(false)} />}
    </div>
  )
}
