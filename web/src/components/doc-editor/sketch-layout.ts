// Rozvržení náčrtu místnosti ze zaměření (SPEC §5.1) — čistá geometrie bez Reactu, vykresluje room-sketch.tsx.
// Jedno měřítko na místnost (px na metr), aby šly plochy porovnat; podlahy půdorysem, stěny rozvinutě
// na společné základně, délky čarou, kusy kolečky. Odpočty (dveře, okna, vana) jako výřezy „rozumně“ umístěné.
import { round2, surfaceArea, type Deduction, type Room, type Surface } from '@/lib/calc'
import { num } from '@/lib/format'

export type SketchTone = 'normal' | 'muted' | 'strong' | 'cut' | 'warn'

export interface SketchText {
  x: number
  y: number // účaří
  text: string
  anchor: 'start' | 'middle' | 'end'
  size: number
  tone: SketchTone
  /** Svisle (otočeno o −90° kolem x,y). */
  vertical?: boolean
}

export interface SketchRect {
  x: number
  y: number
  w: number
  h: number
}

/** Výřez (odpočet) v px; `clamped` = nevešel se do plochy (překlep?). */
export interface SketchCut extends SketchRect {
  name: string
  clamped: boolean
}

export interface SketchItem {
  /** Index plochy v `room.surfaces`. */
  index: number
  kind: 'floor' | 'wall' | 'length' | 'piece'
  /** Obdélník plochy (podlaha, stěna); `dashed` = ručně zadaná plocha (nepravidelný tvar). */
  box?: SketchRect & { dashed: boolean }
  /** Počátek dlaždic (pro <pattern>): podlaha od rohu, stěna od podlahy. */
  tileOrigin?: { x: number; y: number }
  cuts: SketchCut[]
  /** Kótovací čáry s koncovými značkami. */
  dims: { x1: number; y1: number; x2: number; y2: number }[]
  texts: SketchText[]
  /** Délkový prvek: čára se značkami (x), `broken` = delší než šířka náčrtu. */
  line?: {
    x1: number
    x2: number
    y: number
    ticks: number[]
    broken: boolean
  }
  dots?: { cx: number; cy: number; r: number }[]
  /** Varování (odpočet větší než plocha) — značka a text pro title. */
  warning?: { x: number; y: number; message: string }
  /** Oblast pro klik. */
  hit: SketchRect
}

export interface SketchLayout {
  width: number
  height: number
  /** px na metr. */
  scale: number
  /** Nadpisy sekcí. */
  labels: SketchText[]
  items: SketchItem[]
}

// Rozměry v px.
const PAD = 4
const FONT = 11
const SMALL = 10
const DIM = 18 // místo pro kótu (nahoře / vlevo)
const CAPTION = 16 // popisek pod plochou
const NAME = 15 // název nad stěnou
const GAP_X = 14
const GAP_Y = 12
const HEADING = 16
const MAX_SCALE = 70
const MIN_SCALE = 30
const MAX_BOX_H = 240
/** Nejvíc kopií stěny kreslených vedle sebe (víc = jedna s „× N“). */
export const MAX_COPIES = 4
/** Nejvíc koleček u kusů (zbytek „+N“). */
export const MAX_DOTS = 10
const EPS = 1e-6

/** Přibližná šířka textu v px (bezpatkové písmo). */
export const textWidth = (s: string, size = FONT) => s.length * size * 0.56

const pos = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
const cnt = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1)
const m = (v: number) => `${num(round2(v))} m`
const m2 = (v: number) => `${num(round2(v))} m²`

/** Zkrátí text na šířku (px) s „…“. */
export function fit(s: string, width: number, size = FONT): string {
  const max = Math.floor(width / (size * 0.56))
  if (s.length <= max) return s
  return max <= 1 ? '' : s.slice(0, max - 1) + '…'
}

/** Druh odpočtu podle názvu: dveře dole uprostřed, okno s parapetem 0,9 m, vana dole vlevo, jinak uprostřed. */
export function cutKind(name: string): 'door' | 'window' | 'bath' | 'other' {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('dver')) return 'door'
  if (n.includes('okn')) return 'window'
  if (n.includes('van')) return 'bath'
  return 'other'
}

