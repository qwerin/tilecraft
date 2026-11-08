import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarDaysIcon, HardHatIcon, ListIcon, MapPinIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { jobStateBar, jobStateLabels, useJobs, type JobSummary } from '@/api/jobs'
import { useMembers } from '@/api/queries'
import type { Member } from '@/api/types'
import { GuideLink } from '@/components/guides/guide-link'
import { CardList, DataTable, EmptyRow, EmptyState, PageHeader, Pager, cardClass } from '@/components/common'
import { CrewAvatars } from '@/components/jobs/crew'
import { CalendarNav, DayJobs, MonthCalendar } from '@/components/jobs/job-calendar'
import { JobStateBadge } from '@/components/jobs/job-state'
import { jobTerm, monthGrid } from '@/components/jobs/utils'
import { Input } from '@/components/ui/input'
import { useFirm } from '@/hooks/use-firm'
import { money, today } from '@/lib/format'
import { cn } from '@/lib/utils'

// Zakázky (SPEC §6): seznam se záložkami podle stavu a hledáním, nebo měsíční kalendář (vybraný den v `at`).
// Parťák vidí totéž bez cen.

const search = z.object({
  view: z.enum(['list', 'calendar']).optional().catch(undefined),
  state: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  page: z.number().int().positive().optional().catch(undefined),
  at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
})

export const Route = createFileRoute('/a/$slug/jobs/')({
  validateSearch: search,
  component: JobsPage,
})

const tabs = [
  { value: 'open', label: 'Otevřené' },
  { value: 'planned', label: 'Domluvené' },
  { value: 'in_progress', label: 'Probíhá' },
  { value: 'done', label: 'Hotové' },
  { value: 'invoiced', label: 'Vyfakturované' },
  { value: 'cancelled', label: 'Zrušené' },
  { value: 'all', label: 'Vše' },
] as const

const PER_PAGE = 50

