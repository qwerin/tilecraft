import { useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { PlusIcon, ReceiptTextIcon, SearchIcon, XIcon } from 'lucide-react'
import { invoiceState, useInvoices, type InvoiceFilter, type InvoiceSummary } from '@/api/invoices'
import { CardList, DataTable, EmptyRow, EmptyState, NativeSelect, PageHeader, StatusBadge, cardClass } from '@/components/common'
import { Segmented } from '@/components/invoices/segmented'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GuideLink } from '@/components/guides/guide-link'
import { useFirm } from '@/hooks/use-firm'
import { fmtDate, money, plural } from '@/lib/format'
import { cn } from '@/lib/utils'

type State = '' | 'unpaid' | 'overdue' | 'paid'
type Kind = '' | 'invoice' | 'advance'
type Search = { state?: State; kind?: Kind; year?: number; q?: string; customer_id?: number; job_id?: number }

const states: State[] = ['', 'unpaid', 'overdue', 'paid']
const kinds: Kind[] = ['', 'invoice', 'advance']
const posInt = (v: unknown) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

export const Route = createFileRoute('/a/$slug/invoices/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    state: states.includes(s.state as State) && s.state ? (s.state as State) : undefined,
    kind: kinds.includes(s.kind as Kind) && s.kind ? (s.kind as Kind) : undefined,
    year: posInt(s.year),
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    customer_id: posInt(s.customer_id),
    job_id: posInt(s.job_id),
  }),
  component: InvoicesPage,
})

