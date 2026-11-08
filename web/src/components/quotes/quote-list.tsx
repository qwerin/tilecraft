import { Link, useNavigate } from '@tanstack/react-router'
import { HardHatIcon } from 'lucide-react'
import { quoteStateLabels, type QuoteSummary } from '@/api/quotes'
import { CardList, DataTable, EmptyRow, StatusBadge, cardClass, type BadgeTone } from '@/components/common'
import { fmtDate, money } from '@/lib/format'

const tones: Record<QuoteSummary['state'], BadgeTone> = { draft: 'neutral', sent: 'info', accepted: 'success', rejected: 'danger' }

/** Stav nabídky; odeslaná po platnosti = „Propadlá“. */
export function QuoteStateBadge({ state, expired }: { state: QuoteSummary['state']; expired?: boolean }) {
  if (state === 'sent' && expired) return <StatusBadge tone="warning">Propadlá</StatusBadge>
  return <StatusBadge tone={tones[state]}>{quoteStateLabels[state]}</StatusBadge>
}

/** Seznam nabídek: karty na telefonu, tabulka na počítači. `compact` = bez sloupce zákazníka (detail zákazníka). */
export function QuoteList({ slug, items, empty, compact }: { slug: string; items: QuoteSummary[] | undefined; empty: string; compact?: boolean }) {
  const navigate = useNavigate()
  const list = items ?? []
  const none = items && list.length === 0 ? empty : undefined
  return (
    <>
      <CardList empty={none}>
        {list.map((q) => (
          <Link key={q.id} to="/a/$slug/quotes/$id" params={{ slug, id: String(q.id) }} className={cardClass}>
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{q.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {q.number}
                  {!compact && ` · ${q.customer.name}`}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold tabular-nums">{money(q.total)}</span>
                <span className="mt-0.5 flex items-center justify-end gap-1">
                  {q.job_id && <HardHatIcon className="size-3.5 text-muted-foreground" aria-label="Má zakázku" />}
                  <QuoteStateBadge state={q.state} expired={q.expired} />
                </span>
              </span>
            </div>
          </Link>
        ))}
      </CardList>
      <DataTable className={compact ? 'max-md:hidden shadow-none' : 'max-md:hidden'}>
        <thead>
          <tr>
            <th className="w-24">Číslo</th>
            <th>Název</th>
            {!compact && <th>Zákazník</th>}
            <th className="w-28">Vystaveno</th>
            <th className="w-28">Platnost do</th>
            <th className="w-28">Stav</th>
            <th className="w-32 text-right!">Celkem</th>
          </tr>
        </thead>
        <tbody>
          {none && <EmptyRow cols={compact ? 6 : 7}>{none}</EmptyRow>}
          {list.map((q) => (
            <tr key={q.id} className="cursor-pointer" onClick={() => navigate({ to: '/a/$slug/quotes/$id', params: { slug, id: String(q.id) } })}>
              <td className="font-mono text-xs whitespace-nowrap">
                <Link to="/a/$slug/quotes/$id" params={{ slug, id: String(q.id) }} onClick={(e) => e.stopPropagation()}>
                  {q.number}
                </Link>
              </td>
              <td className="font-medium">{q.title}</td>
              {!compact && <td>{q.customer.name}</td>}
              <td className="tabular-nums">{fmtDate(q.issued_on)}</td>
              <td className="tabular-nums">{fmtDate(q.valid_until)}</td>
              <td>
                <span className="flex items-center gap-1">
                  <QuoteStateBadge state={q.state} expired={q.expired} />
                  {q.job_id && <HardHatIcon className="size-3.5 text-muted-foreground" aria-label="Má zakázku" />}
                </span>
              </td>
              <td className="text-right font-semibold tabular-nums whitespace-nowrap">{money(q.total)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  )
}