/** Umístěný odpočet v metrech: x zleva, y odspodu (stěna) / shora (podlaha). */
export interface PlacedCut {
  name: string
  x: number
  y: number
  w: number
  h: number
  clamped: boolean
}

const SILL = 0.9

/**
 * Rozmístí odpočty plochy W × H (m) do `copies` kopií (stěna „× 2“ = dvě stěny vedle sebe).
 * Kusy odpočtu (count) se rozloží; do kopie se dávají, dokud se vejdou na šířku. Nevejde-li se odpočet,
 * zmenší se na plochu a dostane `clamped`.
 */
export function placeCuts(kind: 'floor' | 'wall', W: number, H: number, deductions: Deduction[], copies = 1): PlacedCut[][] {
  const out: PlacedCut[][] = Array.from({ length: Math.max(1, copies) }, () => [])
  if (W <= 0 || H <= 0) return out
  const inst: PlacedCut[] = []
  for (const d of deductions) {
    const w = pos(d.width)
    const h = pos(d.height)
    if (!w || !h) continue
    const n = Math.min(cnt(d.count), 20)
    for (let i = 0; i < n; i++)
      inst.push({
        name: d.name,
        x: 0,
        y: 0,
        w: Math.min(w, W),
        h: Math.min(h, H),
        clamped: w > W + EPS || h > H + EPS,
      })
  }
  // první kopie, kam se kus vejde na šířku; jinak nejméně zaplněná
  const used = out.map(() => 0)
  for (const c of inst) {
    let k = used.findIndex((u) => u + c.w <= W + EPS)
    if (k < 0) k = used.indexOf(Math.min(...used))
    used[k] += c.w
    out[k].push(c)
  }
  for (const list of out) arrange(kind, W, H, list)
  return out
}

function arrange(kind: 'floor' | 'wall', W: number, H: number, list: PlacedCut[]) {
  if (list.length === 0) return
  // vana ke stěně vlevo, ostatní rovnoměrně ve zbytku
  list.sort((a, b) => Number(cutKind(b.name) === 'bath') - Number(cutKind(a.name) === 'bath'))
  let start = 0
  let rest = list
  if (cutKind(list[0].name) === 'bath') {
    list[0].x = 0
    start = list[0].w
    rest = list.slice(1)
  }
  const span = W - start
  const total = rest.reduce((a, c) => a + c.w, 0)
  if (total <= span + EPS) {
    const gap = (span - total) / (rest.length + 1)
    let x = start + gap
    for (const c of rest) {
      c.x = x
      x += c.w + gap
    }
  } else {
    // nevejdou se vedle sebe: překryjí se rovnoměrně přes celou šířku
    rest.forEach((c, i) => {
      c.x = rest.length === 1 ? (W - c.w) / 2 : ((W - c.w) * i) / (rest.length - 1)
      c.clamped = true
    })
  }
  for (const c of list) {
    const k = cutKind(c.name)
    if (kind === 'floor') c.y = k === 'bath' ? 0 : (H - c.h) / 2
    else if (k === 'door' || k === 'bath') c.y = 0
    else if (k === 'window') c.y = Math.max(0, Math.min(SILL, H - c.h))
    else c.y = (H - c.h) / 2
  }
}

/** Rozmístí bloky (w × h) do řádků široké `maxW`; `bottom` = zarovnat na společnou základnu řádku. */
function flow(blocks: { w: number; h: number }[], maxW: number, bottom: boolean): { pos: { x: number; y: number }[]; height: number } {
  const res: { x: number; y: number }[] = []
  let x = 0
  let y = 0
  let row: number[] = []
  let rowH = 0
  const close = () => {
    for (const i of row) res[i].y = y + (bottom ? rowH - blocks[i].h : 0)
    y += rowH + GAP_Y
    row = []
    rowH = 0
    x = 0
  }
  blocks.forEach((b, i) => {
    if (row.length > 0 && x + b.w > maxW) close()
    res[i] = { x, y: 0 }
    row.push(i)
    x += b.w + GAP_X
    rowH = Math.max(rowH, b.h)
  })
  if (row.length) close()
  return { pos: res, height: Math.max(0, y - GAP_Y) }
}

interface Drawable {
  s: Surface
  index: number
  kind: SketchItem['kind']
  manual: boolean
  w: number // m
  h: number // m
}

