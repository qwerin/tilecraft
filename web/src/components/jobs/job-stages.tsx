import { CheckIcon, CircleAlertIcon, CircleDashedIcon, CircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Job } from '@/api/jobs'
import { cn } from '@/lib/utils'
import { jobStages, stageOf, type Mark } from './stages'

// Přehled etap zakázky (SPEC §6): Navedení → Zhotovení → Ukončení → Faktura, odvozený ze stavu zakázky,
// s kontrolním seznamem, co je hotové. Parťák vidí jen body bez cen (nabídky a faktury ne).

const markIcons: Record<Mark, ReactNode> = {
  done: <CheckIcon className="size-3.5 text-success" />,
  todo: <CircleIcon className="size-3.5 text-muted-foreground" />,
  warn: <CircleAlertIcon className="size-3.5 text-warning-foreground dark:text-warning" />,
  skip: <CircleDashedIcon className="size-3.5 text-muted-foreground/50" />,
}

/** Stepper etap s kontrolními seznamy (na telefonu jen aktuální etapa). */
export function JobStages({ job, isManager }: { job: Job; isManager: boolean }) {
  const stages = jobStages(job, isManager)
  const cur = stageOf[job.state]
  const paid = job.invoices.some((i) => i.kind === 'invoice' && i.paid_on)
  return (
    <div className={cn(job.state === 'cancelled' && 'opacity-50')}>
      <ol className="flex items-center gap-1">
        {stages.map((s, i) => {
          const done = cur > i || (i === 3 && cur === 3 && paid)
          const active = cur === i && !done
          return (
            <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary bg-primary/12 text-primary ring-3 ring-primary/15',
                  !done && !active && 'text-muted-foreground',
                )}
              >
                {done ? <CheckIcon className="size-3.5" /> : i + 1}
              </span>
              <span className={cn('truncate text-xs', active ? 'font-semibold' : 'text-muted-foreground', 'max-sm:hidden', active && 'max-sm:inline')}>{s.title}</span>
              {i < stages.length - 1 && <span className={cn('h-px min-w-2 flex-1', cur > i ? 'bg-primary' : 'bg-border')} />}
            </li>
          )
        })}
      </ol>
      <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((s, i) => (
          <div key={s.key} className={cn('min-w-0 rounded-lg px-2 py-1.5', cur === i ? 'bg-primary/5' : 'max-sm:hidden')}>
            <p className={cn('mb-1 text-xs font-semibold', cur === i ? 'text-primary' : 'text-muted-foreground')}>
              {i + 1}. {s.title}
            </p>
            <ul className="flex flex-col gap-0.5 text-xs">
              {s.items.map((it, k) => (
                <li key={k} className={cn('flex items-start gap-1.5', it.mark === 'skip' && 'text-muted-foreground')}>
                  <span className="mt-0.5 shrink-0">{markIcons[it.mark]}</span>
                  {it.href ? (
                    <a href={it.href} className="min-w-0 hover:underline">
                      {it.label}
                    </a>
                  ) : (
                    <span className="min-w-0">{it.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
