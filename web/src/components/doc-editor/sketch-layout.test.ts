import { describe, expect, it } from 'vitest'
import type { Room } from '@/lib/calc'
import { cutKind, fit, hasSketch, layoutRoom, MAX_DOTS, placeCuts, type SketchLayout } from './sketch-layout'

const bathroom: Room = {
  name: 'Koupelna',
  surfaces: [
    { name: 'Podlaha', kind: 'floor', width: 2.95, height: 1.56 },
    {
      name: 'Stěny',
      kind: 'wall',
      width: 2.95,
      height: 2.1,
      count: 2,
      deductions: [{ name: 'Dveře', width: 0.8, height: 1.97 }],
    },
    {
      name: 'Stěny',
      kind: 'wall',
      width: 1.56,
      height: 2.1,
      count: 2,
      deductions: [{ name: 'Okno', width: 0.6, height: 0.6 }],
    },
    { name: 'Lišta', kind: 'length', width: 6.25, height: 0 },
    { name: 'Vykružování', kind: 'piece', width: 0, height: 0, count: 14 },
  ],
}

/** Všechna čísla v rozvržení jsou konečná (žádné NaN). */
function finite(l: SketchLayout) {
  const nums: number[] = [l.width, l.height, l.scale]
  const walk = (v: unknown) => {
    if (typeof v === 'number') nums.push(v)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(l.items)
  walk(l.labels)
  return nums.every(Number.isFinite)
}

describe('cutKind', () => {
  it('recognises doors, windows and bathtubs with or without diacritics', () => {
    expect(cutKind('Dveře')).toBe('door')
    expect(cutKind('dvere WC')).toBe('door')
    expect(cutKind('Okno')).toBe('window')
    expect(cutKind('2 okna')).toBe('window')
    expect(cutKind('Vana')).toBe('bath')
    expect(cutKind('Sprchová vanička')).toBe('bath')
    expect(cutKind('Komín')).toBe('other')
  })
})

describe('placeCuts', () => {
  it('door at the bottom, centred', () => {
    const [[d]] = placeCuts('wall', 3, 2.1, [{ name: 'Dveře', width: 0.8, height: 1.97 }])
    expect(d.y).toBe(0)
    expect(d.x).toBeCloseTo(1.1)
    expect(d.clamped).toBe(false)
  })
  it('window sill at 0.9 m, clamped down to fit', () => {
    const [[w]] = placeCuts('wall', 3, 2.5, [{ name: 'Okno', width: 1, height: 1.2 }])
    expect(w.y).toBeCloseTo(0.9)
    expect(w.x).toBeCloseTo(1)
    const [[w2]] = placeCuts('wall', 3, 1.5, [{ name: 'Okno', width: 1, height: 1.2 }])
    expect(w2.y).toBeCloseTo(0.3)
    expect(w2.clamped).toBe(false)
  })
  it('bathtub bottom-left, other centred vertically', () => {
    const [[v, o]] = placeCuts('wall', 3, 2, [
      { name: 'Jiné', width: 0.4, height: 0.4 },
      { name: 'Vana', width: 1.7, height: 0.55 },
    ])
    expect(v).toMatchObject({ name: 'Vana', x: 0, y: 0 })
    expect(o.name).toBe('Jiné')
    expect(o.y).toBeCloseTo(0.8)
    expect(o.x).toBeGreaterThanOrEqual(1.7)
    expect(o.x + o.w).toBeLessThanOrEqual(3)
  })
  it('count > 1 spreads evenly', () => {
    const [cs] = placeCuts('wall', 3, 2.5, [{ name: 'Okno', width: 0.5, height: 0.5, count: 2 }])
    expect(cs).toHaveLength(2)
    expect(cs[0].x).toBeCloseTo(2 / 3)
    expect(cs[1].x).toBeCloseTo(2 / 3 + 0.5 + 2 / 3)
  })
  it('clamps a deduction that does not fit and flags it', () => {
    const [[d]] = placeCuts('wall', 3, 1.2, [{ name: 'Dveře', width: 0.8, height: 1.97 }])
    expect(d.h).toBe(1.2)
    expect(d.clamped).toBe(true)
  })
  it('distributes over wall copies by width', () => {
    const cs = placeCuts('wall', 1, 2.5, [{ name: 'Okno', width: 0.8, height: 0.6, count: 2 }], 2)
    expect(cs.map((c) => c.length)).toEqual([1, 1])
    expect(cs.flat().every((c) => !c.clamped)).toBe(true)
  })
  it('ignores zero-sized deductions', () => {
    expect(placeCuts('wall', 3, 2, [{ name: 'Okno', width: 0, height: 1 }])).toEqual([[]])
  })
})

describe('layoutRoom', () => {
  it('lays out floors, unfolded walls, lengths and pieces within the width', () => {
    for (const width of [360, 900]) {
      const l = layoutRoom(bathroom, width)
      expect(finite(l)).toBe(true)
      expect(l.width).toBe(width)
      // 1 podlaha + 2 + 2 kopie stěn + lišta + kusy
      expect(l.items.map((i) => i.kind)).toEqual(['floor', 'wall', 'wall', 'wall', 'wall', 'length', 'piece'])
      for (const it of l.items) {
        expect(it.hit.x).toBeGreaterThanOrEqual(0)
        expect(it.hit.x + it.hit.w).toBeLessThanOrEqual(width + 0.01)
        expect(it.hit.y + it.hit.h).toBeLessThanOrEqual(l.height + 1)
      }
      // jedno měřítko: podlaha i stěna 2,95 m jsou stejně široké
      const floor = l.items[0].box!
      const wall = l.items[1].box!
      expect(floor.w).toBeCloseTo(wall.w)
      expect(floor.w).toBeCloseTo(2.95 * l.scale)
    }
  })
  it('walls of one row share a baseline', () => {
    const l = layoutRoom(bathroom, 1200)
    const walls = l.items.filter((i) => i.kind === 'wall')
    const bottoms = new Set(walls.map((w) => Math.round(w.box!.y + w.box!.h)))
    expect(bottoms.size).toBe(1)
  })
  it('door sits on the wall bottom; per-copy area', () => {
    const l = layoutRoom(bathroom, 900)
    const w = l.items[1]
    expect(w.cuts).toHaveLength(1)
    expect(w.cuts[0].y + w.cuts[0].h).toBeCloseTo(w.box!.y + w.box!.h)
    expect(w.texts.some((t) => t.text === '4,62 m²')).toBe(true) // 2,95 × 2,1 − 0,8 × 1,97
    expect(l.items[2].texts.some((t) => t.text === '6,2 m²')).toBe(true) // druhá kopie bez dveří
  })
  it('labels floor dimensions and net area', () => {
    const l = layoutRoom(bathroom, 900)
    const texts = l.items[0].texts.map((t) => t.text)
    expect(texts).toContain('2,95 m')
    expect(texts).toContain('1,56 m')
    expect(texts).toContain('4,6 m²')
  })
  it('manual area → dashed square', () => {
    const l = layoutRoom(
      {
        name: 'x',
        surfaces: [{ name: 'Podlaha', kind: 'floor', width: 0, height: 0, area: 3.3 }],
      },
      360,
    )
    const f = l.items[0]
    expect(f.box!.dashed).toBe(true)
    expect(f.box!.w).toBeCloseTo(f.box!.h)
    expect(f.texts.map((t) => t.text)).toContain('≈ 3,3 m²')
  })
  it('warns when a door is taller than the wall', () => {
    const l = layoutRoom(
      {
        name: 'x',
        surfaces: [
          {
            name: 'Stěna',
            kind: 'wall',
            width: 3,
            height: 1.2,
            deductions: [{ name: 'Dveře', width: 0.8, height: 19.7 }],
          },
        ],
      },
      360,
    )
    expect(l.items[0].warning?.message).toContain('Dveře')
    expect(l.items[0].cuts[0].clamped).toBe(true)
  })
  it('pieces: at most MAX_DOTS dots, then +N', () => {
    const l = layoutRoom(bathroom, 360)
    const p = l.items.find((i) => i.kind === 'piece')!
    expect(p.dots).toHaveLength(MAX_DOTS)
    expect(p.texts.map((t) => t.text)).toEqual(['Vykružování 14 ks', '+4'])
  })
  it('length: label in bm, line not longer than the width', () => {
    const l = layoutRoom(bathroom, 360)
    const ln = l.items.find((i) => i.kind === 'length')!
    expect(ln.texts[0].text).toBe('Lišta 6,25 bm')
    expect(ln.line!.x2).toBeLessThanOrEqual(360)
  })
  it('skips empty / zero / NaN surfaces', () => {
    const room: Room = {
      name: 'x',
      surfaces: [
        { name: 'Podlaha', kind: 'floor', width: 0, height: 2 },
        { name: 'Stěna', kind: 'wall', width: NaN, height: 2 },
        { name: 'Lišta', kind: 'length', width: 0, height: 0 },
      ],
    }
    expect(hasSketch(room)).toBe(false)
    const l = layoutRoom(room, 360)
    expect(l.items).toEqual([])
    expect(l.height).toBe(0)
    expect(finite(layoutRoom({ name: 'y', surfaces: null }, NaN))).toBe(true)
  })
  it('a huge floor still fits a phone', () => {
    const l = layoutRoom(
      {
        name: 'Terasa',
        surfaces: [{ name: 'Podlaha', kind: 'floor', width: 40, height: 3 }],
      },
      360,
    )
    const b = l.items[0].box!
    expect(b.x + b.w).toBeLessThanOrEqual(360)
  })
})

describe('fit', () => {
  it('truncates with an ellipsis', () => {
    expect(fit('Koupelna', 200)).toBe('Koupelna')
    expect(fit('Velmi dlouhý název stěny', 50).endsWith('…')).toBe(true)
  })
})
