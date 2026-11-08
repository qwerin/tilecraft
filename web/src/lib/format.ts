import type { Role } from '@/api/types'

const czk = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 })
const czk2 = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 2 })

/** Částka v haléřích → „3 300 Kč“ (desetinná místa jen když nejsou nulová). */
export function money(minor: number | null | undefined): string {
  if (minor == null) return '—'
  return minor % 100 === 0 ? czk.format(minor / 100) : czk2.format(minor / 100)
}

/** „3300“ / „3300,50“ (pro inputy) ↔ haléře. */
export function toMinor(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}
export function fromMinor(minor: number | null | undefined): string {
  if (minor == null) return ''
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2).replace('.', ',')
}

const dateFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const shortFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' })
const weekdayFmt = new Intl.DateTimeFormat('cs-CZ', { weekday: 'short' })

/** "YYYY-MM-DD" → lokální datum (bez posunu časové zóny). */
export function parseDay(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}
export function toDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function addDays(d: string, n: number): string {
  const x = parseDay(d)
  x.setDate(x.getDate() + n)
  return toDay(x)
}
export const today = () => toDay(new Date())

/** Pondělí týdne, ve kterém leží d. */
export function weekStart(d: string) {
  const day = parseDay(d).getDay()
  return addDays(d, -((day + 6) % 7))
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  return dateFmt.format(v.length === 10 ? parseDay(v) : new Date(v))
}
export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  return d.getHours() === 0 && d.getMinutes() === 0 ? dateFmt.format(d) : dateTimeFmt.format(d)
}
export function fmtShort(v: string): string {
  return shortFmt.format(v.length === 10 ? parseDay(v) : new Date(v))
}
export function fmtWeekday(v: string): string {
  return weekdayFmt.format(parseDay(v))
}

/** ISO instant → hodnota pro <input type="datetime-local">. */
export function toLocalInput(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function fromLocalInput(v: string): string | undefined {
  return v ? new Date(v).toISOString() : undefined
}

export function fileSize(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} kB`
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** Číslo česky („14,11“, „1 190“); max. 2 desetinná místa, nuly na konci se nepíší. */
const numFmt = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 })
export function num(n: number | null | undefined): string {
  return n == null ? '—' : numFmt.format(n)
}

/** Jednotky ceníku a řádků nabídky (SPEC §4). */
export const units = ['m2', 'bm', 'ks', 'hod', 'kpl', 'bal', 'kg', 'l', 'km'] as const
export type Unit = (typeof units)[number]
export const unitLabels: Record<Unit, string> = { m2: 'm²', bm: 'bm', ks: 'ks', hod: 'hod', kpl: 'kpl', bal: 'bal', kg: 'kg', l: 'l', km: 'km' }
export const unitLabel = (u: string) => unitLabels[u as Unit] ?? u

/** Množství s jednotkou: „14,11 m²“. */
export function qty(n: number | null | undefined, unit: string): string {
  return n == null ? '—' : `${numFmt.format(n)} ${unitLabel(unit)}`
}

/** Rozměr v m zadaný z mobilu: „2,95“ / „2.95“ → 2.95, celé číslo ≥ 10 se bere jako centimetry („295“ → 2.95). */
export function parseMeters(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Number.isInteger(n) && n >= 10 ? n / 100 : n
}

/** Česká množná čísla: plural(3, 'položka', 'položky', 'položek') → „3 položky“. */
export function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`
}

export const roleLabels: Record<Role, string> = {
  owner: 'Vlastník',
  admin: 'Kancelář',
  worker: 'Parťák',
}
export const roleLabel = (r: string) => roleLabels[r as Role] ?? r

/** Vlastník a kancelář: vidí ceny, nabídky, faktury, ceník a nastavení. Parťák jen zakázky bez cen. */
export const isManager = (r: string | undefined) => r === 'owner' || r === 'admin'
