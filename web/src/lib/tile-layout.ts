// Kladečský plán (SPEC §5.6): rozložení dlaždic na obdélníkovou plochu (podlaha, stěna) — čistá geometrie bez Reactu.
// Souřadnice výkresu v metrech: x zleva, y SHORA (stěna má podlahu dole, y = H). Nastavení plochy (`Layout`) je v cm / mm.
// Dlaždice začínají od „počáteční dlaždice“ (zarovnání + posun), spáry jen mezi dlaždicemi (u kraje žádná).
// Kousek dlaždice = průnik dlaždice s plochou; otvor (dveře, okno, vana) ho zakryje celý (nepokládá se) nebo z něj
// vyřízne (řezaná dlaždice). Server nic z toho nepočítá — ukládá jen `Layout` a polohy otvorů.
import type { Layout } from './calc'

export type { Layout }
export type Pattern = NonNullable<Layout['pattern']>
export type AlignX = NonNullable<Layout['align_x']>
export type AlignY = NonNullable<Layout['align_y']>

/** Otvor ve výkresu (m, y shora). */
export interface Opening {
  name: string
  /** Index odpočtu v plose (jen pro editor). */
  index?: number
  x: number
  y: number
  w: number
  h: number
}

/** Položený kousek dlaždice (viditelná část v m). */
export interface Piece {
  x: number
  y: number
  w: number
  h: number
  /** Řezaná (u kraje nebo kolem otvoru). */
  cut: boolean
  /** Nejužší část řezu (m), jen u řezané. */
  minCut?: number
  /** Řez užší než ⅓ dlaždice. */
  narrow: boolean
  /** Počáteční dlaždice (od ní se klade). */
  start?: boolean
}

export interface TilePlan {
  pieces: Piece[]
  whole: number
  cut: number
  narrow: number
  /** Nejužší řez v m (null = žádný řez). */
  narrowest: number | null
  /** Šířky krajních kousků v referenční řadě / výšky krajních řad (m), null = celá dlaždice. */
  edges: { left: number | null; right: number | null; top: number | null; bottom: number | null }
}

/** Obvyklé formáty dlaždic (cm). */
export const TILE_PRESETS: [number, number][] = [
  [10, 10],
  [15, 15],
  [20, 20],
  [30, 30],
  [30, 60],
  [60, 60],
  [60, 120],
  [20, 120],
  [10, 30],
]
export const GROUT_PRESETS = [1.5, 2, 3, 5]

export const patternLabels: Record<Pattern, string> = { straight: 'Rovně', half: 'Na vazbu ½', third: 'Na vazbu ⅓' }

const EPS = 1e-6
/** Řez menší než 1 mm se nepočítá (dlaždice je celá). */
const CUT_EPS = 0.001
/** Kousek menší než 2 mm se nepokládá (jen spára / tolerance). */
const MIN_PIECE = 0.002

const positive = (v: number | null | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d)
const finite = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const mod = (a: number, n: number) => ((a % n) + n) % n

/** Výchozí plán plochy: dlažba 60×60 od středu, obklad 30×60 na výšku od podlahy, spára 2 mm. */
export function defaultLayout(kind: 'floor' | 'wall'): Layout {
  return kind === 'wall'
    ? { tile_w: 30, tile_h: 60, grout: 2, pattern: 'straight', align_x: 'center', align_y: 'bottom', offset_x: 0, offset_y: 0 }
    : { tile_w: 60, tile_h: 60, grout: 2, pattern: 'straight', align_x: 'center', align_y: 'center', offset_x: 0, offset_y: 0 }
}

/** Výchozí prořez %: rovně 10 %, na vazbu 15 %. */
export const defaultWaste = (l: Pick<Layout, 'pattern'>) => (l.pattern === 'half' || l.pattern === 'third' ? 15 : 10)

/** Rozměry v metrech. */
function grid(l: Layout) {
  const tw = positive(l.tile_w, 30) / 100
  const th = positive(l.tile_h, 30) / 100
  const g = Math.max(0, finite(l.grout)) / 1000
  const bond = l.pattern === 'half' ? 2 : l.pattern === 'third' ? 3 : 1
  return { tw, th, g, mx: tw + g, my: th + g, bond }
}

/** Levý okraj počáteční dlaždice (m). */
function anchorX(W: number, l: Layout, tw: number) {
  const a = l.align_x === 'left' ? 0 : l.align_x === 'right' ? W - tw : (W - tw) / 2
  return a + finite(l.offset_x) / 100
}

