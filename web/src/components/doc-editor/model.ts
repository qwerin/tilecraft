// Datový model editorů zaměření a řádků (nabídka, zakázka). Čisté funkce bez Reactu.
import type { CatalogItem } from '@/api/catalog'
import type { components } from '@/api/schema.gen'
import {
  lineAmount,
  round2,
  quantity as measuredQuantity,
  sum,
  total,
  summaryOf,
  type Measure,
  type Room,
  type Section,
  type Summary,
  type Surface,
  type SurfaceKind,
  type Totals,
} from '@/lib/calc'

export type { Measure, Room, Section, Summary, Surface, SurfaceKind, Totals }
type ApiLine = components['schemas']['Line']
type ApiLineInput = components['schemas']['LineInput']

/** Řádek dokladu v editoru (všechna pole povinná; `measure` ≠ '' = množství se počítá ze zaměření). */
export interface DocLine {
  section: Section
  catalog_item_id: number | null
  name: string
  unit: string
  /** Ruční množství; u měřeného řádku jen poslední spočítaná hodnota (pravdu má `computeLines`). */
  quantity: number
  unit_price: number // haléře
  discount: number // %
  customer_supplied: boolean
  measure: Measure
  rooms: string[] // jména místností pro measure; prázdné = všechny
  waste: number // %
  note: string
}

/** Řádek s dopočítaným množstvím a částkou (haléře). */
export interface ComputedLine extends DocLine {
  quantity: number
  amount: number
}

export const sections: Section[] = ['work', 'material', 'other']
export const sectionLabels: Record<Section, string> = { work: 'Práce', material: 'Materiál', other: 'Ostatní' }

export const measureLabels: Record<Exclude<Measure, ''>, string> = {
  floor: 'podlahy',
  wall: 'stěny',
  area: 'podlahy + stěny',
  perimeter: 'obvod podlah',
  length: 'délky',
  piece: 'kusy',
}
/** Jednotka, ve které measure vychází. */
export const measureUnits: Record<Exclude<Measure, ''>, string> = { floor: 'm2', wall: 'm2', area: 'm2', perimeter: 'bm', length: 'bm', piece: 'ks' }

export const kindLabels: Record<SurfaceKind, string> = { floor: 'Podlaha', wall: 'Stěna', length: 'Délka', piece: 'Kusy' }

export function lineFromApi(l: ApiLine): DocLine {
  return {
    section: l.section,
    catalog_item_id: l.catalog_item_id ?? null,
    name: l.name,
    unit: l.unit,
    quantity: l.quantity,
    unit_price: l.unit_price,
    discount: l.discount,
    customer_supplied: l.customer_supplied,
    measure: (l.measure || '') as Measure,
    rooms: l.rooms ?? [],
    waste: l.waste,
    note: l.note,
  }
}

/** Řádek pro API (všechna pole explicitně, aby server nedoplňoval z ceníku). */
export function lineToInput(l: DocLine): ApiLineInput {
  return {
    section: l.section,
    catalog_item_id: l.catalog_item_id ?? undefined,
    name: l.name.trim(),
    unit: l.unit,
    quantity: round2(Math.max(0, l.quantity || 0)),
    unit_price: Math.max(0, Math.round(l.unit_price || 0)),
    discount: clampPct(l.discount),
    customer_supplied: l.customer_supplied,
    measure: l.measure,
    rooms: l.measure ? l.rooms.map((n) => n.trim()) : [],
    waste: clampPct(l.waste),
    note: l.note,
  }
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v || 0))

export function lineFromCatalog(c: CatalogItem, rooms: Room[] = []): DocLine {
  const l: DocLine = {
    section: c.kind,
    catalog_item_id: c.id,
    name: c.name,
    unit: c.unit,
    quantity: 1,
    unit_price: c.price,
    discount: c.discount ?? 0,
    customer_supplied: false,
    measure: (c.measure ?? '') as Measure,
    rooms: [],
    waste: c.waste ?? 0,
    note: '',
  }
  if (l.measure) l.quantity = measuredQuantity(rooms, l.measure, [], l.waste)
  return l
}

export function emptyLine(section: Section): DocLine {
  return {
    section,
    catalog_item_id: null,
    name: '',
    unit: section === 'work' ? 'm2' : section === 'material' ? 'ks' : 'kpl',
    quantity: 1,
    unit_price: 0,
    discount: 0,
    customer_supplied: false,
    measure: '',
    rooms: [],
    waste: 0,
    note: '',
  }
}

