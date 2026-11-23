import { describe, expect, it } from 'vitest'
import { centerLayout, defaultLayout, layoutLabel, optimizeOffsets, purchase, tilePlan, type Layout } from './tile-layout'

const wall = (l: Partial<Layout> = {}): Layout => ({ ...defaultLayout('wall'), ...l })
const close = (a: number | null | undefined, b: number) => expect(a).toBeCloseTo(b, 6)

describe('tilePlan', () => {
  it('lays 30×60 on a 2.95 × 2.10 wall from the floor, centred', () => {
    // rozteč 30,2 cm: 1,325 + k·0,302 → kraje 11,5 cm; řady od podlahy 3 celé + 29,4 cm nahoře
    const p = tilePlan(2.95, 2.1, wall(), [], 'wall')
    expect(p.whole).toBe(27)
    expect(p.cut).toBe(17)
    expect(p.narrow).toBe(0)
    close(p.narrowest, 0.115)
    close(p.edges.left, 0.115)
    close(p.edges.right, 0.115)
    close(p.edges.top, 0.294)
    expect(p.edges.bottom).toBeNull()
    expect(p.pieces.filter((x) => x.start)).toHaveLength(1)
    const start = p.pieces.find((x) => x.start)!
    close(start.x, 1.325)
    close(start.y, 1.5)
  })

  it('counts whole tiles exactly when the surface is a multiple of the tile', () => {
    const p = tilePlan(1.2, 0.6, { tile_w: 60, tile_h: 60, grout: 0, align_x: 'left', align_y: 'top' }, [], 'floor')
    expect([p.whole, p.cut, p.narrowest]).toEqual([2, 0, null])
  })

  it('marks narrow cuts under a third of the tile', () => {
    // 60×60 zleva na 1,30 m: 60 + 60 + 10 cm → 10 < 20 cm
    const p = tilePlan(1.3, 0.6, { tile_w: 60, tile_h: 60, grout: 0, align_x: 'left', align_y: 'top' }, [], 'floor')
    expect([p.whole, p.cut, p.narrow]).toEqual([2, 1, 1])
    close(p.narrowest, 0.1)
    expect(p.edges.left).toBeNull()
    close(p.edges.right, 0.1)
  })

  it('shifts every other row in a running bond', () => {
    const p = tilePlan(1.2, 1.2, { tile_w: 60, tile_h: 60, grout: 0, pattern: 'half', align_x: 'left', align_y: 'top' }, [], 'floor')
    // řada 1: 2 celé; řada 2: 30 + 60 + 30
    expect([p.whole, p.cut]).toEqual([3, 2])
    const row2 = p.pieces.filter((x) => x.y > 0.5).map((x) => Math.round(x.w * 100))
    expect(row2).toEqual([30, 60, 30])
  })

  it('cuts tiles around an opening and skips tiles under it', () => {
    // dveře 0,8 × 1,97 dole vlevo od 0,2 m; 20×20 bez spáry od levého horního rohu
    const door = { name: 'Dveře', x: 0.2, y: 2.1 - 1.97, w: 0.8, h: 1.97 }
    const l: Layout = { tile_w: 20, tile_h: 20, grout: 0, align_x: 'left', align_y: 'top' }
    const without = tilePlan(1.2, 2.1, l, [], 'wall')
    const p = tilePlan(1.2, 2.1, l, [door], 'wall')
    // 6 sloupců × 10 řad + 10 cm řada dole
    expect(without.whole + without.cut).toBe(66)
    // pod dveřmi: 4 sloupce × 9 celých řad (0,2–2,0 m od horního okraje 0,13) jsou zakryté
    const covered = without.pieces.length - p.pieces.length
    expect(covered).toBeGreaterThanOrEqual(36)
    const notched = p.pieces.filter((x) => x.x >= 0.2 - 1e-9 && x.x < 1 && x.y < 0.2)
    expect(notched.every((x) => x.cut)).toBe(true)
    // nadpraží: 13 cm zbytek z 20 cm dlaždice
    close(Math.min(...notched.map((x) => x.minCut!)), 0.13)
  })

  it('does not warn about cuts the dimensions force (above a door)', () => {
    const door = { name: 'Dveře', x: 0.2, y: 0.13, w: 0.8, h: 1.97 }
    const p = tilePlan(1.2, 2.1, { tile_w: 60, tile_h: 60, grout: 0, align_x: 'left', align_y: 'bottom' }, [door], 'wall')
    expect(p.narrow).toBe(0)
    close(p.narrowest, 0.13)
    // tatáž dveře uprostřed široké stěny: zbytek 10 cm vedle zárubně posunem jde zvětšit → úzký řez
    const wide = tilePlan(3, 2.1, { tile_w: 60, tile_h: 60, grout: 0, align_x: 'left', align_y: 'bottom' }, [{ ...door, x: 1.3 }], 'wall')
    expect(wide.narrow).toBeGreaterThan(0)
  })

  it('treats the grout only between tiles', () => {
    // 3 dlaždice 30 cm + 2 spáry 5 mm = 91 cm
    const p = tilePlan(0.91, 0.3, { tile_w: 30, tile_h: 30, grout: 5, align_x: 'left', align_y: 'top' }, [], 'floor')
    expect([p.whole, p.cut]).toEqual([3, 0])
  })

  it('offsets move the tiles right and up', () => {
    const p = tilePlan(1.2, 0.6, { tile_w: 60, tile_h: 60, grout: 0, align_x: 'left', align_y: 'top', offset_x: 10, offset_y: 10 }, [], 'floor')
    const first = p.pieces[0]
    close(first.x, 0)
    close(first.w, 0.1)
    close(first.y, 0)
    close(first.h, 0.5)
  })
})