/** Horní okraj počáteční řady (m, shora); `offset_y` posouvá nahoru. */
function anchorY(H: number, l: Layout, th: number, kind: 'floor' | 'wall') {
  const al = l.align_y ?? (kind === 'wall' ? 'bottom' : 'center')
  const a = al === 'top' ? 0 : al === 'bottom' ? H - th : (H - th) / 2
  return a - finite(l.offset_y) / 100
}

/** Posun řady j proti počáteční řadě (vazba). */
const rowShift = (j: number, bond: number, mx: number) => (bond === 1 ? 0 : (mod(j, bond) * mx) / bond)

/**
 * Kousky v jednom rozměru: dlaždice délky `t` s roztečí `m` (dlaždice + spára), jedna začíná v `a`, plocha [0, L].
 * Vrací [začátek, délka] viditelných kousků.
 */
function spans(a: number, t: number, m: number, L: number): [number, number][] {
  const out: [number, number][] = []
  const first = Math.floor((0 - a - t) / m) + 1
  for (let k = first; ; k++) {
    const s = a + k * m
    if (s >= L - EPS) break
    const x0 = Math.max(0, s)
    const x1 = Math.min(L, s + t)
    if (x1 - x0 >= MIN_PIECE) out.push([x0, x1 - x0])
    if (out.length > 5000) break
  }
  return out
}

/** Šířky řezaných krajních kousků (první, poslední; null = celá dlaždice). */
function edgeCuts(a: number, t: number, m: number, L: number): [number | null, number | null] {
  const s = spans(a, t, m, L)
  if (s.length === 0) return [null, null]
  const cut = (v: number) => (v < t - CUT_EPS ? v : null)
  return [cut(s[0][1]), s.length > 1 ? cut(s[s.length - 1][1]) : cut(s[0][1])]
}

/** Dlaždic je moc (mozaika na velké ploše) — kreslí se jen do limitu. */
export const MAX_PIECES = 20000

/** Rozloží dlaždice na plochu W × H (m) s otvory. */
export function tilePlan(W: number, H: number, layout: Layout, openings: Opening[] = [], kind: 'floor' | 'wall' = 'wall'): TilePlan {
  const res: TilePlan = { pieces: [], whole: 0, cut: 0, narrow: 0, narrowest: null, edges: { left: null, right: null, top: null, bottom: null } }
  if (!(W > 0) || !(H > 0)) return res
  const { tw, th, my, mx, bond } = grid(layout)
  const ax = anchorX(W, layout, tw)
  const ay = anchorY(H, layout, th, kind)
  const holes = openings
    .map((o) => ({ ...o, x0: Math.max(0, o.x), y0: Math.max(0, o.y), x1: Math.min(W, o.x + o.w), y1: Math.min(H, o.y + o.h) }))
    .filter((o) => o.x1 - o.x0 > EPS && o.y1 - o.y0 > EPS)

  const jFirst = Math.floor((0 - ay - th) / my) + 1
  const jLast = Math.ceil((H - ay) / my)
  // referenční řada = počáteční, nebo nejbližší viditelná
  let refRow = 0
  if (ay + th <= EPS) refRow = jFirst
  if (ay >= H - EPS) refRow = jLast - 1

  for (let j = jFirst; j <= jLast; j++) {
    const top = ay + j * my
    const y0 = Math.max(0, top)
    const y1 = Math.min(H, top + th)
    if (y1 - y0 < MIN_PIECE) continue
    const a = ax + rowShift(j, bond, mx)
    for (const [x0, w] of spans(a, tw, mx, W)) {
      const p: Piece = { x: x0, y: y0, w, h: y1 - y0, cut: false, narrow: false }
      // řezy u kraje
      const cuts: [number, number][] = [] // [délka zbytku, rozměr dlaždice (0 = řez nejde ovlivnit)]
      if (w < tw - CUT_EPS) cuts.push([w, tw])
      if (p.h < th - CUT_EPS) cuts.push([p.h, th])
      let covered = false
      for (const o of holes) {
        const ox0 = Math.max(o.x0, p.x)
        const ox1 = Math.min(o.x1, p.x + p.w)
        const oy0 = Math.max(o.y0, p.y)
        const oy1 = Math.min(o.y1, p.y + p.h)
        if (ox1 - ox0 <= EPS || oy1 - oy0 <= EPS) continue
        const left = ox0 - p.x
        const right = p.x + p.w - ox1
        const up = oy0 - p.y
        const down = p.y + p.h - oy1
        if (left < MIN_PIECE && right < MIN_PIECE && up < MIN_PIECE && down < MIN_PIECE) {
          covered = true
          break
        }
        // zbytek kolem otvoru: nejužší „nožička“ výřezu; zbytek mezi otvorem a krajem plochy užší než dlaždice
        // (nadpraží dveří, pruh nad vanou u stropu) je daný rozměry — neposune se, proto není „úzký řez“
        for (const [v, t, forced] of [
          [left, tw, p.x <= EPS],
          [right, tw, p.x + p.w >= W - EPS],
          [up, th, p.y <= EPS],
          [down, th, p.y + p.h >= H - EPS],
        ] as const)
          if (v >= MIN_PIECE) cuts.push([v, forced ? 0 : t])
      }
      if (covered) continue
      if (cuts.length > 0) {
        p.cut = true
        p.minCut = Math.min(...cuts.map((c) => c[0]))
        p.narrow = cuts.some(([v, t]) => v < t / 3 - EPS) // t = 0: nevyhnutelný řez
        res.cut++
        if (p.narrow) res.narrow++
        res.narrowest = res.narrowest == null ? p.minCut : Math.min(res.narrowest, p.minCut)
      } else res.whole++
      if (j === 0 && Math.abs(p.x - Math.max(0, ax)) < EPS && ax < W && ax + tw > 0) p.start = true
      if (res.pieces.length < MAX_PIECES) res.pieces.push(p)
    }
  }

  const [l, r] = edgeCuts(ax + rowShift(refRow, bond, mx), tw, mx, W)
  const [t, b] = edgeCuts(ay, th, my, H)
  res.edges = { left: l, right: r, top: t, bottom: b }
  return res
}

