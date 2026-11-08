import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  BanIcon,
  CalendarDaysIcon,
  CheckCheckIcon,
  EllipsisVerticalIcon,
  MapPinIcon,
  NavigationIcon,
  PencilIcon,
  PhoneIcon,
  PlayIcon,
  ReceiptTextIcon,
  RotateCcwIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { invoiceState } from '@/api/invoices'
import { jobMutations, jobQuery, mapsUrl, telHref, type Job, type JobState } from '@/api/jobs'
import { useFirmMutation, useMembers } from '@/api/queries'
import type { Member } from '@/api/types'
import { Panel, StatusBadge } from '@/components/common'
import { JobInvoiceDialog } from '@/components/invoices/job-invoice-dialog'
import { MemberAvatar } from '@/components/jobs/crew'
import { JobDiary } from '@/components/jobs/job-diary'
import { JobEditDialog } from '@/components/jobs/job-edit-dialog'
import { JobItemsEditor } from '@/components/jobs/job-items-editor'
import { JobLines, JobMeasurements, QuoteComparison } from '@/components/jobs/job-lines'
import { JobPhotos } from '@/components/jobs/job-photos'
import { JobStateBadge, JobSteps } from '@/components/jobs/job-state'
import { jobTerm } from '@/components/jobs/utils'
import { PageError, PageLoading } from '@/components/page-states'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useFirm } from '@/hooks/use-firm'
import { fmtDate, money } from '@/lib/format'
import { cn } from '@/lib/utils'

// Detail zakázky (SPEC §6): zákazník (volat, navigovat), stav velkými tlačítky, termín a parta, fotky, deník,
// zaměření, položky, srovnání s nabídkou a faktury. Parťák vidí vše bez cen a mění stav (ne zrušení).

export const Route = createFileRoute('/a/$slug/jobs/$id')({ component: JobPage })

function JobPage() {
  const { slug, isManager } = useFirm()
  const { id } = Route.useParams()
  const q = useQuery(jobQuery(slug, Number(id)))
  const members = useMembers(slug).data ?? []
  const [editing, setEditing] = useState(false)
  const [editingItems, setEditingItems] = useState(false)
  const [invoicing, setInvoicing] = useState(false)

  if (q.isPending) return <PageLoading />
  if (q.isError) return <PageError error={q.error} reset={() => void q.refetch()} />
  const job = q.data

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <JobHeader job={job} slug={slug} isManager={isManager} onEdit={() => setEditing(true)} />
      <StateCard job={job} slug={slug} isManager={isManager} onInvoice={() => setInvoicing(true)} />
      <InfoPanel job={job} members={members} isManager={isManager} onEdit={() => setEditing(true)} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <JobPhotos slug={slug} job={job} isManager={isManager} />
          <JobDiary slug={slug} job={job} isManager={isManager} />
          {editingItems ? (
            <JobItemsEditor slug={slug} job={job} onDone={() => setEditingItems(false)} />
          ) : (
            <>
              <JobLines
                job={job}
                isManager={isManager}
                actions={
                  isManager &&
                  job.state !== 'invoiced' && (
                    <Button variant="outline" size="sm" onClick={() => setEditingItems(true)}>
                      <PencilIcon /> Upravit položky
                    </Button>
                  )
                }
              />
              <JobMeasurements job={job} />
            </>
          )}
        </div>
        {isManager && (
          <div className="flex min-w-0 flex-col gap-4">
            <QuoteComparison slug={slug} job={job} />
            <InvoicesPanel slug={slug} job={job} onInvoice={() => setInvoicing(true)} />
          </div>
        )}
      </div>

      {isManager && (
        <>
          <JobEditDialog slug={slug} job={job} open={editing} onOpenChange={setEditing} />
          <JobInvoiceDialog slug={slug} job={job} open={invoicing} onOpenChange={setInvoicing} />
        </>
      )}
    </div>
  )
}

