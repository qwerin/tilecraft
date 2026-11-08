// Pomocné funkce zakázek (parta, termín, období kalendáře) — mimo .tsx kvůli HMR.
import type { Member } from '@/api/types'
import { addDays, fmtDate, fmtShort, parseDay, toDay, weekStart } from '@/lib/format'

const FALLBACK = ['#b45309', '#0f766e', '#7c3aed', '#be123c', '#1d4ed8', '#4d7c0f', '#c2410c', '#0e7490']

/** Barva člena v kalendáři (Member.color, jinak barva podle ID). */
export function memberColor(m: Pick<Member, 'id' | 'color'>): string {
  return /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : FALLBACK[m.id % FALLBACK.length]
}

export function memberInitials(m: Pick<Member, 'name' | 'email'>): string {
  return (
    (m.name || m.email || '?')
      .split(/[\s@.]+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

/** Jména party („Petr, Honza“). */
export function crewNames(ids: number[], members: Member[] | undefined): string {
  return ids
    .map((id) => members?.find((m) => m.id === id)?.name)
    .filter(Boolean)
    .join(', ')
}

/** Termín zakázky: „9. 11. – 13. 11. 2026“, jeden den, nebo „Nenaplánováno“. */
export function jobTerm(j: { start_on: string; end_on: string }): string {
  if (!j.start_on) return 'Nenaplánováno'
  if (!j.end_on || j.end_on === j.start_on) return fmtDate(j.start_on)
  return `${fmtShort(j.start_on)} – ${fmtDate(j.end_on)}`
}

/** Poslední den zakázky (bez konce = jen den začátku). */
export const jobEnd = (j: { start_on: string; end_on: string }) => (j.end_on && j.end_on >= j.start_on ? j.end_on : j.start_on)

export const dayDiff = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86_400_000)

export type CalendarSpan = '2w' | 'month'

/** Rozsah dnů zobrazeného období; `at` je libovolný den v něm. */
export function calendarRange(at: string, span: CalendarSpan): { from: string; to: string; days: string[] } {
  let from: string
  let n: number
  if (span === 'month') {
    const d = parseDay(at)
    from = toDay(new Date(d.getFullYear(), d.getMonth(), 1))
    n = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  } else {
    from = weekStart(at)
    n = 14
  }
  const days = Array.from({ length: n }, (_, i) => addDays(from, i))
  return { from, to: days[n - 1], days }
}

/** Posun období o jedno dozadu/dopředu. */
export function shiftRange(at: string, span: CalendarSpan, dir: -1 | 1): string {
  if (span === 'month') {
    const d = parseDay(at)
    return toDay(new Date(d.getFullYear(), d.getMonth() + dir, 1))
  }
  return addDays(weekStart(at), 14 * dir)
}

const monthFmt = new Intl.DateTimeFormat('cs-CZ', { month: 'long', year: 'numeric' })

export function rangeTitle(at: string, span: CalendarSpan) {
  if (span === 'month') return monthFmt.format(parseDay(at))
  const { from, to } = calendarRange(at, span)
  return `${fmtShort(from)} – ${fmtShort(to)} ${parseDay(to).getFullYear()}`
}
