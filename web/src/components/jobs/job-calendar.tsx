import { Link } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { jobStateBar, type JobSummary } from '@/api/jobs'
import type { Member } from '@/api/types'
import { Button } from '@/components/ui/button'
import { fmtShort, fmtWeekday, parseDay, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CrewAvatars } from './crew'
import { JobStateBadge } from './job-state'
import { dayDiff, jobEnd, rangeTitle, shiftRange, type CalendarSpan } from './utils'

// Kalendář zakázek: na počítači časová osa (pruhy od start_on do end_on), na telefonu seznam po dnech.

const isWeekend = (d: string) => [0, 6].includes(parseDay(d).getDay())

/** Ovládání období: ← Dnes →, název, 2 týdny / Měsíc. */
export function CalendarNav({ at, span, onChange }: { at: string; span: CalendarSpan; onChange: (at: string, span: CalendarSpan) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" aria-label="Předchozí" onClick={() => onChange(shiftRange(at, span, -1), span)}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" onClick={() => onChange(today(), span)}>
          Dnes
        </Button>
        <Button variant="outline" size="icon" aria-label="Další" onClick={() => onChange(shiftRange(at, span, 1), span)}>
          <ChevronRightIcon />
        </Button>
      </div>
      <h2 className="flex-1 font-heading text-lg font-semibold first-letter:uppercase">{rangeTitle(at, span)}</h2>
      <div className="inline-flex rounded-lg bg-muted p-[3px] text-sm">
        {(['2w', 'month'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(at, s)}
            className={cn('h-9 rounded-md px-3 font-medium text-foreground/60 md:h-7', span === s && 'bg-background text-foreground shadow-sm')}
          >
            {s === '2w' ? '2 týdny' : 'Měsíc'}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Časová osa: sloupce = dny, pruhy zakázek rozložené do řádků, aby se nepřekrývaly. */
export function JobTimeline({ slug, jobs, days, members }: { slug: string; jobs: JobSummary[]; days: string[]; members: Member[] | undefined }) {
  const first = days[0]
  const last = days[days.length - 1]
  const t = today()
  const idx = (d: string) => dayDiff(first, d)
  const placed = jobs
    .filter((j) => j.start_on && j.start_on <= last && jobEnd(j) >= first)
    .sort((a, b) => a.start_on.localeCompare(b.start_on) || jobEnd(b).localeCompare(jobEnd(a)))
  const laneEnds: number[] = []
  const bars = placed.map((j) => {
    const s = Math.max(0, idx(j.start_on))
    const e = Math.min(days.length - 1, idx(jobEnd(j)))
    let lane = laneEnds.findIndex((end) => end < s)
    if (lane < 0) lane = laneEnds.push(e) - 1
    else laneEnds[lane] = e
    return { j, s, e, lane, clipStart: j.start_on < first, clipEnd: jobEnd(j) > last }
  })
  const lanes = Math.max(laneEnds.length, 3)
  const wide = days.length > 14
  const grid: CSSProperties = { gridTemplateColumns: `repeat(${days.length}, minmax(${wide ? '2.5rem' : '0'}, 1fr))` }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
      <div className={cn('grid', wide ? 'min-w-[72rem]' : 'min-w-[44rem]')} style={{ ...grid, gridTemplateRows: `auto repeat(${lanes}, 2.5rem)` }}>
        {days.map((d, i) => (
          <div
            key={d}
            style={{ gridColumn: i + 1, gridRow: 1 }}
            className={cn('border-b px-1 py-1.5 text-center text-xs', i > 0 && 'border-l', isWeekend(d) && 'bg-muted/50', d === t && 'bg-primary/10')}
          >
            <div className={cn('text-[10px] tracking-wide text-muted-foreground uppercase', d === t && 'font-semibold text-primary')}>{fmtWeekday(d)}</div>
            <div className={cn('font-medium tabular-nums', d === t && 'text-primary')}>{fmtShort(d)}</div>
          </div>
        ))}
        {days.map((d, i) => (
          <div
            key={`bg-${d}`}
            aria-hidden
            style={{ gridColumn: i + 1, gridRow: `2 / span ${lanes}` }}
            className={cn(i > 0 && 'border-l', isWeekend(d) && 'bg-muted/50', d === t && 'bg-primary/6')}
          />
        ))}
        {bars.map(({ j, s, e, lane, clipStart, clipEnd }) => (
          <Link
            key={j.id}
            to="/a/$slug/jobs/$id"
            params={{ slug, id: String(j.id) }}
            title={`${j.number} · ${j.title} · ${j.customer.name}`}
            style={{ gridColumn: `${s + 1} / ${e + 2}`, gridRow: lane + 2 }}
            className={cn(
              'z-10 m-1 flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md px-2 text-xs shadow-xs transition hover:brightness-95',
              jobStateBar[j.state],
              clipStart && 'rounded-l-none',
              clipEnd && 'rounded-r-none',
            )}
          >
            <CrewAvatars ids={j.worker_ids} members={members} max={3} size="size-5 text-[9px] ring-1" />
            <span className="truncate font-medium">{j.title}</span>
            <span className="truncate opacity-75 max-xl:hidden">{j.customer.name}</span>
          </Link>
        ))}
      </div>
      {placed.length === 0 && <p className="border-t px-3 py-6 text-center text-sm text-muted-foreground">V tomto období není naplánovaná žádná zakázka.</p>}
    </div>
  )
}

const dayFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' })

/** Seznam po dnech pro telefon: každý den zakázky, které na něm běží (vícedenní s „den 2/5“). */
export function JobAgenda({ slug, jobs, days, members }: { slug: string; jobs: JobSummary[]; days: string[]; members: Member[] | undefined }) {
  const t = today()
  const rows = days
    .map((d) => ({ d, items: jobs.filter((j) => j.start_on && j.start_on <= d && jobEnd(j) >= d) }))
    .filter((r) => r.items.length > 0 || r.d === t)
  if (rows.length === 0) return <p className="rounded-xl border bg-card px-3 py-10 text-center text-sm text-muted-foreground">V tomto období není naplánovaná žádná zakázka.</p>
  return (
    <div className="flex flex-col gap-4">
      {rows.map(({ d, items }) => (
        <section key={d}>
          <h3 className={cn('mb-1.5 flex items-center gap-2 text-sm font-semibold first-letter:uppercase', d === t && 'text-primary')}>
            {dayFmt.format(parseDay(d))}
            {d === t && <span className="rounded-full bg-primary px-2 text-[11px] text-primary-foreground">Dnes</span>}
          </h3>
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">Dnes není nic naplánováno.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((j) => (
                <AgendaCard key={j.id} slug={slug} job={j} day={d} members={members} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function AgendaCard({ slug, job: j, day, members }: { slug: string; job: JobSummary; day: string; members: Member[] | undefined }) {
  const total = dayDiff(j.start_on, jobEnd(j)) + 1
  const n = dayDiff(j.start_on, day) + 1
  return (
    <Link
      to="/a/$slug/jobs/$id"
      params={{ slug, id: String(j.id) }}
      className="flex gap-3 rounded-xl border bg-card p-3 text-sm shadow-xs active:bg-muted"
    >
      <span className={cn('w-1.5 shrink-0 rounded-full', jobStateBar[j.state])} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium">{j.title}</span>
          <JobStateBadge state={j.state} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">{j.customer.name}</span>
        {j.site_address && (
          <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPinIcon className="size-3 shrink-0" />
            {j.site_address}
          </span>
        )}
        <span className="mt-1.5 flex items-center justify-between gap-2">
          <CrewAvatars ids={j.worker_ids} members={members} />
          {total > 1 && <span className="text-xs text-muted-foreground tabular-nums">den {n} z {total}</span>}
        </span>
      </span>
    </Link>
  )
}
