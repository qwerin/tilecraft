// Výkres kladečského plánu (SPEC §5.6) jako samostatné SVG (řetězec): totéž se ukazuje v editoru plánu
// a převádí na PNG přílohu (kategorie „Kladečský plán“) — proto pevné barvy „papíru“, ne barvy tématu.
// Geometrie dlaždic je v lib/tile-layout.ts, umístění otvorů v sketch-layout.ts (placeCuts + zadané polohy).
import { round2, surfaceArea, type Room, type Surface } from '@/lib/calc'
import { num } from '@/lib/format'
import { layoutLabel, purchase, tilePlan, type Layout, type Opening, type Purchase, type TilePlan } from '@/lib/tile-layout'
import { MAX_COPIES, placeCuts } from './sketch-layout'

/** Jedna kreslená plocha plánu (stěna „× 2“ = dva panely). */
export interface PlanPanel {
  /** Index plochy v `room.surfaces`. */
  index: number
  kind: 'floor' | 'wall'
  title: string
  W: number
  H: number
  layout: Layout
  openings: Opening[]
  plan: TilePlan
  /** Panel zastupuje víc stejných ploch (podlaha × 2, víc než MAX_COPIES stěn). */
  times: number
}

/** Plocha, pro kterou jde kladečský plán (podlaha nebo stěna zadaná rozměry). */
export const canPlan = (s: Surface) => (s.kind === 'floor' || s.kind === 'wall') && s.area == null && s.width > 0 && s.height > 0

const cnt = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1)

/** Panely plochy s plánem `layout` (výchozí = uložený). */
export function surfacePanels(s: Surface, index: number, layout: Layout | null | undefined = s.layout): PlanPanel[] {
  if (!layout || !canPlan(s)) return []
  const kind = s.kind as 'floor' | 'wall'
  const n = cnt(s.count)
  const of = kind === 'wall' && n <= MAX_COPIES ? n : 1
  const placed = placeCuts(kind, s.width, s.height, s.deductions ?? [], of)
  const name = s.name.trim() || (kind === 'floor' ? 'Podlaha' : 'Stěna')
  return placed.map((cuts, c) => {
    const openings: Opening[] = cuts.map((p) => ({
      name: p.name,
      index: p.index,
      x: p.x,
      y: kind === 'floor' ? p.y : s.height - p.y - p.h,
      w: p.w,
      h: p.h,
    }))
    return {
      index,
      kind,
      title: of > 1 ? `${name} (${c + 1}/${of})` : n > 1 ? `${name} × ${n}` : name,
      W: s.width,
      H: s.height,
      layout,
      openings,
      plan: tilePlan(s.width, s.height, layout, openings, kind),
      times: of > 1 ? 1 : n,
    }
  })
}

/** Panely všech ploch místnosti, které mají plán. */
export function roomPanels(room: Room): PlanPanel[] {
  return (room.surfaces ?? []).flatMap((s, i) => surfacePanels(s, i))
}

export interface PlanStats {
  whole: number
  cut: number
  narrow: number
  narrowest: number | null
  area: number
  buy: Purchase
}

/** Souhrn plochy přes její panely: kusy na výkresu, nejužší řez, nákup s prořezem. */
export function surfaceStats(s: Surface, panels: PlanPanel[]): PlanStats | null {
  if (panels.length === 0) return null
  const st = { whole: 0, cut: 0, narrow: 0, narrowest: null as number | null }
  for (const p of panels) {
    st.whole += p.plan.whole * p.times
    st.cut += p.plan.cut * p.times
    st.narrow += p.plan.narrow * p.times
    if (p.plan.narrowest != null) st.narrowest = st.narrowest == null ? p.plan.narrowest : Math.min(st.narrowest, p.plan.narrowest)
  }
  const area = surfaceArea(s)
  return { ...st, area, buy: purchase(area, panels[0].layout) }
}

// --- kreslení