function InvoicesPage() {
  const { slug } = useFirm()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const setSearch = (patch: Partial<Search>) => void navigate({ search: (s) => ({ ...s, ...patch }), replace: true })

  // hledání: píše se do pole, do URL (a dotazu) až po krátké pauze
  const [q, setQ] = useState(search.q ?? '')
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? '') !== q.trim()) setSearch({ q: q.trim() || undefined })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const filter: InvoiceFilter = {
    state: search.state || undefined,
    kind: search.kind || undefined,
    year: search.year,
    q: search.q,
    customer_id: search.customer_id,
    job_id: search.job_id,
  }
  const { data, isPending } = useInvoices(slug, filter)
  const items = data?.items ?? []
  const total = items.reduce((a, i) => a + i.total, 0)
  const unpaid = items.filter((i) => !i.paid_on).reduce((a, i) => a + i.total, 0)
  const filtered = Object.values(filter).some((v) => v !== undefined)

  const thisYear = new Date().getFullYear()
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i)
  const scoped = items[0]?.customer.name

  const newButton = (
    <Link to="/a/$slug/invoices/new" params={{ slug }} className={buttonVariants()}>
      <PlusIcon /> Nová faktura
    </Link>
  )

  if (!isPending && !filtered && items.length === 0)
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Faktury" actions={<GuideLink topic="faktury" />} />
        <EmptyState
          icon={ReceiptTextIcon}
          title="Zatím žádné faktury"
          description="Fakturu nejsnáz vystavíte ze zakázky (záloha nebo konečná faktura). Můžete ji napsat i ručně."
          action={newButton}
        />
      </div>
    )

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Faktury"
        actions={
          <>
            <GuideLink topic="faktury" />
            {newButton}
          </>
        }
      >
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <Segmented
            className="w-full md:w-auto"
            value={search.state ?? ''}
            onChange={(v) => setSearch({ state: v || undefined })}
            options={[
              { value: '', label: 'Vše' },
              { value: 'unpaid', label: 'Neuhrazené' },
              { value: 'overdue', label: 'Po splatnosti' },
              { value: 'paid', label: 'Uhrazené' },
            ]}
          />
          <div className="flex gap-2">
            <Segmented
              className="flex-1 md:flex-none"
              value={search.kind ?? ''}
              onChange={(v) => setSearch({ kind: v || undefined })}
              options={[
                { value: '', label: 'Všechny' },
                { value: 'invoice', label: 'Faktury' },
                { value: 'advance', label: 'Zálohy' },
              ]}
            />
            <NativeSelect
              aria-label="Rok"
              className="w-32 [&_select]:h-11 md:[&_select]:h-8"
              value={search.year ?? ''}
              onChange={(e) => setSearch({ year: posInt(e.target.value) })}
            >
              <option value="">Všechny roky</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="relative md:ml-auto md:w-60">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Číslo nebo zákazník" className="h-11 pl-8 md:h-8" aria-label="Hledat" />
          </div>
        </div>
        {(search.customer_id || search.job_id) && (
          <div className="flex flex-wrap gap-2">
            {search.customer_id && (
              <FilterChip onClear={() => setSearch({ customer_id: undefined })}>Zákazník: {scoped ?? `#${search.customer_id}`}</FilterChip>
            )}
            {search.job_id && <FilterChip onClear={() => setSearch({ job_id: undefined })}>Jen faktury jedné zakázky</FilterChip>}
          </div>
        )}
      </PageHeader>

      {data && items.length > 0 && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm shadow-xs">
          <span className="text-muted-foreground">{plural(items.length, 'doklad', 'doklady', 'dokladů')}</span>
          <span>
            Celkem <b className="tabular-nums">{money(total)}</b>
          </span>
          {unpaid > 0 && search.state !== 'paid' && (
            <span>
              Neuhrazeno <b className="text-warning-foreground tabular-nums dark:text-warning">{money(unpaid)}</b>
            </span>
          )}
          {data.total > items.length && <span className="text-xs text-muted-foreground">Zobrazeno prvních {items.length} z {data.total}, zužte filtr.</span>}
        </div>
      )}

      <CardList empty={data && items.length === 0 ? 'Žádné faktury neodpovídají filtru.' : undefined}>
        {items.map((i) => (
          <Link key={i.id} to="/a/$slug/invoices/$id" params={{ slug, id: String(i.id) }} className={cn(cardClass, i.overdue && 'border-destructive/40')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  {i.number} <KindBadge i={i} />
                </div>
                <div className="truncate text-muted-foreground">{i.customer.name}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{money(i.total)}</div>
                <StateBadge i={i} />
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Vystaveno {fmtDate(i.issued_on)} · splatnost <span className={cn(i.overdue && 'font-medium text-destructive')}>{fmtDate(i.due_on)}</span>
            </div>
          </Link>
        ))}
      </CardList>

      <DataTable className="max-md:hidden">
        <thead>
          <tr>
            <th>Číslo</th>
            <th>Zákazník</th>
            <th>Vystaveno</th>
            <th>Splatnost</th>
            <th className="text-right!">Částka</th>
            <th>Stav</th>
          </tr>
        </thead>
        <tbody>
          {data && items.length === 0 && <EmptyRow cols={6}>Žádné faktury neodpovídají filtru.</EmptyRow>}
          {items.map((i) => (
            <tr key={i.id} className={cn('relative', i.overdue && 'bg-destructive/5')}>
              <td className="whitespace-nowrap">
                <Link to="/a/$slug/invoices/$id" params={{ slug, id: String(i.id) }} className="font-medium after:absolute after:inset-0 hover:underline">
                  {i.number}
                </Link>{' '}
                <KindBadge i={i} />
              </td>
              <td className="max-w-64 truncate">{i.customer.name}</td>
              <td className="whitespace-nowrap tabular-nums">{fmtDate(i.issued_on)}</td>
              <td className={cn('whitespace-nowrap tabular-nums', i.overdue && 'font-medium text-destructive')}>{fmtDate(i.due_on)}</td>
              <td className="text-right font-medium whitespace-nowrap tabular-nums">{money(i.total)}</td>
              <td>
                <StateBadge i={i} />
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  )
}

function KindBadge({ i }: { i: InvoiceSummary }) {
  if (i.kind !== 'advance') return null
  return (
    <StatusBadge tone="info" className="align-middle">
      Záloha{i.deducted ? ' · odečtena' : ''}
    </StatusBadge>
  )
}

function StateBadge({ i }: { i: InvoiceSummary }) {
  const st = invoiceState(i)
  return (
    <StatusBadge tone={st.tone}>
      {st.label}
      {i.paid_on && <span className="ml-1 font-normal">{fmtDate(i.paid_on)}</span>}
    </StatusBadge>
  )
}

function FilterChip({ onClear, children }: { onClear: () => void; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pr-1 pl-3 text-xs">
      {children}
      <Button variant="ghost" size="icon-xs" aria-label="Zrušit filtr" onClick={onClear}>
        <XIcon />
      </Button>
    </span>
  )
}
