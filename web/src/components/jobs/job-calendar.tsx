import { Link } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon, MapPinIcon } from 'lucide-react'
import { jobStateBar, type JobSummary } from '@/api/jobs'
import type { Member } from '@/api/types'
import { Button } from '@/components/ui/button'
import { parseDay, today } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CrewAvatars } from './crew'
import { JobStateBadge } from './job-state'
import { dayDiff, jobEnd, monthGrid, monthTitle, shiftMonth } from './utils'

// Kalendář zakázek: klasická měsíční mřížka Po–Ne. Na počítači zakázky přímo ve dnech,
// na telefonu v buňce jen barevné značky a pod mřížkou zakázky vybraného dne.

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']
const MAX_IN_CELL = 3

const runsOn = (j: JobSummary, d: string) => !!j.start_on && j.start_on <= d && jobEnd(j) >= d

/** Ovládání měsíce: ← Dnes →, název měsíce. */
export function CalendarNav({ at, onChange }: { at: string; onChange: (at: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="flex-1 font-heading text-lg font-semibold first-letter:uppercase">{monthTitle(at)}</h2>
      <Button variant="outline" size="icon" aria-label="Předchozí měsíc" onClick={() => onChange(shiftMonth(at, -1))}>
        <ChevronLeftIcon />
      </Button>
      <Button variant="outline" onClick={() => onChange(today())}>
        Dnes
      </Button>
      <Button variant="outline" size="icon" aria-label="Další měsíc" onClick={() => onChange(shiftMonth(at, 1))}>
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

/** Měsíční mřížka; kliknutím na den se vybere (zakázky dne pod mřížkou). */
export function MonthCalendar({
  slug,
  jobs,
  at,
  selected,
  onSelect,
}: {
  slug: string
  jobs: JobSummary[]
  at: string
  selected: string
  onSelect: (day: string) => void
}) {
  const { month, weeks } = monthGrid(at)
  const t = today()
  const sorted = [...jobs].filter((j) => j.start_on).sort((a, b) => a.start_on.localeCompare(b.start_on) || a.id - b.id)
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn('py-1.5 text-center text-xs font-medium text-muted-foreground', i >= 5 && 'text-muted-foreground/70')}>
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((d, i) => {
            const items = sorted.filter((j) => runsOn(j, d))
            const other = d.slice(0, 7) !== month
            const isSel = d === selected
            return (
              <div
                key={d}
                role="button"
                tabIndex={0}
                aria-label={`${parseDay(d).getDate()}. – ${items.length} zakázek`}
                aria-pressed={isSel}
                onClick={() => onSelect(d)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(d)}
                className={cn(
                  'flex min-h-14 cursor-pointer flex-col gap-0.5 p-1 text-left outline-none md:min-h-28 md:p-1.5',
                  i > 0 && 'border-l',
                  i >= 5 && 'bg-muted/30',
                  other && 'bg-muted/50 text-muted-foreground/60',
                  isSel && 'bg-primary/10 ring-2 ring-primary ring-inset',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                )}
              >
                <span
                  className={cn(
                    'grid size-6 place-items-center self-center rounded-full text-xs font-medium tabular-nums md:self-start',
                    d === t && 'bg-primary text-primary-foreground',
                  )}
                >
                  {parseDay(d).getDate()}
                </span>
                {/* telefon: barevné značky */}
                <span className="flex flex-wrap justify-center gap-0.5 md:hidden">
                  {items.slice(0, 4).map((j) => (
                    <span key={j.id} className={cn('h-1.5 w-3 rounded-full', jobStateBar[j.state])} />
                  ))}
                </span>
                {/* počítač: názvy zakázek */}
                <span className="flex min-w-0 flex-col gap-0.5 max-md:hidden">
                  {items.slice(0, MAX_IN_CELL).map((j) => (
                    <Link
                      key={j.id}
                      to="/a/$slug/jobs/$id"
                      params={{ slug, id: String(j.id) }}
                      title={`${j.number} · ${j.title} · ${j.customer.name}`}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'truncate rounded px-1.5 py-0.5 text-[11px] leading-4 font-medium transition hover:brightness-95',
                        jobStateBar[j.state],
                        j.start_on < d && 'opacity-80',
                      )}
                    >
                      {j.start_on < d && '↳ '}
                      {j.title}
                    </Link>
                  ))}
                  {items.length > MAX_IN_CELL && (
                    <span className="px-1 text-[11px] text-muted-foreground">+ {items.length - MAX_IN_CELL} další</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const dayFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })

/** Zakázky vybraného dne (karty s adresou, partou a „den 2 z 5“). */
export function DayJobs({ slug, jobs, day, members }: { slug: string; jobs: JobSummary[]; day: string; members: Member[] | undefined }) {
  const items = jobs.filter((j) => runsOn(j, day))
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold first-letter:uppercase">
        {dayFmt.format(parseDay(day))}
        {day === today() && <span className="rounded-full bg-primary px-2 text-[11px] text-primary-foreground">Dnes</span>}
      </h3>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Na tento den není naplánovaná žádná zakázka.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((j) => (
            <DayCard key={j.id} slug={slug} job={j} day={day} members={members} />
          ))}
        </div>
      )}
    </section>
  )
}

function DayCard({ slug, job: j, day, members }: { slug: string; job: JobSummary; day: string; members: Member[] | undefined }) {
  const total = dayDiff(j.start_on, jobEnd(j)) + 1
  const n = dayDiff(j.start_on, day) + 1
  return (
    <Link to="/a/$slug/jobs/$id" params={{ slug, id: String(j.id) }} className="flex gap-3 rounded-xl border bg-card p-3 text-sm shadow-xs active:bg-muted">
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
          {total > 1 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              den {n} z {total}
            </span>
          )}
        </span>
      </span>
    </Link>
  )
}
