import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { Job, JobLine } from '@/api/jobs'
import { Panel, StatusBadge } from '@/components/common'
import { RoomSketch } from '@/components/doc-editor/room-sketch'
import { hasSketch } from '@/components/doc-editor/sketch-layout'
import { money, num, qty } from '@/lib/format'
import { cn } from '@/lib/utils'

// Položky, zaměření a srovnání s nabídkou na detailu zakázky (jen ke čtení). Parťák nevidí žádné ceny.

const sections = [
  { key: 'work', label: 'Práce' },
  { key: 'material', label: 'Materiál' },
  { key: 'other', label: 'Ostatní' },
] as const

const measureLabels: Record<string, string> = {
  floor: 'podlahy',
  wall: 'stěny',
  area: 'podlahy + stěny',
  perimeter: 'obvod',
  length: 'délky',
  piece: 'kusy',
}

export function JobLines({ job, isManager, actions }: { job: Job; isManager: boolean; actions?: ReactNode }) {
  const groups = sections.map((s) => ({ ...s, lines: job.lines.filter((l) => l.section === s.key) })).filter((g) => g.lines.length > 0)
  return (
    <Panel id="polozky" title="Položky" actions={actions}>
      {groups.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Zakázka nemá žádné položky.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full text-sm [&_td]:px-4 [&_td]:py-1.5 [&_th]:px-4 [&_th]:py-1.5">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left font-medium">Položka</th>
                <th className="text-right font-medium">Množství</th>
                {isManager && (
                  <>
                    <th className="text-right font-medium max-sm:hidden">Cena/j.</th>
                    <th className="text-right font-medium max-sm:hidden">Sleva</th>
                    <th className="text-right font-medium">Částka</th>
                  </>
                )}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key}>
                <tr>
                  <td colSpan={isManager ? 5 : 2} className="bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {g.label}
                  </td>
                </tr>
                {g.lines.map((l) => (
                  <LineRow key={l.id} line={l} isManager={isManager} />
                ))}
                {isManager && (
                  <tr className="border-t">
                    <td colSpan={4} className="text-right text-xs text-muted-foreground">
                      {g.label} celkem
                    </td>
                    <td className="text-right font-medium tabular-nums">{money(job.totals[g.key])}</td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}
      {isManager && groups.length > 0 && <Totals job={job} />}
    </Panel>
  )
}

function LineRow({ line: l, isManager }: { line: JobLine; isManager: boolean }) {
  return (
    <tr className="border-t border-border/60 align-top">
      <td>
        <div className={cn(l.customer_supplied && 'text-muted-foreground')}>{l.name}</div>
        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          {l.measure && (
            <span>
              ze zaměření: {measureLabels[l.measure] ?? l.measure}
              {l.rooms.length > 0 && ` (${l.rooms.join(', ')})`}
              {l.waste > 0 && ` + ${num(l.waste)} % prořez`}
            </span>
          )}
          {l.customer_supplied && <StatusBadge tone="outline">dodá zákazník</StatusBadge>}
          {l.note && <span className="w-full">{l.note}</span>}
        </div>
      </td>
      <td className="text-right whitespace-nowrap tabular-nums">{qty(l.quantity, l.unit)}</td>
      {isManager && (
        <>
          <td className="text-right whitespace-nowrap tabular-nums max-sm:hidden">{money(l.unit_price)}</td>
          <td className="text-right whitespace-nowrap text-muted-foreground tabular-nums max-sm:hidden">{l.discount ? `−${num(l.discount)} %` : ''}</td>
          <td className="text-right whitespace-nowrap tabular-nums">{l.customer_supplied ? '0 Kč' : money(l.amount)}</td>
        </>
      )}
    </tr>
  )
}

function Totals({ job }: { job: Job }) {
  const t = job.totals
  return (
    <dl className="mt-3 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t pt-3 text-sm">
      {t.discount > 0 && (
        <>
          <dt className="text-muted-foreground">Mezisoučet</dt>
          <dd className="text-right tabular-nums">{money(t.subtotal)}</dd>
          <dt className="text-muted-foreground">Sleva {num(job.discount)} %</dt>
          <dd className="text-right tabular-nums">−{money(t.discount)}</dd>
        </>
      )}
      {t.vat_rate > 0 && (
        <>
          <dt className="text-muted-foreground">Základ</dt>
          <dd className="text-right tabular-nums">{money(t.base)}</dd>
          <dt className="text-muted-foreground">DPH {t.vat_rate} %</dt>
          <dd className="text-right tabular-nums">{money(t.vat)}</dd>
        </>
      )}
      <dt className="font-semibold">Celkem</dt>
      <dd className="text-right text-base font-semibold tabular-nums">{money(t.total)}</dd>
    </dl>
  )
}

/** Souhrn zaměření po místnostech (jen sloupce, které mají nějakou hodnotu). */
export function JobMeasurements({ job }: { job: Job }) {
  const m = job.measurements
  if (m.rooms.length === 0) return null
  const sketched = (job.rooms ?? []).filter(hasSketch)
  const cols = (
    [
      { key: 'floor', label: 'Podlahy', unit: 'm2' },
      { key: 'wall', label: 'Stěny', unit: 'm2' },
      { key: 'perimeter', label: 'Obvod', unit: 'bm' },
      { key: 'length', label: 'Délky', unit: 'bm' },
      { key: 'pieces', label: 'Kusy', unit: 'ks' },
    ] as const
  ).filter((c) => m.total[c.key] > 0)
  return (
    <Panel id="zamereni" title="Zaměření">
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full text-sm [&_td]:px-4 [&_td]:py-1.5 [&_th]:px-4 [&_th]:py-1.5">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="text-left font-medium">Místnost</th>
              {cols.map((c) => (
                <th key={c.key} className="text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rooms.map((r, i) => (
              <tr key={i} className="border-t border-border/60">
                <td>{r.name}</td>
                {cols.map((c) => (
                  <td key={c.key} className="text-right whitespace-nowrap tabular-nums">
                    {r[c.key] ? qty(r[c.key], c.unit) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {m.rooms.length > 1 && (
              <tr className="border-t font-semibold">
                <td>Celkem</td>
                {cols.map((c) => (
                  <td key={c.key} className="text-right whitespace-nowrap tabular-nums">
                    {qty(m.total[c.key], c.unit)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sketched.length > 0 && (
        <details open className="group mt-3 border-t pt-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground select-none hover:text-foreground">
            Náčrt <span className="font-normal group-open:hidden">— zobrazit</span>
          </summary>
          <div className="mt-2 grid gap-4 lg:grid-cols-2">
            {sketched.map((r, i) => (
              <div key={i} className="min-w-0">
                {sketched.length > 1 && <p className="mb-1 text-sm font-semibold">{r.name}</p>}
                <RoomSketch room={r} />
              </div>
            ))}
          </div>
        </details>
      )}
    </Panel>
  )
}

/** Skutečnost (řádky zakázky) proti přijaté nabídce. */
export function QuoteComparison({ slug, job }: { slug: string; job: Job }) {
  const q = job.quote as Job['quote'] | null
  if (!q) return null
  const rows: { label: string; a: number; b: number; strong?: boolean }[] = [...sections.map((s) => ({ label: s.label, a: q.totals[s.key], b: job.totals[s.key] })), { label: 'Celkem', a: q.totals.total, b: job.totals.total, strong: true }]
  return (
    <Panel
      id="srovnani"
      title="Srovnání s nabídkou"
      actions={
        <Link to="/a/$slug/quotes/$id" params={{ slug, id: String(q.id) }} className="text-xs text-primary hover:underline">
          Nabídka {q.number}
        </Link>
      }
    >
      <table className="w-full text-sm [&_td]:py-1 [&_th]:py-1">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th />
            <th className="text-right font-medium">Nabídka</th>
            <th className="text-right font-medium">Skutečnost</th>
            <th className="text-right font-medium">Rozdíl</th>
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((r) => r.a || r.b || r.strong)
            .map((r) => {
              const d = r.b - r.a
              return (
                <tr key={r.label} className={cn(r.strong && 'border-t font-semibold')}>
                  <td>{r.label}</td>
                  <td className="text-right tabular-nums">{money(r.a)}</td>
                  <td className="text-right tabular-nums">{money(r.b)}</td>
                  <td className="text-right tabular-nums">
                    {d === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={cn('rounded px-1', d > 0 ? 'bg-success/15 text-success' : 'bg-destructive/12 text-destructive')}>
                        {d > 0 ? '+' : '−'}
                        {money(Math.abs(d))}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
        </tbody>
      </table>
      {job.totals.total !== q.totals.total && (
        <p className="mt-2 text-xs text-muted-foreground">
          {job.totals.total > q.totals.total ? 'Vícepráce nebo víc materiálu než v nabídce.' : 'Méně práce nebo materiálu než v nabídce.'} Fakturuje se podle skutečnosti.
        </p>
      )}
    </Panel>
  )
}
