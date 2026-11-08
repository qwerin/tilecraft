import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BanknoteIcon,
  CalendarDaysIcon,
  FileCheckIcon,
  FileTextIcon,
  HardHatIcon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
  PlusIcon,
  ReceiptTextIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useDashboard, type Dashboard as DashboardData } from '@/api/dashboard'
import { invoiceState } from '@/api/invoices'
import { mapsUrl, telHref, type JobSummary } from '@/api/jobs'
import { meQuery, useMembers } from '@/api/queries'
import type { components } from '@/api/schema.gen'
import type { Member } from '@/api/types'
import { StatusBadge } from '@/components/common'
import { CrewAvatars } from '@/components/jobs/crew'
import { JobStateBadge } from '@/components/jobs/job-state'
import { jobEnd, jobTerm } from '@/components/jobs/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useFirm } from '@/hooks/use-firm'
import { addDays, fmtDate, money, plural, today } from '@/lib/format'
import { cn } from '@/lib/utils'

// Přehled (SPEC §8). Vlastník/kancelář: čísla (neuhrazeno, po splatnosti, měsíc), zakázky, otevřené nabídky
// a neuhrazené faktury; na telefonu nahoře velké „+ Nové zaměření“. Parťák: jen dnešní a nejbližší zakázky.

export const Route = createFileRoute('/a/$slug/')({ component: Dashboard })

type QuoteSummary = components['schemas']['QuoteSummary']

function greeting() {
  const h = new Date().getHours()
  return h < 10 ? 'Dobré ráno' : h < 18 ? 'Dobrý den' : 'Dobrý večer'
}

const dayLong = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })

function Dashboard() {
  const { slug, account, isManager } = useFirm()
  const me = useQuery(meQuery).data
  const first = (me?.name || '').split(' ')[0]
  const { data } = useDashboard(slug)
  const members = useMembers(slug).data ?? undefined

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {dayLong.format(new Date())}
          <span className="max-lg:hidden"> · {account.name}</span>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting()}
          {first && `, ${first}`}
        </h1>
      </div>
      {isManager ? <ManagerDashboard slug={slug} data={data} members={members} /> : <WorkerDashboard slug={slug} data={data} members={members} />}
    </div>
  )
}

/* ---------- vlastník a kancelář ---------- */

function ManagerDashboard({ slug, data, members }: { slug: string; data: DashboardData | undefined; members: Member[] | undefined }) {
  return (
    <>
      <Link
        to="/a/$slug/quotes/new"
        params={{ slug }}
        className="tile-grid flex items-center gap-4 rounded-2xl bg-primary p-5 text-primary-foreground shadow-md transition [--grout:oklch(1_0_0/9%)] [--tile:22px] active:scale-[0.99] md:hidden"
      >
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary-foreground/15">
          <PlusIcon className="size-7" strokeWidth={2.5} />
        </span>
        <span>
          <span className="block font-heading text-xl font-semibold">Nové zaměření</span>
          <span className="text-sm text-primary-foreground/80">Změřit místnosti a připravit nabídku</span>
        </span>
      </Link>

      <Kpis slug={slug} data={data} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <JobsSection slug={slug} jobs={data?.upcoming_jobs} members={members} />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <QuotesSection slug={slug} quotes={data?.open_quotes} />
          <InvoicesSection slug={slug} data={data} />
        </div>
      </div>
    </>
  )
}