/** Množství řádku: ze zaměření (measure), jinak ruční. */
export function lineQuantity(l: DocLine, rooms: Room[]): number {
  return l.measure ? measuredQuantity(rooms, l.measure, l.rooms, l.waste) : l.quantity
}

export function computeLines(lines: DocLine[], rooms: Room[]): ComputedLine[] {
  return lines.map((l) => {
    const q = lineQuantity(l, rooms)
    return { ...l, quantity: q, amount: lineAmount(q, l.unit_price, l.discount, l.customer_supplied) }
  })
}

/** Součty dokladu (stejně jako server). */
export function computeTotals(lines: DocLine[], rooms: Room[], discount: number, vatRate: number): Totals {
  return sum(computeLines(lines, rooms), discount || 0, vatRate || 0)
}

/**
 * Po změně zaměření: přejmenované místnosti (podle pořadí) se přejmenují i v řádcích, smazané se z řádků odeberou
 * a měřená množství se přepočtou. Použití: `setDoc({ ...doc, rooms: next, lines: syncLinesWithRooms(doc.lines, doc.rooms, next) })`.
 */
export function syncLinesWithRooms(lines: DocLine[], prev: Room[], next: Room[]): DocLine[] {
  const rename = new Map<string, string>()
  if (prev.length === next.length) prev.forEach((r, i) => r.name !== next[i].name && rename.set(r.name, next[i].name))
  const names = new Set(next.map((r) => r.name))
  return lines.map((l) => {
    if (!l.measure && l.rooms.length === 0) return l
    const rooms = l.rooms.map((n) => rename.get(n) ?? n).filter((n) => names.has(n))
    return { ...l, rooms, quantity: l.measure ? measuredQuantity(next, l.measure, rooms, l.waste) : l.quantity }
  })
}

/** Plochy, které zaměření obsahuje (pro „obvyklé položky“). */
export function presentMeasures(rooms: Room[]): Set<Exclude<Measure, ''>> {
  const s = total(rooms)
  const out = new Set<Exclude<Measure, ''>>()
  for (const m of ['floor', 'wall', 'area', 'perimeter', 'length', 'piece'] as const) if (summaryOf(s, m) > 0) out.add(m)
  return out
}

/** Položky ceníku s `measure`, jejichž plocha je v zaměření a které v dokladu ještě nejsou. */
export function usualLines(catalog: CatalogItem[], rooms: Room[], lines: DocLine[]): DocLine[] {
  const present = presentMeasures(rooms)
  const used = new Set(lines.map((l) => l.catalog_item_id).filter((x) => x != null))
  return catalog
    .filter((c) => c.active && c.measure && present.has(c.measure as Exclude<Measure, ''>) && !used.has(c.id))
    .map((c) => lineFromCatalog(c, rooms))
}

/** Vloží řádky za poslední řádek jejich sekce (doklad zůstane seřazený po sekcích). */
export function insertLines(lines: DocLine[], add: DocLine[]): DocLine[] {
  const out = [...lines]
  for (const l of add) {
    let at = -1
    out.forEach((x, i) => x.section === l.section && (at = i))
    if (at < 0) {
      // za poslední řádek předchozích sekcí
      const order = sections.indexOf(l.section)
      out.forEach((x, i) => sections.indexOf(x.section) < order && (at = i))
    }
    out.splice(at + 1, 0, l)
  }
  return out
}

/** Duplicitní (nebo prázdná) jména místností — server je odmítne. */
export function duplicateRoomNames(rooms: Room[]): Set<string> {
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const r of rooms) {
    const n = r.name.trim()
    if (seen.has(n)) dup.add(n)
    seen.add(n)
  }
  return dup
}

/** Zaměření pro API: ořezané názvy, bez nulových počtů. */
export function roomsToInput(rooms: Room[]): Room[] {
  return rooms.map((r) => ({
    name: r.name.trim(),
    surfaces: (r.surfaces ?? []).map((s) => ({
      ...s,
      name: s.name.trim(),
      count: s.count && s.count > 0 ? s.count : undefined,
      deductions: (s.deductions ?? []).map((d) => ({ ...d, count: d.count && d.count > 0 ? d.count : undefined })),
    })),
  }))
}

/** Výchozí názvy nových ploch. */
export const SURFACE_NAMES: Record<SurfaceKind, string> = { floor: 'Podlaha', wall: 'Stěna', length: 'Lišta', piece: 'Vykružování' }

export function newSurface(kind: SurfaceKind): Surface {
  return { name: SURFACE_NAMES[kind], kind, width: 0, height: 0, count: kind === 'piece' ? 1 : undefined }
}