const C = {
  paper: '#ffffff',
  grout: '#a8a196',
  tile: '#eee8dd',
  cut: '#f6d699',
  narrow: '#f09a8c',
  start: '#1d4ed8',
  line: '#374151',
  muted: '#6b7280',
  hole: '#ffffff',
  hatch: '#9ca3af',
  warn: '#b91c1c',
}
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const f1 = (v: number) => (Math.round(v * 10) / 10).toString()
/** cm s jedním desetinným místem („11,5“). */
export const cm = (m: number) => num(Math.round(m * 1000) / 10)
const mm = (v: number) => `${num(round2(v))} m`

interface Box {
  w: number
  h: number
}

// okraje panelu (px)
const TOP = 52 // název, popis, kóta šířky
const LEFT = 30 // kóta výšky
const RIGHT = 46 // výšky krajních řad
const BOTTOM = 40 // šířky krajních kousků, statistika
const GAP = 22

function panelBox(p: PlanPanel, scale: number): Box {
  return { w: LEFT + p.W * scale + RIGHT, h: TOP + p.H * scale + BOTTOM }
}

function text(x: number, y: number, t: string, o: { size?: number; anchor?: string; fill?: string; weight?: number; rotate?: boolean } = {}) {
  const size = o.size ?? 12
  return `<text x="${f1(x)}" y="${f1(y)}" font-size="${size}" text-anchor="${o.anchor ?? 'start'}" fill="${o.fill ?? C.line}"${
    o.weight ? ` font-weight="${o.weight}"` : ''
  }${o.rotate ? ` transform="rotate(-90 ${f1(x)} ${f1(y)})"` : ''}>${esc(t)}</text>`
}

function dimLine(x1: number, y1: number, x2: number, y2: number) {
  const t = (x: number, y: number) => `<line x1="${f1(x - 3)}" y1="${f1(y + 3)}" x2="${f1(x + 3)}" y2="${f1(y - 3)}"/>`
  return `<g stroke="${C.muted}" stroke-width="0.8"><line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>${t(x1, y1)}${t(x2, y2)}</g>`
}