/** Hrana otvoru v jednom rozměru: `keep` = na které straně hrany se obkládá. */
interface Boundary {
  e: number
  keep: 'before' | 'after'
}

/**
 * Hrany otvorů uvnitř plochy (svislé pro x, vodorovné pro y). Hrana blíž ke kraji než dlaždice (nadpraží dveří)
 * se vynechá: zbytek je daný rozměry a posunem se nezlepší.
 */
function boundaries(openings: Opening[], axis: 'x' | 'y', L: number, t: number): Boundary[] {
  const out: Boundary[] = []
  for (const o of openings) {
    const a = axis === 'x' ? o.x : o.y
    const b = a + (axis === 'x' ? o.w : o.h)
    if (a >= t && a < L - MIN_PIECE) out.push({ e: a, keep: 'before' })
    if (b > MIN_PIECE && b <= L - t) out.push({ e: b, keep: 'after' })
  }
  return out
}

/**
 * Nejmenší řez jako podíl dlaždice (1 = žádný řez) přes všechny posuny vazby: u krajů plochy a u hran otvorů;
 * `cuts` = počet řezaných míst, `asym` = rozdíl krajů.
 */
function score1D(a: number, t: number, m: number, L: number, shifts: number[], inner: Boundary[] = []) {
  let min = 1
  let cuts = 0
  let asym = 0
  const take = (v: number) => {
    if (v >= MIN_PIECE && v < t - CUT_EPS) {
      min = Math.min(min, v / t)
      cuts++
    }
  }
  for (const s of shifts) {
    const [x, y] = edgeCuts(a + s, t, m, L)
    for (const v of [x, y]) if (v != null) take(v)
    asym = Math.max(asym, Math.abs((x ?? t) - (y ?? t)))
    for (const b of inner) {
      const r = mod(b.e - (a + s), m) // poloha hrany v dlaždici (≥ t = ve spáře)
      if (r < t) take(b.keep === 'before' ? r : t - r)
    }
  }
  return { min, cuts, asym }
}

const better = (a: ReturnType<typeof score1D>, b: ReturnType<typeof score1D>) =>
  a.min > b.min + 1e-6 || (Math.abs(a.min - b.min) <= 1e-6 && (a.cuts < b.cuts || (a.cuts === b.cuts && a.asym < b.asym - 1e-6)))

/** Posun (cm, 1 desetinné místo) od výchozího zarovnání v rozsahu (−rozteč/2, rozteč/2]. */
function toOffset(delta: number, m: number, sign: 1 | -1) {
  let d = mod(delta, m)
  if (d > m / 2 + EPS) d -= m
  return (Math.round(sign * d * 1000) / 10) || 0
}

