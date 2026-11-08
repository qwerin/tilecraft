import { isTestEnv } from '@/lib/env'
import { cn } from '@/lib/utils'

/**
 * Značka TileCraft: čtyři dlaždice se spárami na glazurovém podkladu, poslední terakotová dlaždice se právě pokládá
 * (mírně pootočená). Stejný tvar je ve favicon.svg a ikonách PWA (public/).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-8 shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="15" fill="#0a3537" />
      <rect x="10" y="10" width="20.5" height="20.5" rx="3.5" fill="#f3e6d2" />
      <rect x="33.5" y="10" width="20.5" height="20.5" rx="3.5" fill="#e0c6a8" />
      <rect x="10" y="33.5" width="20.5" height="20.5" rx="3.5" fill="#e0c6a8" />
      <rect x="33.5" y="33.5" width="20.5" height="20.5" rx="3.5" fill="#e7885d" transform="rotate(9 43.75 43.75) translate(1.5 1.5)" />
    </svg>
  )
}

/** Logo s názvem; `tone="light"` pro tmavé pozadí (navigace, přihlášení). */
export function Logo({ className, tone = 'auto', compact }: { className?: string; tone?: 'auto' | 'light'; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={tone === 'light' ? 'ring-1 ring-white/15 rounded-[0.55rem]' : undefined} />
      {!compact && (
        <span className={cn('font-heading text-[1.35rem] leading-none tracking-tight', tone === 'light' ? 'text-sidebar-foreground' : 'text-foreground')}>
          <span className="font-medium">Tile</span>
          <span className="font-extrabold">Craft</span>
        </span>
      )}
      {isTestEnv && !compact && (
        <span className="rounded-md bg-pink-600 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-white ring-1 ring-white/70" title="Testovací verze">
          TEST
        </span>
      )}
    </div>
  )
}
