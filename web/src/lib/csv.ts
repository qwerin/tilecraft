/** Stáhne tabulku jako CSV pro Excel (středník, uvozovky, BOM — Excel pak pozná UTF-8 a diakritiku). */
export function downloadCsv(filename: string, head: string[], rows: string[][]) {
  const cell = (v: string) => `"${v.replaceAll('"', '""')}"`
  const lines = [head, ...rows].map((r) => r.map(cell).join(';'))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename.replace(/[^\w.-]+/g, '_')
  a.click()
  URL.revokeObjectURL(a.href)
}
