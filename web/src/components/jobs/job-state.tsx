import { CheckIcon } from 'lucide-react'
import { jobFlow, jobStateLabels, jobStateTones, type JobState } from '@/api/jobs'
import { StatusBadge } from '@/components/common'
import { cn } from '@/lib/utils'

export function JobStateBadge({ state, className }: { state: JobState; className?: string }) {
  return (
    <StatusBadge tone={jobStateTones[state]} className={className}>
      {jobStateLabels[state]}
    </StatusBadge>
  )
}

const stepLabels: Record<JobState, string> = {
  planned: 'Domluvená',
  in_progress: 'Probíhá',
  done: 'Hotová',
  invoiced: 'Vyfakturovaná',
  cancelled: 'Zrušená',
}

/** Průběh zakázky: Domluvená → Probíhá → Hotová → Vyfakturovaná. */
export function JobSteps({ state }: { state: JobState }) {
  const cur = jobFlow.indexOf(state)
  return (
    <ol className={cn('flex items-center gap-1', state === 'cancelled' && 'opacity-40')}>
      {jobFlow.map((s, i) => {
        const done = cur > i
        const active = cur === i
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-1">
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
            <span className={cn('truncate text-xs', active ? 'font-semibold' : 'text-muted-foreground', 'max-sm:hidden', active && 'max-sm:inline')}>
              {stepLabels[s]}
            </span>
            {i < jobFlow.length - 1 && <span className={cn('h-px min-w-2 flex-1', done ? 'bg-primary' : 'bg-border')} />}
          </li>
        )
      })}
    </ol>
  )
}
