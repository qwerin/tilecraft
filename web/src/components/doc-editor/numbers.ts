// Čísla s českou čárkou pro vstupy editorů.

/** „1 190,5“ / „1190.5“ → 1190.5; prázdné nebo nesmysl → null. */
export function parseDecimal(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** 2.95 → „2,95“ (bez seskupení tisíců, max. 2 desetinná místa). */
export function formatDecimal(n: number | null | undefined): string {
  if (n == null) return ''
  return String(Math.round(n * 100) / 100).replace('.', ',')
}
