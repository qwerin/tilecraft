import { CheckIcon } from 'lucide-react'
import type { Member } from '@/api/types'
import { cn } from '@/lib/utils'
import { memberColor, memberInitials } from './utils'

// Parta zakázky: kolečka s iniciálami v barvě člena.

export function MemberAvatar({ member, className }: { member: Member; className?: string }) {
  return (
    <span
      title={member.name}
      style={{ backgroundColor: memberColor(member) }}
      className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-card', className)}
    >
      {memberInitials(member)}
    </span>
  )
}

/** Překrývající se avatary party; `max` dalších se ukáže jako „+N“. */
export function CrewAvatars({ ids, members, max = 4, className, size }: { ids: number[]; members: Member[] | undefined; max?: number; className?: string; size?: string }) {
  const crew = ids.map((id) => members?.find((m) => m.id === id)).filter((m): m is Member => !!m)
  if (crew.length === 0) return null
  return (
    <span className={cn('inline-flex shrink-0 -space-x-1.5', className)}>
      {crew.slice(0, max).map((m) => (
        <MemberAvatar key={m.id} member={m} className={size} />
      ))}
      {crew.length > max && (
        <span className={cn('inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-card', size)}>
          +{crew.length - max}
        </span>
      )}
    </span>
  )
}

/** Výběr party: dlaždice s avatarem, klepnutím přidat/odebrat. */
export function CrewPicker({ members, value, onChange }: { members: Member[]; value: number[]; onChange: (ids: number[]) => void }) {
  const active = members.filter((m) => !m.pending)
  if (active.length === 0) return <p className="text-sm text-muted-foreground">Ve firmě zatím nikdo není.</p>
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {active.map((m) => {
        const on = value.includes(m.id)
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((id) => id !== m.id) : [...value, m.id])}
            className={cn(
              'flex min-h-11 items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors',
              on ? 'border-primary/60 bg-primary/8' : 'hover:bg-muted/60',
            )}
          >
            <MemberAvatar member={m} className="size-7 text-[11px] ring-0" />
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            <span className={cn('flex size-5 items-center justify-center rounded-full border', on && 'border-primary bg-primary text-primary-foreground')}>
              {on && <CheckIcon className="size-3.5" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
