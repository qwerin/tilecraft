// České zadávání a zobrazení data a času ve formulářích (nezávisle na jazyce prohlížeče).
// Hodnoty formulářů: datum "YYYY-MM-DD", datum s časem "YYYY-MM-DDTHH:mm" (místní čas).

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-27" → "27. 10. 2026" */
export function formatCzDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : ''
}

/** "2026-10-27T14:30" → "27. 10. 2026 14:30" */
export function formatCzDateTime(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v)
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]} ${Number(m[4])}:${m[5]}` : ''
}

function validDate(y: number, m: number, d: number): boolean {
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/**
 * Rozpozná české datum: „27. 10. 2026“, „27.10.2026“, „27.10.26“, „27.10.“ / „27.10“ (letošní rok),
 * „27“ (tento měsíc) i ISO „2026-10-27“. Vrací "YYYY-MM-DD", "" pro prázdný vstup, null pro nesmysl.
 */
export function parseCzDate(input: string, today = new Date()): string | null {
  const s = input.trim()
  if (!s) return ''
  let y: number, m: number, d: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  const cz = /^(\d{1,2})(?:\s*[./]\s*(\d{1,2}))?(?:\s*[./]\s*(\d{2}|\d{4})?)?\.?$/.exec(s)
  if (iso) {
    ;[y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  } else if (cz) {
    d = Number(cz[1])
    m = cz[2] ? Number(cz[2]) : today.getMonth() + 1
    y = cz[3] ? Number(cz[3]) : today.getFullYear()
    if (cz[3]?.length === 2) y += 2000
  } else {
    return null
  }
  return validDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null
}

/**
 * Datum s časem: české datum (viz parseCzDate), mezera a čas „14:30“, „14.30“ nebo „14“.
 * Bez času se použije defaultTime ("HH:mm").
 */
export function parseCzDateTime(input: string, defaultTime = '00:00', today = new Date()): string | null {
  const s = input.trim()
  if (!s) return ''
  const t = /^(.*?)(?:\s+|T)(\d{1,2})(?:[:.](\d{2}))?$/.exec(s)
  // „27.10. 14“ i „27.10.2026 14:30“; samotné „27.10.2026“ nesmí skončit jako čas „2026“
  let datePart = s
  let time = defaultTime
  if (t && t[1] && parseCzDate(t[1], today) !== null && t[1].trim() !== '') {
    const h = Number(t[2])
    const min = t[3] ? Number(t[3]) : 0
    if (h > 23 || min > 59) return null
    datePart = t[1]
    time = `${pad(h)}:${pad(min)}`
  }
  const date = parseCzDate(datePart, today)
  if (!date) return null
  return `${date}T${time}`
}

/**
 * Datum s časem zaokrouhlené na nejbližší čtvrthodinu: "2026-10-27T14:37" → "2026-10-27T14:30",
 * "2026-10-27T23:53" → "2026-10-28T00:00". Jiný vstup vrací beze změny.
 */
export function roundToQuarter(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v)
  if (!m) return v
  const minutes = Math.round((Number(m[4]) * 60 + Number(m[5])) / 15) * 15
  // UTC kvůli přechodu na letní čas — jde jen o posun kalendářního data
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, minutes))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** Čtvrthodiny dne pro výběr času: "00:00", "00:15", … "23:45". */
export const quarterHours: string[] = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`)

/** "YYYY-MM-DD…" → místní Date (půlnoc), jinak undefined. */
export function isoToDate(v: string | undefined): Date | undefined {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}

/** Místní Date → "YYYY-MM-DD". */
export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