function JobsPage() {
  const { slug, isManager } = useFirm()
  const s = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const view = s.view ?? 'list'
  const state = s.state ?? 'open'
  const members = useMembers(slug).data ?? undefined
  const set = (patch: Partial<z.infer<typeof search>>) => void navigate({ search: (old) => ({ ...old, ...patch }), replace: true })

  return (
    <div className="mx-auto flex max-w-6xl flex-col">
      <PageHeader
        title="Zakázky"
        description={isManager ? 'Z přijatých nabídek; termíny, parta, fotky a deník.' : 'Kde se pracuje, fotky a deník.'}
        actions={
          <div className="flex items-center gap-2">
            <GuideLink topic="zakazka" />
            <div className="inline-flex rounded-lg bg-muted p-[3px] text-sm">
              {(
                [
                  ['list', 'Seznam', ListIcon],
                  ['calendar', 'Kalendář', CalendarDaysIcon],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => set({ view: v === 'list' ? undefined : v, page: undefined })}
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-md px-3 font-medium text-foreground/60 md:h-7',
                    view === v && 'bg-background text-foreground shadow-sm',
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <div className="inline-flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() =>
                    set({
                      state: t.value === 'open' ? undefined : t.value,
                      page: undefined,
                    })
                  }
                  className={cn(
                    'h-9 rounded-full border px-3 text-sm whitespace-nowrap transition-colors md:h-8',
                    state === t.value ? 'border-foreground bg-foreground text-background' : 'bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <SearchBox value={s.q ?? ''} onChange={(q) => set({ q: q || undefined, page: undefined })} />
        </div>
      </PageHeader>

      {view === 'calendar' ? (
        <CalendarView
          slug={slug}
          state={state}
          q={s.q}
          at={s.at ?? today()}
          members={members}
          onSelect={(at) => set({ at: at === today() ? undefined : at })}
        />
      ) : (
        <ListView slug={slug} state={state} q={s.q} page={s.page ?? 1} members={members} isManager={isManager} onPage={(page) => set({ page })} />
      )}
    </div>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setText(value)
  }
  useEffect(() => {
    if (text === value) return
    const t = setTimeout(() => onChange(text.trim()), 300)
    return () => clearTimeout(t)
  }, [text, value, onChange])
  return (
    <div className="relative md:ml-auto md:w-64">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Hledat zakázku, zákazníka, adresu" className="pl-8" />
    </div>
  )
}

function ListView({
  slug,
  state,
  q,
  page,
  members,
  isManager,
  onPage,
}: {
  slug: string
  state: string
  q?: string
  page: number
  members: Member[] | undefined
  isManager: boolean
  onPage: (p: number) => void
}) {
  const { data, isPending } = useJobs(slug, {
    state: state === 'all' ? undefined : state,
    q,
    page,
    per_page: PER_PAGE,
  })
  const items = data?.items ?? []
  const empty = !isPending && items.length === 0

  if (empty && !q && state === 'open')
    return (
      <EmptyState
        icon={HardHatIcon}
        title="Žádné otevřené zakázky"
        description={isManager ? 'Zakázka vznikne z přijaté nabídky tlačítkem „Vytvořit zakázku“.' : 'Až kancelář domluví zakázku, uvidíte ji tady.'}
      />
    )

  const emptyText = q ? 'Nic nenalezeno.' : 'Žádné zakázky v tomto stavu.'
  return (
    <>
      <CardList empty={empty ? emptyText : undefined}>
        {items.map((j) => (
          <JobCard key={j.id} slug={slug} job={j} members={members} isManager={isManager} />
        ))}
      </CardList>
      <DataTable className="max-md:hidden">
        <thead>
          <tr>
            <th className="w-24">Číslo</th>
            <th>Zakázka</th>
            <th>Adresa stavby</th>
            <th>Termín</th>
            <th>Parta</th>
            <th>Stav</th>
            {isManager && <th className="text-right">Celkem</th>}
          </tr>
        </thead>
        <tbody>
          {empty && <EmptyRow cols={isManager ? 7 : 6}>{emptyText}</EmptyRow>}
          {items.map((j) => (
            <tr key={j.id} className={cn(j.state === 'cancelled' && 'text-muted-foreground')}>
              <td className="font-mono text-xs whitespace-nowrap">{j.number}</td>
              <td>
                <Link to="/a/$slug/jobs/$id" params={{ slug, id: String(j.id) }} className="font-medium hover:underline">
                  {j.title}
                </Link>
                <div className="text-xs text-muted-foreground">{j.customer.name}</div>
              </td>
              <td className="max-w-56 truncate text-muted-foreground">{j.site_address}</td>
              <td className={cn('whitespace-nowrap', !j.start_on && 'text-muted-foreground')}>{jobTerm(j)}</td>
              <td>
                <CrewAvatars ids={j.worker_ids} members={members} />
              </td>
              <td>
                <JobStateBadge state={j.state} />
              </td>
              {isManager && <td className="text-right whitespace-nowrap tabular-nums">{money(j.total)}</td>}
            </tr>
          ))}
        </tbody>
      </DataTable>
      {data && <Pager page={page} perPage={PER_PAGE} total={data.total} onPage={onPage} />}
    </>
  )
}

function JobCard({ slug, job: j, members, isManager }: { slug: string; job: JobSummary; members: Member[] | undefined; isManager: boolean }) {
  return (
    <Link to="/a/$slug/jobs/$id" params={{ slug, id: String(j.id) }} className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{j.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {j.number} · {j.customer.name}
          </div>
        </div>
        <JobStateBadge state={j.state} />
      </div>
      {j.site_address && (
        <div className="mt-1.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPinIcon className="size-3 shrink-0" /> {j.site_address}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={cn('text-xs', j.start_on ? 'font-medium' : 'text-muted-foreground')}>{jobTerm(j)}</span>
        <span className="flex items-center gap-2">
          <CrewAvatars ids={j.worker_ids} members={members} />
          {isManager && <span className="text-sm font-semibold tabular-nums">{money(j.total)}</span>}
        </span>
      </div>
    </Link>
  )
}

function CalendarView({
  slug,
  state,
  q,
  at,
  members,
  onSelect,
}: {
  slug: string
  state: string
  q?: string
  at: string
  members: Member[] | undefined
  onSelect: (day: string) => void
}) {
  const { from, to } = monthGrid(at)
  // „Otevřené“ v kalendáři ukazuje i vyfakturované (proběhlé) zakázky, jen ne zrušené
  const calState = state === 'open' || state === 'all' ? 'planned,in_progress,done,invoiced' : state
  const { data } = useJobs(slug, {
    state: calState,
    q,
    from,
    to,
    per_page: 300,
  })
  const unscheduled = useJobs(slug, { state: 'planned', q, per_page: 100 }).data?.items.filter((j) => !j.start_on) ?? []
  const jobs = data?.items ?? []
  return (
    <div className="flex flex-col gap-4">
      <CalendarNav at={at} onChange={onSelect} />
      <div>
        <MonthCalendar slug={slug} jobs={jobs} at={at} selected={at} onSelect={onSelect} />
        <Legend />
      </div>
      <DayJobs slug={slug} jobs={jobs} day={at} members={members} />
      {unscheduled.length > 0 && (state === 'open' || state === 'planned' || state === 'all') && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Bez termínu</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduled.map((j) => (
              <JobCard key={j.id} slug={slug} job={j} members={members} isManager={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {(['planned', 'in_progress', 'done', 'invoiced'] as const).map((st) => (
        <span key={st} className="flex items-center gap-1.5">
          <span className={cn('h-3 w-6 rounded-sm', jobStateBar[st])} />
          {jobStateLabels[st]}
        </span>
      ))}
    </div>
  )
}