/** Plochy, které jde nakreslit (nulové rozměry se vynechají). */
function drawables(room: Room): Drawable[] {
  const out: Drawable[] = []
  ;(room.surfaces ?? []).forEach((s, index) => {
    const kind = s.kind as SketchItem['kind']
    if (kind === 'floor' || kind === 'wall') {
      if (s.area != null) {
        const a = pos(s.area)
        if (a)
          out.push({
            s,
            index,
            kind,
            manual: true,
            w: Math.sqrt(a),
            h: Math.sqrt(a),
          })
      } else if (pos(s.width) && pos(s.height)) out.push({ s, index, kind, manual: false, w: s.width, h: s.height })
    } else if (kind === 'length') {
      if (pos(s.width)) out.push({ s, index, kind, manual: false, w: s.width, h: 0 })
    } else if (kind === 'piece') out.push({ s, index, kind, manual: false, w: 0, h: 0 })
  })
  return out
}

/** Má místnost co kreslit? */
export const hasSketch = (room: Room) => drawables(room).length > 0

/** Rozvržení náčrtu místnosti do šířky `width` px. */
export function layoutRoom(room: Room, width: number): SketchLayout {
  const W = Math.max(120, Number.isFinite(width) ? width : 360)
  const inner = W - 2 * PAD
  const ds = drawables(room)
  const areas = ds.filter((d) => d.kind === 'floor' || d.kind === 'wall')
  const maxW = Math.max(0, ...areas.map((d) => d.w))
  const maxH = Math.max(0, ...areas.map((d) => d.h))
  let scale = MAX_SCALE
  if (maxW > 0) scale = Math.min(scale, (inner - DIM) / maxW)
  if (maxH > 0) scale = Math.min(scale, MAX_BOX_H / maxH)
  scale = Math.max(scale, 0.5)
  // Na úzkém displeji by náčrt byl nekonečně vysoký: zmenšuj měřítko (stěny se pak vejdou do méně řádků),
  // dokud se nevejde do výšky — ale ne pod 60 % a ne pod MIN_SCALE.
  const budget = Math.max(340, W * 1.3)
  let best = build(ds, W, scale)
  for (const f of [0.85, 0.7, 0.6]) {
    if (best.height <= budget || scale * f < MIN_SCALE) break
    const l = build(ds, W, scale * f)
    if (l.height < best.height) best = l
  }
  return best
}