/** Jeden panel na pozici (x0, y0). */
function panelSvg(p: PlanPanel, x0: number, y0: number, scale: number, uid: string): string {
  const out: string[] = []
  const bx = x0 + LEFT
  const by = y0 + TOP
  const bw = p.W * scale
  const bh = p.H * scale
  const X = (m: number) => bx + m * scale
  const Y = (m: number) => by + m * scale
  const g = (p.layout.grout / 1000) * scale

  out.push(text(x0, y0 + 15, p.title, { size: 15, weight: 600 }))
  out.push(text(x0, y0 + 31, `${p.kind === 'floor' ? 'Dlažba' : 'Obklad'} ${layoutLabel(p.layout)}`, { size: 12, fill: C.muted }))
  // kóty
  out.push(dimLine(bx, by - 8, bx + bw, by - 8))
  out.push(text(bx + bw / 2, by - 12, mm(p.W), { size: 11, anchor: 'middle' }))
  out.push(dimLine(bx - 10, by, bx - 10, by + bh))
  out.push(text(bx - 14, by + bh / 2, mm(p.H), { size: 11, anchor: 'middle', rotate: true }))

  // plocha: spárovací hmota, na ní dlaždice
  out.push(`<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh)}" fill="${C.grout}"/>`)
  const stroke = g < 0.7 ? ` stroke="${C.grout}" stroke-width="${f1(Math.min(0.7, Math.max(0.35, 0.7 - g)))}"` : ''
  const groups: Record<'tile' | 'cut' | 'narrow', string[]> = { tile: [], cut: [], narrow: [] }
  for (const t of p.plan.pieces) {
    const k = t.narrow ? 'narrow' : t.cut ? 'cut' : 'tile'
    groups[k].push(`<rect x="${f1(X(t.x))}" y="${f1(Y(t.y))}" width="${f1(t.w * scale)}" height="${f1(t.h * scale)}"/>`)
  }
  for (const k of ['tile', 'cut', 'narrow'] as const) if (groups[k].length) out.push(`<g fill="${C[k]}"${stroke}>${groups[k].join('')}</g>`)
  const start = p.plan.pieces.find((t) => t.start)
  if (start)
    out.push(
      `<rect x="${f1(X(start.x) + 1)}" y="${f1(Y(start.y) + 1)}" width="${f1(Math.max(1, start.w * scale - 2))}" height="${f1(Math.max(1, start.h * scale - 2))}" fill="none" stroke="${C.start}" stroke-width="2"/>`,
    )

  // otvory
  for (const o of p.openings) {
    const ox = X(o.x)
    const oy = Y(o.y)
    const ow = o.w * scale
    const oh = o.h * scale
    out.push(`<rect x="${f1(ox)}" y="${f1(oy)}" width="${f1(ow)}" height="${f1(oh)}" fill="${C.hole}"/>`)
    out.push(`<rect x="${f1(ox)}" y="${f1(oy)}" width="${f1(ow)}" height="${f1(oh)}" fill="url(#${uid}-hatch)" stroke="${C.line}" stroke-width="1.2"/>`)
    const label = o.name.trim() || 'Otvor'
    const dims = `${cm(o.w)} × ${cm(o.h)}`
    if (ow > 34 && oh > 30) {
      const size = Math.min(12, Math.max(9, ow / 7))
      const cx = ox + ow / 2
      const cy = oy + oh / 2
      out.push(
        `<g paint-order="stroke" stroke="${C.paper}" stroke-width="3" stroke-linejoin="round">${text(cx, cy - 2, fitText(label, ow - 4, size), { size, anchor: 'middle', weight: 600 })}${text(cx, cy + size, fitText(dims, ow - 4, size - 1), { size: size - 1, anchor: 'middle' })}</g>`,
      )
    }
  }
  // obrys (u stěny silnější podlaha)
  out.push(`<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh)}" fill="none" stroke="${C.line}" stroke-width="1.5"/>`)
  if (p.kind === 'wall') out.push(`<line x1="${f1(bx - 4)}" y1="${f1(by + bh)}" x2="${f1(bx + bw + 4)}" y2="${f1(by + bh)}" stroke="${C.line}" stroke-width="3"/>`)

  // krajní řezy
  const e = p.plan.edges
  const edge = (v: number | null, x: number, anchor: string) =>
    v == null ? '' : text(x, by + bh + 14, `${cm(v)}`, { size: 11, anchor, fill: v < (p.layout.tile_w / 100) / 3 ? C.warn : C.line })
  out.push(edge(e.left, bx + 1, 'start'))
  if (e.right != null && (e.left == null || bw > 70)) out.push(edge(e.right, bx + bw - 1, 'end'))
  const vEdge = (v: number | null, y: number) =>
    v == null ? '' : text(bx + bw + 5, y, `${cm(v)}`, { size: 11, fill: v < (p.layout.tile_h / 100) / 3 ? C.warn : C.line })
  out.push(vEdge(e.top, by + 11))
  if (e.bottom != null && (e.top == null || bh > 40)) out.push(vEdge(e.bottom, by + bh - 2))
  if (e.left != null || e.right != null || e.top != null || e.bottom != null)
    out.push(text(bx + bw + 5, by + bh + 14, 'cm', { size: 10, fill: C.muted }))

  // statistika
  const pl = p.plan
  const parts = [`celé ${pl.whole}`, `řezané ${pl.cut}`]
  if (pl.narrowest != null) parts.push(`nejužší řez ${cm(pl.narrowest)} cm`)
  if (p.times > 1) parts.push(`× ${p.times}`)
  out.push(text(x0, by + bh + 32, parts.join(' · '), { size: 11, fill: pl.narrow ? C.warn : C.muted }))
  return out.join('')
}

/** Přibližné zkrácení textu na šířku. */
function fitText(s: string, w: number, size: number) {
  const max = Math.floor(w / (size * 0.56))
  return s.length <= max ? s : max <= 1 ? '' : s.slice(0, max - 1) + '…'
}

export interface PlanSheet {
  svg: string
  width: number
  height: number
}

/**
 * List s panely vedle sebe (zalomené do šířky `width`), společné měřítko. `title` = nadpis listu (pro obrázek),
 * `legend` = vysvětlivky dole.
 */
