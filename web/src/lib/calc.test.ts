import { describe, expect, it } from 'vitest'
import { goRound, lineAmount, quantity, sum, surfaceArea, total, type Room } from './calc'

// Mirrors internal/calc/calc_test.go — the numbers must match the server exactly.
describe('calc', () => {
  it('paper quote of the bathroom (SPEC §0)', () => {
    const rooms: Room[] = [
      {
        name: 'Koupelna',
        surfaces: [
          { name: 'Podlaha', kind: 'floor', width: 2.95, height: 1.56 },
          { name: 'Stěna u okna', kind: 'wall', width: 2.95, height: 2.1 },
          { name: 'Stěna u dveří', kind: 'wall', width: 2.44, height: 2.1, deductions: [{ name: 'Dveře', width: 0.8, height: 1.97 }] },
          { name: 'Lišta', kind: 'length', width: 7.96, height: 0 },
          { name: 'Vykružování', kind: 'piece', width: 0, height: 0, count: 14 },
        ],
      },
    ]
    expect(total(rooms)).toEqual({ floor: 4.6, wall: 9.75, perimeter: 9.02, length: 7.96, pieces: 14 })
    expect(quantity(rooms, 'wall', null, 10)).toBe(10.73)
    expect(quantity(rooms, 'floor', ['Kuchyň'], 0)).toBe(0)

    const cases: [number, number, number, number][] = [
      [4.6, 15000, 0, 69000], // pancéřové pletivo
      [14.11, 65000, 0, 917200], // obklad
      [11.52, 6000, 0, 69100], // hydroizolační páska
      [2, 169400, 25, 254100], // lepidlo 3 388 − 25 %
      [6, 95700, 35, 373200], // lepidlo na dlažbu 5 742 − 35 %
      [1, 32700, 25, 24500], // 327 − 25 % = 245,25 → 245
    ]
    for (const [q, p, d, want] of cases) expect(lineAmount(q, p, d, false)).toBe(want)
    expect(lineAmount(1, 30000, 0, true)).toBe(0)

    let tot = sum(
      [
        { section: 'work', amount: 2225600 },
        { section: 'material', amount: 1608800 },
        { section: 'other', amount: 210000 },
      ],
      0,
      0,
    )
    expect(tot.total).toBe(4044400)
    expect(tot.work).toBe(2225600)
    tot = sum([{ section: 'work', amount: 1000000 }], 5, 12)
    expect([tot.discount, tot.base, tot.vat, tot.total]).toEqual([50000, 950000, 114000, 1064000])
  })

  it('manual area and count', () => {
    const s = total([
      {
        name: '',
        surfaces: [
          { name: '', kind: 'wall', width: 0, height: 0, area: 3.3, deductions: [{ name: '', width: 0.5, height: 0.5, count: 2 }] },
          { name: '', kind: 'wall', width: 1, height: 2, count: 2 },
          { name: '', kind: 'floor', width: 0, height: 0, area: 3.3 },
        ],
      },
    ])
    expect([s.wall, s.floor, s.perimeter]).toEqual([6.8, 3.3, 0])
  })

  it('rounds half away from zero like Go', () => {
    expect(goRound(2.5)).toBe(3)
    expect(goRound(-2.5)).toBe(-3)
    expect(surfaceArea({ name: '', kind: 'wall', width: 1, height: 1, deductions: [{ name: '', width: 2, height: 2 }] })).toBe(0)
    expect(quantity([{ name: 'A', surfaces: [{ name: '', kind: 'piece', width: 0, height: 0, count: 3 }] }], 'piece', null, 10)).toBe(4)
  })
})