function build(ds: Drawable[], W: number, scale: number): SketchLayout {
  const inner = W - 2 * PAD
  const labels: SketchText[] = []
  const items: SketchItem[] = []
  let y = PAD

  const section = (title: string, blocks: { w: number; h: number }[], bottom: boolean) => {
    labels.push({
      x: PAD,
      y: y + FONT,
      text: title,
      anchor: 'start',
      size: SMALL,
      tone: 'muted',
    })
    y += HEADING
    const f = flow(blocks, inner, bottom)
    const top = y
    y += f.height + GAP_Y + 4
    return f.pos.map((p) => ({ x: PAD + p.x, y: top + p.y }))
  }

  // --- podlahy (půdorys)
  const floors = ds.filter((d) => d.kind === 'floor')
  if (floors.length) {
    const blocks = floors.map((d) => {
      const bw = Math.max(d.w * scale, 2)
      const bh = Math.max(d.h * scale, 2)
      return { w: DIM + Math.max(bw, 40), h: DIM + bh + CAPTION, bw, bh }
    })
    const ps = section(floors.length > 1 ? 'Podlahy — půdorys' : 'Podlaha — půdorys', blocks, false)
    floors.forEach((d, i) => items.push(floorItem(d, ps[i].x, ps[i].y, blocks[i].bw, blocks[i].bh, scale)))
  }

  // --- stěny (rozvinuté na společné základně)
  const walls = ds.filter((d) => d.kind === 'wall')
  if (walls.length) {
    const copies: {
      d: Drawable
      copy: number
      of: number
      cuts: PlacedCut[]
    }[] = []
    for (const d of walls) {
      const n = cnt(d.s.count)
      const of = d.manual || n > MAX_COPIES ? 1 : n
      const placed = d.manual ? [[]] : placeCuts('wall', d.w, d.h, d.s.deductions ?? [], of)
      for (let c = 0; c < of; c++) copies.push({ d, copy: c, of, cuts: placed[c] })
    }
    const blocks = copies.map(({ d }) => {
      const bw = Math.max(d.w * scale, 2)
      const bh = Math.max(d.h * scale, 2)
      return { w: DIM + Math.max(bw, 24), h: NAME + bh + CAPTION, bw, bh }
    })
    const ps = section(walls.length > 1 || copies.length > 1 ? 'Stěny — rozvinuté' : 'Stěna — pohled', blocks, true)
    copies.forEach((c, i) => items.push(wallItem(c.d, c.cuts, c.of, ps[i].x, ps[i].y, blocks[i].bw, blocks[i].bh, scale)))
  }

  // --- délky a kusy
  const rest = ds.filter((d) => d.kind === 'length' || d.kind === 'piece')
  if (rest.length) {
    const blocks = rest.map((d) => {
      const label = restLabel(d)
      if (d.kind === 'length') {
        const lw = Math.min(d.w * scale, inner - 8)
        return {
          w: Math.min(inner, Math.max(lw + 8, textWidth(label))),
          h: FONT + 16,
          lw,
        }
      }
      const n = Math.min(cnt(d.s.count), MAX_DOTS)
      const extra = cnt(d.s.count) > MAX_DOTS ? 28 : 0
      return {
        w: Math.min(inner, Math.max(n * 14 + extra, textWidth(label))),
        h: FONT + 18,
        lw: 0,
      }
    })
    const ps = section(rest.some((d) => d.kind === 'length') ? (rest.some((d) => d.kind === 'piece') ? 'Délky a kusy' : 'Délky') : 'Kusy', blocks, false)
    rest.forEach((d, i) => items.push(restItem(d, ps[i].x, ps[i].y, blocks[i].w, blocks[i].lw, scale)))
  }

  return {
    width: W,
    height: items.length ? y - GAP_Y : 0,
    scale,
    labels,
    items,
  }
}

function floorItem(d: Drawable, x0: number, y0: number, bw: number, bh: number, scale: number): SketchItem {
  const s = d.s
  const bx = x0 + DIM
  const by = y0 + DIM
  const n = cnt(s.count)
  const texts: SketchText[] = []
  const dims: SketchItem['dims'] = []
  const cuts: SketchCut[] = []
  let warning: SketchItem['warning']
  const area = surfaceArea(s)
  const name = s.name.trim() || 'Podlaha'
  const slotW = Math.max(bw, 40) + DIM

  if (d.manual) {
    texts.push(...centerLabel(`≈ ${m2(area)}`, bx, by, bw, bh))
    texts.push({
      x: bx,
      y: by + bh + FONT + 2,
      text: fit(`${name} (nepravidelná)`, slotW - DIM + 10),
      anchor: 'start',
      size: SMALL,
      tone: 'muted',
    })
  } else {
    dims.push({ x1: bx, y1: by - 6, x2: bx + bw, y2: by - 6 })
    texts.push({
      x: bx + bw / 2,
      y: by - 9,
      text: m(s.width),
      anchor: 'middle',
      size: SMALL,
      tone: 'normal',
    })
    dims.push({ x1: bx - 6, y1: by, x2: bx - 6, y2: by + bh })
    texts.push({
      x: bx - 8,
      y: by + bh / 2,
      text: m(s.height),
      anchor: 'middle',
      size: SMALL,
      tone: 'normal',
      vertical: true,
    })
    const [placed] = placeCuts('floor', d.w, d.h, s.deductions ?? [])
    for (const c of placed)
      cuts.push({
        x: bx + c.x * scale,
        y: by + c.y * scale,
        w: c.w * scale,
        h: c.h * scale,
        name: c.name,
        clamped: c.clamped,
      })
    const inside = centerLabel(m2(area), bx, by, bw, bh)
    let caption = name + (n > 1 ? ` × ${n}` : '')
    if (inside.length) texts.push(...inside)
    else caption += ` · ${m2(area)}`
    texts.push({
      x: bx,
      y: by + bh + FONT + 2,
      text: fit(caption, slotW - DIM + 10),
      anchor: 'start',
      size: SMALL,
      tone: 'muted',
    })
    if (n > 1 && bw > 34 && bh > 30)
      texts.push({
        x: bx + bw - 4,
        y: by + bh - 4,
        text: `× ${n}`,
        anchor: 'end',
        size: SMALL,
        tone: 'strong',
      })
    warning = cutWarning(s, cuts, bx, by, bw)
  }
  return {
    index: d.index,
    kind: 'floor',
    box: { x: bx, y: by, w: bw, h: bh, dashed: d.manual },
    tileOrigin: { x: bx, y: by },
    cuts,
    dims,
    texts,
    warning,
    hit: { x: x0, y: y0, w: slotW, h: DIM + bh + CAPTION },
  }
}