describe('optimize and centre', () => {
  it('avoids slivers', () => {
    const l: Layout = { tile_w: 60, tile_h: 60, grout: 0, align_x: 'left', align_y: 'top' }
    expect(tilePlan(1.3, 1.3, l, [], 'floor').narrow).toBeGreaterThan(0)
    const o = optimizeOffsets(1.3, 1.3, l, 'floor')
    const p = tilePlan(1.3, 1.3, { ...l, ...o }, [], 'floor')
    expect(p.narrow).toBe(0)
    // 130 = 35 + 60 + 35: nejširší možný nejužší řez
    close(p.narrowest, 0.35)
  })

  it('centres with the joint or the tile on the axis, whichever gives wider cuts', () => {
    // 1,30 m, 60 cm: dlaždice na ose → 35 + 60 + 35; spára na ose → 5 + 120 + 5 (úzké)
    const c = centerLayout(1.3, 0.6, { tile_w: 60, tile_h: 60, grout: 0 }, 'floor')
    const p = tilePlan(1.3, 0.6, c, [], 'floor')
    close(p.edges.left, p.edges.right!)
    expect(p.narrow).toBe(0)
    close(p.narrowest, 0.35)
    // 1,80 m: spára na ose → 30 + 60 + 60 + 30; dlaždice na ose → 60 + 60 + 60
    const c2 = centerLayout(1.8, 0.6, { tile_w: 60, tile_h: 60, grout: 0 }, 'floor')
    expect(tilePlan(1.8, 0.6, c2, [], 'floor').cut).toBe(0)
  })

  it('takes the edges of openings into account (row above a bathtub)', () => {
    const tub = { name: 'Vana', x: 0, y: 2.1 - 0.55, w: 1.7, h: 0.55 }
    const l: Layout = { tile_w: 30, tile_h: 60, grout: 2, align_x: 'center', align_y: 'bottom' }
    expect(tilePlan(2.95, 2.1, l, [tub], 'wall').narrow).toBeGreaterThan(0)
    const o = optimizeOffsets(2.95, 2.1, l, 'wall', [tub])
    const p = tilePlan(2.95, 2.1, { ...l, ...o }, [tub], 'wall')
    expect(p.narrow).toBe(0)
  })

  it('optimizes a running bond over both row shifts', () => {
    const l: Layout = { tile_w: 60, tile_h: 30, grout: 2, pattern: 'half', align_x: 'left', align_y: 'bottom' }
    const o = optimizeOffsets(2.0, 1.0, l, 'wall')
    const p = tilePlan(2.0, 1.0, { ...l, ...o }, [], 'wall')
    expect(p.narrow).toBe(0)
  })
})

describe('purchase', () => {
  it('adds waste and counts tiles and boxes', () => {
    expect(purchase(4.6, { tile_w: 60, tile_h: 60, grout: 2 })).toEqual({ waste: 10, m2: 5.06, tiles: 15, boxes: null })
    expect(purchase(4.6, { tile_w: 60, tile_h: 60, grout: 2, pattern: 'half', box_m2: 1.44 })).toEqual({ waste: 15, m2: 5.29, tiles: 15, boxes: 4 })
    expect(purchase(4.6, { tile_w: 30, tile_h: 60, grout: 2, waste: 0 }).tiles).toBe(26)
  })

  it('describes the layout', () => {
    expect(layoutLabel({ tile_w: 30, tile_h: 60, grout: 1.5, pattern: 'half' })).toBe('30×60 cm, spára 1,5 mm, na vazbu ½')
  })
})
