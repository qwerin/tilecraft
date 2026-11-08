// TS port of internal/calc (SPEC §5.1–5.3): measurements, measured quantities, line amounts and totals.
// Must give exactly the same numbers as the server — keep in sync with internal/calc/calc.go
// (tests in calc.test.ts mirror calc_test.go). Lengths in metres, areas m², money haléře.

export type SurfaceKind = 'floor' | 'wall' | 'length' | 'piece'
export type Measure = '' | 'floor' | 'wall' | 'area' | 'perimeter' | 'length' | 'piece'
export type Section = 'work' | 'material' | 'other'

export interface Deduction {
  name: string
  width: number
  height: number
  count?: number // 0/undefined = 1
}

export interface Surface {
  name: string
  kind: string // SurfaceKind
  width: number
  height: number
  count?: number // 0/undefined = 1
  area?: number // manual area (irregular shape) instead of width × height
  deductions?: Deduction[] | null
}

export interface Room {
  name: string
  surfaces: Surface[] | null
}

export interface Summary {
  floor: number // m²
  wall: number // m²
  perimeter: number // bm of floor perimeters
  length: number // bm
  pieces: number
}

export interface Totals {
  work: number
  material: number
  other: number
  subtotal: number
  discount: number
  base: number
  vat_rate: number
  vat: number
  total: number
}

export const surfaceKinds: SurfaceKind[] = ['floor', 'wall', 'length', 'piece']
export const measures: Exclude<Measure, ''>[] = ['floor', 'wall', 'area', 'perimeter', 'length', 'piece']

/** Go math.Round: half away from zero (JS Math.round rounds half towards +∞). */
export function goRound(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v)
}

const count = (n: number | undefined | null) => (!n || n <= 0 ? 1 : n)

/** Rounds to 2 decimal places. */
export const round2 = (v: number) => goRound(v * 100) / 100

/** Net area of a floor or wall (m², 2 decimals; never negative). */
export function surfaceArea(s: Surface): number {
  if (s.kind !== 'floor' && s.kind !== 'wall') return 0
  let a = s.area != null ? s.area : s.width * s.height * count(s.count)
  for (const d of s.deductions ?? []) a -= d.width * d.height * count(d.count)
  return round2(Math.max(a, 0))
}

/** Area of the deductions of a surface (m², unrounded). */
export function deductionsArea(s: Surface): number {
  return (s.deductions ?? []).reduce((a, d) => a + d.width * d.height * count(d.count), 0)
}

const emptySummary = (): Summary => ({ floor: 0, wall: 0, perimeter: 0, length: 0, pieces: 0 })

function add(sum: Summary, s: Surface) {
  switch (s.kind) {
    case 'floor':
      sum.floor += surfaceArea(s)
      if (s.area == null) sum.perimeter += 2 * (s.width + s.height) * count(s.count)
      break
    case 'wall':
      sum.wall += surfaceArea(s)
      break
    case 'length':
      sum.length += s.width * count(s.count)
      break
    case 'piece':
      sum.pieces += count(s.count)
      break
  }
}

const rounded = (s: Summary): Summary => ({
  floor: round2(s.floor),
  wall: round2(s.wall),
  perimeter: round2(s.perimeter),
  length: round2(s.length),
  pieces: s.pieces,
})

/** Sums one room. */
export function roomSummary(r: Room): Summary {
  const s = emptySummary()
  for (const f of r.surfaces ?? []) add(s, f)
  return rounded(s)
}

/** Sums the rooms whose names are in only (empty = all rooms). */
export function total(rooms: Room[], only?: string[] | null): Summary {
  const s = emptySummary()
  for (const r of rooms) {
    if (only && only.length > 0 && !only.includes(r.name)) continue
    for (const f of r.surfaces ?? []) add(s, f)
  }
  return rounded(s)
}

/** Value of a measure in a summary. */
export function summaryOf(sum: Summary, measure: string): number {
  switch (measure) {
    case 'floor':
      return sum.floor
    case 'wall':
      return sum.wall
    case 'area':
      return round2(sum.floor + sum.wall)
    case 'perimeter':
      return sum.perimeter
    case 'length':
      return sum.length
    case 'piece':
      return sum.pieces
  }
  return 0
}

/** Quantity of a measured line: the measure over the rooms plus waste %, 2 decimals (pieces rounded up). */
export function quantity(rooms: Room[], measure: string, only: string[] | null | undefined, waste: number): number {
  const q = summaryOf(total(rooms, only), measure) * (1 + waste / 100)
  if (measure === 'piece') return Math.ceil(q - 1e-9)
  return round2(q)
}

/** quantity × unit price − discount %, rounded to whole crowns; customer-supplied = 0. */
export function lineAmount(qty: number, unitPrice: number, discount: number, customerSupplied: boolean): number {
  if (customerSupplied) return 0
  const v = qty * unitPrice * (1 - discount / 100)
  return goRound(v / 100) * 100
}

/** Totals of lines with a document discount % and a VAT rate (0 = no VAT). */
export function sum(lines: { section: string; amount: number }[], discount: number, vatRate: number): Totals {
  const t: Totals = { work: 0, material: 0, other: 0, subtotal: 0, discount: 0, base: 0, vat_rate: vatRate, vat: 0, total: 0 }
  for (const l of lines) {
    if (l.section === 'work') t.work += l.amount
    else if (l.section === 'material') t.material += l.amount
    else t.other += l.amount
  }
  t.subtotal = t.work + t.material + t.other
  t.discount = goRound((t.subtotal * discount) / 100 / 100) * 100
  t.base = t.subtotal - t.discount
  t.vat = goRound((t.base * vatRate) / 100)
  t.total = t.base + t.vat
  return t
}