function wallItem(d: Drawable, placed: PlacedCut[], copies: number, x0: number, y0: number, bw: number, bh: number, scale: number): SketchItem {
  const s = d.s
  const bx = x0 + DIM
  const by = y0 + NAME
  const n = cnt(s.count)
  const texts: SketchText[] = []
  const dims: SketchItem['dims'] = []
  const cuts: SketchCut[] = []
  const name = s.name.trim() || 'Stěna'
  const slotW = Math.max(bw, 24)
  // jedna kreslená stěna za víc kusů → „× N“ v názvu
  const title = copies === 1 && n > 1 ? `${name} × ${n}` : name
  texts.push({
    x: bx + bw / 2,
    y: by - 4,
    text: fit(title, slotW + DIM - 4, SMALL),
    anchor: 'middle',
    size: SMALL,
    tone: 'strong',
  })

  let area: number
  if (d.manual) {
    area = surfaceArea(s)
    texts.push(...centerLabel(`≈ ${m2(area)}`, bx, by, bw, bh))
    texts.push({
      x: bx + bw / 2,
      y: by + bh + FONT + 1,
      text: fit('nepravidelná', slotW + DIM, SMALL),
      anchor: 'middle',
      size: SMALL,
      tone: 'muted',
    })
  } else {
    for (const c of placed)
      cuts.push({
        x: bx + c.x * scale,
        y: by + bh - (c.y + c.h) * scale,
        w: c.w * scale,
        h: c.h * scale,
        name: c.name,
        clamped: c.clamped,
      })
    // plocha této kopie; jediná kreslená za víc kusů = celá plocha
    area = copies === 1 ? surfaceArea(s) : round2(Math.max(0, d.w * d.h - placed.reduce((a, c) => a + c.w * c.h, 0)))
    const inside = centerLabel(m2(area), bx, by, bw, bh, cuts)
    texts.push(...inside)
    dims.push({ x1: bx, y1: by + bh + 4, x2: bx + bw, y2: by + bh + 4 })
    const wl = inside.length ? num(round2(s.width)) : `${num(round2(s.width))} · ${m2(area)}`
    texts.push({
      x: bx + bw / 2,
      y: by + bh + FONT + 4,
      text: fit(wl, slotW + DIM, SMALL),
      anchor: 'middle',
      size: SMALL,
      tone: 'normal',
    })
    texts.push({
      x: bx - 5,
      y: by + bh / 2,
      text: num(round2(s.height)),
      anchor: 'middle',
      size: SMALL,
      tone: 'muted',
      vertical: true,
    })
  }
  return {
    index: d.index,
    kind: 'wall',
    box: { x: bx, y: by, w: bw, h: bh, dashed: d.manual },
    tileOrigin: { x: bx, y: by + bh },
    cuts,
    dims,
    texts,
    warning: d.manual ? undefined : cutWarning(s, cuts, bx, by, bw),
    hit: { x: x0, y: y0, w: slotW + DIM, h: NAME + bh + CAPTION },
  }
}

/** Varování: odpočet se nevejde, nebo odpočty jsou větší než plocha. */
function cutWarning(s: Surface, cuts: SketchCut[], bx: number, by: number, bw: number): SketchItem['warning'] {
  const bad = cuts.filter((c) => c.clamped)
  const gross = pos(s.width) * pos(s.height) * cnt(s.count)
  const ded = (s.deductions ?? []).reduce((a, d) => a + pos(d.width) * pos(d.height) * cnt(d.count), 0)
  if (bad.length === 0 && ded <= gross + EPS) return undefined
  const names = [...new Set(bad.map((c) => c.name.trim() || 'odpočet'))].join(', ')
  const message = bad.length ? `Nevejde se: ${names} — zkontrolujte rozměry.` : 'Odpočty jsou větší než plocha — zkontrolujte rozměry.'
  return { x: bx + bw - 7, y: by + 7, message }
}