function JobHeader({ job, slug, isManager, onEdit }: { job: Job; slug: string; isManager: boolean; onEdit: () => void }) {
  const navigate = useNavigate()
  const setState = useFirmMutation(slug, jobMutations.setState(slug, job.id), [['jobs'], ['dashboard']])
  const remove = useFirmMutation(slug, jobMutations.remove(slug, job.id), [['jobs'], ['dashboard'], ['quotes']])
  const [confirm, setConfirm] = useState<'cancel' | 'delete' | null>(null)
  const address = job.site_address || job.customer.address
  return (
    <header className="flex flex-col gap-3">
      <Link to="/a/$slug/jobs" params={{ slug }} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Zakázky
      </Link>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{job.number}</span>
            <JobStateBadge state={job.state} />
          </div>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="text-sm text-muted-foreground">{job.customer.name}</p>
        </div>
        {isManager && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" onClick={onEdit} className="max-sm:hidden">
              <PencilIcon /> Upravit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Další akce" />}>
                <EllipsisVerticalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={onEdit}>
                  <PencilIcon className="size-4" /> Upravit zakázku
                </DropdownMenuItem>
                {job.state !== 'cancelled' && job.state !== 'invoiced' && (
                  <DropdownMenuItem onClick={() => setConfirm('cancel')}>
                    <BanIcon className="size-4" /> Zrušit zakázku
                  </DropdownMenuItem>
                )}
                {job.invoices.length === 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setConfirm('delete')}>
                      <Trash2Icon className="size-4" /> Smazat zakázku
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{confirm === 'delete' ? `Smazat zakázku ${job.number}?` : `Zrušit zakázku ${job.number}?`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {confirm === 'delete' ? 'Smažou se i fotky a deník. Nabídka zůstane.' : 'Zakázka zůstane mezi zrušenými, později ji lze obnovit.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Zpět</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={async () => {
                      if (confirm === 'delete') {
                        await remove.mutateAsync(undefined)
                        toast.success('Zakázka smazána')
                        void navigate({ to: '/a/$slug/jobs', params: { slug } })
                      } else {
                        await setState.mutateAsync('cancelled')
                        toast.success('Zakázka zrušena')
                      }
                      setConfirm(null)
                    }}
                  >
                    {confirm === 'delete' ? 'Smazat' : 'Zrušit zakázku'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
      {/* rychlé akce pro telefon: zavolat zákazníkovi, navigovat na stavbu */}
      {(job.customer.phone || address) && (
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {job.customer.phone && (
            <Button variant="outline" size="lg" render={<a href={telHref(job.customer.phone)} />}>
              <PhoneIcon /> {job.customer.phone}
            </Button>
          )}
          {address && (
            <Button variant="outline" size="lg" render={<a href={mapsUrl(address)} target="_blank" rel="noreferrer" />} className={cn(!job.customer.phone && 'col-span-2')}>
              <NavigationIcon /> Navigovat
            </Button>
          )}
        </div>
      )}
    </header>
  )
}

const nextStep: Partial<Record<JobState, { to: 'in_progress' | 'done'; label: string; icon: typeof PlayIcon }>> = {
  planned: { to: 'in_progress', label: 'Zahájit práci', icon: PlayIcon },
  in_progress: { to: 'done', label: 'Hotovo', icon: CheckCheckIcon },
}

const backStep: Partial<Record<JobState, { to: 'planned' | 'in_progress'; label: string }>> = {
  in_progress: { to: 'planned', label: 'Vrátit na domluvenou' },
  done: { to: 'in_progress', label: 'Vrátit do realizace' },
}

/** Stav zakázky: průběh a velké tlačítko dalšího kroku (Zahájit → Hotovo → Vyfakturovat). */
function StateCard({ job, slug, isManager, onInvoice }: { job: Job; slug: string; isManager: boolean; onInvoice: () => void }) {
  const setState = useFirmMutation(slug, jobMutations.setState(slug, job.id), [['jobs'], ['dashboard']])
  const next = nextStep[job.state]
  const back = backStep[job.state]
  const move = (to: Exclude<JobState, 'invoiced'>, msg: string) => setState.mutate(to, { onSuccess: () => toast.success(msg) })

  let primary: ReactNode = null
  if (next) {
    primary = (
      <Button size="lg" className="h-12 w-full text-base sm:w-auto sm:px-6 md:h-11" disabled={setState.isPending} onClick={() => move(next.to, next.to === 'done' ? 'Zakázka je hotová' : 'Práce zahájena')}>
        <next.icon className="size-5" /> {next.label}
      </Button>
    )
  } else if (job.state === 'done' && isManager) {
    primary = (
      <Button size="lg" className="h-12 w-full text-base sm:w-auto sm:px-6 md:h-11" onClick={onInvoice}>
        <ReceiptTextIcon className="size-5" /> Vyfakturovat
      </Button>
    )
  } else if (job.state === 'cancelled' && isManager) {
    primary = (
      <Button size="lg" variant="outline" className="h-12 w-full sm:w-auto md:h-11" disabled={setState.isPending} onClick={() => move('planned', 'Zakázka obnovena')}>
        <RotateCcwIcon /> Obnovit zakázku
      </Button>
    )
  }

  const hint =
    job.state === 'done'
      ? isManager
        ? 'Práce je hotová — vystavte fakturu.'
        : 'Práce je hotová. Fakturu vystaví kancelář.'
      : job.state === 'invoiced'
        ? 'Zakázka je vyfakturovaná a uhrazená.'
        : job.state === 'cancelled'
          ? 'Zakázka je zrušená.'
          : null

  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs">
      <JobSteps state={job.state} />
      {(primary || hint || back) && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          {primary}
          {hint && <p className="text-sm text-muted-foreground sm:flex-1">{hint}</p>}
          {back && (
            <Button variant="ghost" size="sm" className="self-center text-muted-foreground sm:ml-auto" disabled={setState.isPending} onClick={() => move(back.to, 'Stav vrácen')}>
              <RotateCcwIcon /> {back.label}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}

/** Termín, parta, adresa stavby, kontakt na místě a poznámka. */
function InfoPanel({ job, members, isManager, onEdit }: { job: Job; members: Member[]; isManager: boolean; onEdit: () => void }) {
  const crew = job.worker_ids.map((id) => members.find((m) => m.id === id)).filter((m): m is Member => !!m)
  return (
    <Panel
      actions={
        isManager && (
          <Button variant="ghost" size="sm" className="sm:hidden" onClick={onEdit}>
            <PencilIcon /> Upravit
          </Button>
        )
      }
      title={<span className="sm:hidden">Údaje</span>}
      className="max-sm:pt-3"
    >
      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info icon={CalendarDaysIcon} label="Termín">
          <span className={cn(!job.start_on && 'text-muted-foreground')}>{jobTerm(job)}</span>
        </Info>
        <Info icon={UsersIcon} label="Parta">
          {crew.length === 0 ? (
            <span className="text-muted-foreground">Nepřiřazeno</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {crew.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <MemberAvatar member={m} className="ring-0" />
                  <span className="truncate">{m.name}</span>
                  {m.phone && (
                    <a href={telHref(m.phone)} className="ml-auto text-xs text-primary hover:underline">
                      {m.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Info>
        <Info icon={MapPinIcon} label="Adresa stavby">
          {job.site_address ? (
            <a href={mapsUrl(job.site_address)} target="_blank" rel="noreferrer" className="hover:underline">
              {job.site_address}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Info>
        <Info icon={PhoneIcon} label="Kontakt na místě">
          {job.site_contact ? <Linkified text={job.site_contact} /> : <span className="text-muted-foreground">—</span>}
        </Info>
        {job.note && (
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="mb-0.5 text-xs text-muted-foreground">Poznámka</dt>
            <dd className="whitespace-pre-wrap">{job.note}</dd>
          </div>
        )}
      </dl>
    </Panel>
  )
}

function Info({ icon: Icon, label, children }: { icon: typeof PhoneIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <dt className="mb-0.5 text-xs text-muted-foreground">{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  )
}

const PHONE_RE = /(\+?\d[\d ]{7,}\d)/g

/** Text s telefonními čísly jako odkazy tel: (kontakt na místě). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(PHONE_RE)
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={telHref(p)} className="font-medium text-primary hover:underline">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </span>
  )
}

function InvoicesPanel({ slug, job, onInvoice }: { slug: string; job: Job; onInvoice: () => void }) {
  const canInvoice = job.state !== 'cancelled' && job.state !== 'invoiced' && job.lines.length > 0
  return (
    <Panel id="faktury" title="Faktury">
      {job.invoices.length === 0 ? (
        <p className="pb-2 text-sm text-muted-foreground">Zatím žádné faktury.</p>
      ) : (
        <ul className="-mx-1 mb-3 flex flex-col">
          {job.invoices.map((i) => {
            const st = invoiceState(i)
            return (
              <li key={i.id}>
                <Link
                  to="/a/$slug/invoices/$id"
                  params={{ slug, id: String(i.id) }}
                  className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">
                      {i.kind === 'advance' ? 'Záloha' : 'Faktura'} {i.number}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {fmtDate(i.issued_on)}
                      {i.deducted && ' · odečtená'}
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
      {canInvoice && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onInvoice}>
            Zálohová faktura
          </Button>
          <Button onClick={onInvoice}>
            <ReceiptTextIcon /> Vyfakturovat
          </Button>
        </div>
      )}
    </Panel>
  )
}