export function planSheet(panels: PlanPanel[], o: { width: number; title?: string; subtitle?: string; legend?: boolean; maxScale?: number; maxHeight?: number }): PlanSheet {
  const PAD = 16
  const width = Math.max(240, Math.round(o.width))
  const inner = width - 2 * PAD
  const maxW = Math.max(0.1, ...panels.map((p) => p.W))
  const maxH = Math.max(0.1, ...panels.map((p) => p.H))
  let scale = Math.min(o.maxScale ?? 220, (inner - LEFT - RIGHT) / maxW)
  if (o.maxHeight) scale = Math.min(scale, o.maxHeight / maxH)
  scale = Math.max(scale, 5)
  const uid = 'tp'
  const body: string[] = []
  let y = PAD
  if (o.title) {
    body.push(text(PAD, y + 20, o.title, { size: 22, weight: 700 }))
    y += 30
    if (o.subtitle) {
      body.push(text(PAD, y + 12, o.subtitle, { size: 13, fill: C.muted }))
      y += 20
    }
    y += 10
  }
  // řádky panelů
  let x = PAD
  let rowH = 0
  for (const p of panels) {
    const b = panelBox(p, scale)
    if (x > PAD && x + b.w > width - PAD) {
      x = PAD
      y += rowH + GAP
      rowH = 0
    }
    body.push(panelSvg(p, x, y, scale, uid))
    x += b.w + GAP
    rowH = Math.max(rowH, b.h)
  }
  y += rowH
  if (o.legend) {
    y += 14
    const items: [string, string, boolean?][] = [
      [C.tile, 'celá dlaždice'],
      [C.cut, 'řezaná'],
      [C.narrow, 'úzký řez (pod ⅓ dlaždice)'],
      ['hatch', 'otvor, vana — neobkládá se'],
      ['start', 'začátek kladení', true],
    ]
    let lx = PAD
    for (const [c, label] of items) {
      const w = 22 + label.length * 6.4 + 16
      if (lx > PAD && lx + w > width - PAD) {
        lx = PAD
        y += 20
      }
      const sw =
        c === 'hatch'
          ? `<rect x="${lx}" y="${y}" width="16" height="12" fill="url(#${uid}-hatch)" stroke="${C.line}"/>`
          : c === 'start'
            ? `<rect x="${lx}" y="${y}" width="16" height="12" fill="${C.tile}" stroke="${C.start}" stroke-width="2"/>`
            : `<rect x="${lx}" y="${y}" width="16" height="12" fill="${c}" stroke="${C.grout}"/>`
      body.push(sw, text(lx + 22, y + 10.5, label, { size: 12, fill: C.muted }))
      lx += w
    }
    y += 12
  }
  const height = Math.ceil(y + PAD)
  const defs = `<defs><pattern id="${uid}-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="${C.hatch}" stroke-width="1.6"/></pattern></defs>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">${defs}<rect width="${width}" height="${height}" fill="${C.paper}"/>${body.join('')}</svg>`
  return { svg, width, height }
}

/** SVG → PNG (canvas) v `k`-násobném rozlišení. */
export async function svgToPng(sheet: PlanSheet, k = 1.5): Promise<Blob> {
  const img = new Image()
  img.decoding = 'async'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Obrázek plánu se nepodařilo vykreslit.'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sheet.svg)}`
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sheet.width * k)
  canvas.height = Math.round(sheet.height * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Obrázek plánu se nepodařilo vykreslit.')
  ctx.scale(k, k)
  ctx.drawImage(img, 0, 0, sheet.width, sheet.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Obrázek plánu se nepodařilo vykreslit.'))), 'image/png'),
  )
}

/** List celé místnosti pro přílohu (PNG): plochy s plánem po dvou vedle sebe, nadpis, vysvětlivky. */
export function roomSheet(room: Room, subtitle?: string): PlanSheet {
  return planSheet(roomPanels(room), { width: 1600, maxScale: 200, title: `Kladečský plán — ${room.name.trim() || 'Místnost'}`, subtitle, legend: true })
}

/** Název souboru plánu místnosti: kladecsky-plan-koupelna.png. */
export function planFilename(room: string): string {
  const s = room
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `kladecsky-plan-${s || 'mistnost'}.png`
}