/** Popisek doprostřed obdélníku (vodorovně, svisle, nebo nic, když se nevejde). Vyhne se výřezům, jde-li to. */
function centerLabel(text: string, bx: number, by: number, bw: number, bh: number, cuts: SketchCut[] = []): SketchText[] {
  const tw = textWidth(text)
  if (tw + 6 <= bw && bh >= FONT + 6) {
    // nad výřezy (dveře uprostřed): posuň do horní volné části
    let cy = by + bh / 2
    const top = Math.min(by + bh, ...cuts.filter((c) => c.x < bx + bw / 2 + tw / 2 && c.x + c.w > bx + bw / 2 - tw / 2).map((c) => c.y))
    let cx = bx + bw / 2
    if (top < cy + FONT / 2 + 2) {
      if (top - by >= FONT + 4) cy = by + (top - by) / 2
      else {
        // vysoký výřez (dveře): do nejširší volné mezery vedle výřezů
        const blocks = cuts.filter((c) => c.y < cy + FONT / 2 && c.y + c.h > cy - FONT / 2).sort((a, b) => a.x - b.x)
        let best = { from: bx, to: bx }
        let from = bx
        for (const c of [...blocks, { x: bx + bw, w: 0 }]) {
          if (c.x - from > best.to - best.from) best = { from, to: c.x }
          from = Math.max(from, c.x + c.w)
        }
        if (best.to - best.from >= tw + 2) cx = (best.from + best.to) / 2
      }
    }
    return [
      {
        x: cx,
        y: cy + FONT * 0.36,
        text,
        anchor: 'middle',
        size: FONT,
        tone: 'strong',
      },
    ]
  }
  if (tw + 6 <= bh && bw >= FONT + 4)
    return [
      {
        x: bx + bw / 2 + FONT * 0.36,
        y: by + bh / 2,
        text,
        anchor: 'middle',
        size: FONT,
        tone: 'strong',
        vertical: true,
      },
    ]
  return []
}

function restLabel(d: Drawable): string {
  const s = d.s
  const n = cnt(s.count)
  if (d.kind === 'piece') return `${s.name.trim() || 'Kusy'} ${num(n)} ks`
  const name = s.name.trim() || 'Délka'
  return n > 1 ? `${name} ${n} × ${m(s.width)} = ${num(round2(s.width * n))} bm` : `${name} ${num(round2(s.width))} bm`
}

function restItem(d: Drawable, x0: number, y0: number, slotW: number, lw: number, scale: number): SketchItem {
  const texts: SketchText[] = [
    {
      x: x0,
      y: y0 + FONT,
      text: fit(restLabel(d), slotW),
      anchor: 'start',
      size: FONT,
      tone: 'strong',
    },
  ]
  const base: SketchItem = {
    index: d.index,
    kind: d.kind,
    cuts: [],
    dims: [],
    texts,
    hit: { x: x0, y: y0, w: slotW, h: FONT + 18 },
  }
  const cy = y0 + FONT + 10
  if (d.kind === 'length') {
    const x1 = x0 + 2
    const x2 = x1 + Math.max(lw, 4)
    const ticks: number[] = []
    if (scale >= 8) for (let k = 1; k * scale < x2 - x1 - 2; k++) ticks.push(x1 + k * scale)
    return {
      ...base,
      line: { x1, x2, y: cy, ticks, broken: d.w * scale > lw + 0.5 },
    }
  }
  const n = cnt(d.s.count)
  const dots = Array.from({ length: Math.min(n, MAX_DOTS) }, (_, i) => ({
    cx: x0 + 6 + i * 14,
    cy,
    r: 5,
  }))
  if (n > MAX_DOTS)
    texts.push({
      x: x0 + MAX_DOTS * 14 + 2,
      y: cy + 4,
      text: `+${n - MAX_DOTS}`,
      anchor: 'start',
      size: SMALL,
      tone: 'muted',
    })
  return { ...base, dots }
}