/**
 * „Optimalizovat řezy“: posun dlaždic (offset_x, offset_y v cm při stávajícím zarovnání), při kterém je nejužší
 * řez (u krajů i kolem otvorů — dveře, okno, vana) co nejširší, pak méně řezů, pak souměrnost.
 */
export function optimizeOffsets(
  W: number,
  H: number,
  layout: Layout,
  kind: 'floor' | 'wall' = 'wall',
  openings: Opening[] = [],
): { offset_x: number; offset_y: number } {
  const { tw, th, mx, my, bond } = grid(layout)
  const shifts = Array.from({ length: bond }, (_, j) => rowShift(j, bond, mx))
  const base = { ...layout, offset_x: 0, offset_y: 0 }
  const bx = anchorX(W, base, tw)
  const by = anchorY(H, base, th, kind)
  const STEP = 0.005
  const bX = boundaries(openings, 'x', W, tw)
  const bY = boundaries(openings, 'y', H, th)
  let bestX = { d: 0, s: score1D(bx, tw, mx, W, shifts, bX) }
  for (let d = 0; d < mx - EPS; d += STEP) {
    const s = score1D(bx + d, tw, mx, W, shifts, bX)
    if (better(s, bestX.s)) bestX = { d, s }
  }
  let bestY = { d: 0, s: score1D(by, th, my, H, [0], bY) }
  for (let d = 0; d < my - EPS; d += STEP) {
    const s = score1D(by + d, th, my, H, [0], bY)
    if (better(s, bestY.s)) bestY = { d, s }
  }
  return { offset_x: toOffset(bestX.d, mx, 1), offset_y: toOffset(bestY.d, my, -1) }
}

/**
 * „Vycentrovat“: zarovnání na střed v obou směrech a posun 0 (dlaždice na ose) nebo o půl rozteče (spára na ose) —
 * co dá širší krajní řezy. Řezy na obou stranách jsou stejné.
 */
export function centerLayout(W: number, H: number, layout: Layout, kind: 'floor' | 'wall' = 'wall'): Layout {
  const { tw, th, mx, my, bond } = grid(layout)
  const shifts = Array.from({ length: bond }, (_, j) => rowShift(j, bond, mx))
  const c = { ...layout, align_x: 'center' as const, align_y: 'center' as const, offset_x: 0, offset_y: 0 }
  const bx = anchorX(W, c, tw)
  const by = anchorY(H, c, th, kind)
  const ox = better(score1D(bx + mx / 2, tw, mx, W, shifts), score1D(bx, tw, mx, W, shifts)) ? toOffset(mx / 2, mx, 1) : 0
  const oy = better(score1D(by + my / 2, th, my, H, [0]), score1D(by, th, my, H, [0])) ? toOffset(my / 2, my, -1) : 0
  return { ...c, offset_x: ox, offset_y: oy }
}

export interface Purchase {
  waste: number // %
  /** m² k nákupu = plocha × (1 + prořez). */
  m2: number
  /** Dlaždic k nákupu (z m²). */
  tiles: number
  /** Balení (null = neznámé m² v balení). */
  boxes: number | null
}

/** Nákup dlaždic na čistou plochu (m²) s prořezem. */
export function purchase(area: number, layout: Layout): Purchase {
  const waste = layout.waste != null && Number.isFinite(layout.waste) && layout.waste >= 0 ? layout.waste : defaultWaste(layout)
  const m2 = Math.round(Math.max(0, area) * (1 + waste / 100) * 100) / 100
  const { tw, th } = grid(layout)
  const tiles = m2 > 0 ? Math.ceil(m2 / (tw * th) - 1e-9) : 0
  const box = positive(layout.box_m2, 0)
  return { waste, m2, tiles, boxes: box > 0 && m2 > 0 ? Math.ceil(m2 / box - 1e-9) : null }
}

/** Krátký popis: „30×60 cm, spára 2 mm, na vazbu ½“. */
export function layoutLabel(l: Layout): string {
  const g = finite(l.grout)
  return `${fmtCm(l.tile_w)}×${fmtCm(l.tile_h)} cm, spára ${String(g).replace('.', ',')} mm${l.pattern && l.pattern !== 'straight' ? `, ${patternLabels[l.pattern].toLowerCase()}` : ''}`
}

const fmtCm = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',')