function Kpis({ slug, data }: { slug: string; data: DashboardData | undefined }) {
  if (!data)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    )
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi icon={ReceiptTextIcon} label="Neuhrazeno" value={money(data.unpaid_total)} hint={plural(data.unpaid_invoices.length, 'faktura', 'faktury', 'faktur')} />
      <Kpi
        icon={AlertTriangleIcon}
        label="Po splatnosti"
        value={money(data.overdue_total)}
        tone={data.overdue_total > 0 ? 'danger' : undefined}
        hint={data.overdue_total > 0 ? 'Připomeňte se zákazníkům' : 'Vše v termínu'}
      />
      <Kpi
        icon={BanknoteIcon}
        label="Tento měsíc"
        value={money(data.month_invoiced)}
        hint={
          <>
            vyfakturováno · uhrazeno <b className="font-semibold text-foreground">{money(data.month_paid)}</b>
          </>
        }
      />
      <Link to="/a/$slug/quotes" params={{ slug }} className="contents">
        <Kpi
          icon={FileCheckIcon}
          label="Přijaté bez zakázky"
          value={String(data.accepted_quotes)}
          tone={data.accepted_quotes > 0 ? 'primary' : undefined}
          hint={data.accepted_quotes > 0 ? 'Naplánujte zakázku' : 'Vše naplánováno'}
          link
        />
      </Link>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  link,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: ReactNode
  tone?: 'danger' | 'primary'
  link?: boolean
}) {
  return (
    <div
      className={cn(
        'relative flex min-h-28 flex-col justify-between gap-2 overflow-hidden rounded-2xl border bg-card p-4 shadow-xs',
        tone === 'danger' && 'border-destructive/40 bg-destructive/6',
        tone === 'primary' && 'border-primary/40 bg-primary/6',
        link && 'transition hover:-translate-y-0.5 hover:shadow-md',
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={cn('size-4', tone === 'danger' ? 'text-destructive' : 'text-primary')} />
        {label}
      </div>
      <div>
        <div className={cn('font-heading text-2xl font-semibold tracking-tight tabular-nums lg:text-[1.65rem]', tone === 'danger' && 'text-destructive')}>{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, to, slug, count, children }: { title: string; icon: LucideIcon; to: string; slug: string; count?: number; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        {!!count && <span className="rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">{count}</span>}
        <Link to={to} params={{ slug }} className="ml-auto flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          Vše <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
      {children}
    </section>
  )
}

const rowList = 'flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs'
const rowLink = 'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/40 active:bg-muted'

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed bg-card/60 px-3 py-6 text-center text-sm text-muted-foreground">{children}</p>
}

function ListSkeleton() {
  return <Skeleton className="h-36 rounded-xl" />
}

/** Zakázky: probíhající, tento a příští týden, bez termínu. */
function JobsSection({ slug, jobs, members }: { slug: string; jobs: JobSummary[] | undefined; members: Member[] | undefined }) {
  const groups = groupJobs(jobs ?? [])
  return (
    <Section title="Zakázky" icon={HardHatIcon} to="/a/$slug/jobs" slug={slug} count={jobs?.length}>
      {!jobs ? (
        <ListSkeleton />
      ) : jobs.length === 0 ? (
        <Empty>Na nejbližší dva týdny nic naplánováno.</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.label}>
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</h3>
              <ul className={rowList}>
                {g.jobs.map((j) => (
                  <li key={j.id}>
                    <Link to="/a/$slug/jobs/$id" params={{ slug, id: String(j.id) }} className={rowLink}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{j.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {j.customer.name}
                          {j.site_address && ` · ${j.site_address}`}
                        </span>
                      </span>
                      <CrewAvatars ids={j.worker_ids} members={members} max={3} className="max-sm:hidden" />
                      <span className="flex flex-col items-end gap-0.5 text-right">
                        <span className="text-xs whitespace-nowrap">{jobTerm(j)}</span>
                        <JobStateBadge state={j.state} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function groupJobs(jobs: JobSummary[]) {
  const t = today()
  const nextWeek = addDays(t, 7 - ((new Date().getDay() + 6) % 7) + 6) // neděle příštího týdne
  const running = jobs.filter((j) => j.state === 'in_progress' || (j.start_on && j.start_on <= t && jobEnd(j) >= t))
  const rest = jobs.filter((j) => !running.includes(j))
  return [
    { label: 'Právě probíhá', jobs: running },
    { label: 'Tento a příští týden', jobs: rest.filter((j) => j.start_on && j.start_on <= nextWeek) },
    { label: 'Později', jobs: rest.filter((j) => j.start_on && j.start_on > nextWeek) },
    { label: 'Bez termínu', jobs: rest.filter((j) => !j.start_on) },
  ].filter((g) => g.jobs.length > 0)
}

/** Rozpracované a odeslané nabídky; propadající do týdne zvýrazněné. */
function QuotesSection({ slug, quotes }: { slug: string; quotes: QuoteSummary[] | undefined }) {
  const soon = addDays(today(), 7)
  return (
    <Section title="Otevřené nabídky" icon={FileTextIcon} to="/a/$slug/quotes" slug={slug} count={quotes?.length}>
      {!quotes ? (
        <ListSkeleton />
      ) : quotes.length === 0 ? (
        <Empty>Žádné rozpracované ani odeslané nabídky.</Empty>
      ) : (
        <ul className={rowList}>
          {quotes.slice(0, 8).map((q) => {
            const expiring = q.state === 'sent' && !q.expired && q.valid_until <= soon
            return (
              <li key={q.id}>
                <Link to="/a/$slug/quotes/$id" params={{ slug, id: String(q.id) }} className={cn(rowLink, (expiring || q.expired) && 'bg-warning/8')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{q.title || q.customer.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {q.number} · {q.customer.name}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="tabular-nums">{money(q.total)}</span>
                    {q.expired ? (
                      <StatusBadge tone="warning">Propadlá</StatusBadge>
                    ) : expiring ? (
                      <StatusBadge tone="warning">Platí do {fmtDate(q.valid_until)}</StatusBadge>
                    ) : q.state === 'draft' ? (
                      <StatusBadge tone="neutral">Rozpracovaná</StatusBadge>
                    ) : (
                      <StatusBadge tone="info">Odeslaná</StatusBadge>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

function InvoicesSection({ slug, data }: { slug: string; data: DashboardData | undefined }) {
  const invs = data?.unpaid_invoices
  return (
    <Section title="Neuhrazené faktury" icon={ReceiptTextIcon} to="/a/$slug/invoices" slug={slug} count={invs?.length}>
      {!invs ? (
        <ListSkeleton />
      ) : invs.length === 0 ? (
        <Empty>Všechny faktury jsou uhrazené.</Empty>
      ) : (
        <ul className={rowList}>
          {invs.slice(0, 8).map((i) => {
            const st = invoiceState(i)
            return (
              <li key={i.id}>
                <Link to="/a/$slug/invoices/$id" params={{ slug, id: String(i.id) }} className={cn(rowLink, i.overdue && 'bg-destructive/5')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.customer.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {i.kind === 'advance' ? 'Záloha' : 'Faktura'} {i.number} · splatnost {fmtDate(i.due_on)}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="tabular-nums">{money(i.total)}</span>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

/* ---------- parťák ---------- */

function WorkerDashboard({ slug, data, members }: { slug: string; data: DashboardData | undefined; members: Member[] | undefined }) {
  if (!data)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    )
  const t = today()
  const todays = data.upcoming_jobs.filter((j) => j.state === 'in_progress' || (j.start_on && j.start_on <= t && jobEnd(j) >= t))
  const later = data.upcoming_jobs.filter((j) => !todays.includes(j))
  return (
    <>
      <section>
        <h2 className="mb-2 font-heading text-lg font-semibold">Dnes</h2>
        {todays.length === 0 ? (
          <Empty>Na dnešek nemáte žádnou zakázku.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {todays.map((j) => (
              <BigJobCard key={j.id} slug={slug} job={j} members={members} />
            ))}
          </div>
        )}
      </section>
      {later.length > 0 && (
        <section>
          <h2 className="mb-2 font-heading text-lg font-semibold">Další dny</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {later.map((j) => (
              <BigJobCard key={j.id} slug={slug} job={j} members={members} compact />
            ))}
          </div>
        </section>
      )}
      <Link
        to="/a/$slug/jobs"
        params={{ slug }}
        search={{ view: 'calendar' }}
        className="flex items-center justify-center gap-2 rounded-xl border bg-card py-3 text-sm font-medium shadow-xs active:bg-muted"
      >
        <CalendarDaysIcon className="size-4 text-primary" /> Kalendář zakázek
      </Link>
    </>
  )
}

function BigJobCard({ slug, job: j, members, compact }: { slug: string; job: JobSummary; members: Member[] | undefined; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs', !compact && 'border-primary/30')}>
      <Link to="/a/$slug/jobs/$id" params={{ slug, id: String(j.id) }} className="flex flex-col gap-1 p-4 active:bg-muted">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('font-heading font-semibold', compact ? 'text-base' : 'text-xl')}>{j.title}</span>
          <JobStateBadge state={j.state} />
        </div>
        <span className="text-sm text-muted-foreground">{j.customer.name}</span>
        {j.site_address && (
          <span className="flex items-center gap-1 text-sm">
            <MapPinIcon className="size-4 shrink-0 text-primary" /> {j.site_address}
          </span>
        )}
        <span className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{jobTerm(j)}</span>
          <CrewAvatars ids={j.worker_ids} members={members} />
        </span>
      </Link>
      {!compact && (j.site_address || j.customer.phone) && (
        <div className="grid grid-cols-2 border-t">
          {j.site_address && (
            <a
              href={mapsUrl(j.site_address)}
              target="_blank"
              rel="noreferrer"
              className={cn('flex h-12 items-center justify-center gap-2 text-sm font-medium text-primary active:bg-muted', !j.customer.phone && 'col-span-2')}
            >
              <NavigationIcon className="size-4" /> Navigovat
            </a>
          )}
          {j.customer.phone && (
            <a
              href={telHref(j.customer.phone)}
              className={cn('flex h-12 items-center justify-center gap-2 border-l text-sm font-medium text-primary active:bg-muted', !j.site_address && 'col-span-2 border-l-0')}
            >
              <PhoneIcon className="size-4" /> Zavolat
            </a>
          )}
        </div>
      )}
    </div>
  )
}
