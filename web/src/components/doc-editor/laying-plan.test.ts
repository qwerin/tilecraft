import { describe, expect, it } from 'vitest'
import type { Surface } from '@/lib/calc'
import { canPlan, planFilename, planSheet, roomPanels, surfacePanels, surfaceStats } from './laying-plan'

const wall: Surface = {
  name: 'Stěna <za> vanou',
  kind: 'wall',
  width: 2.95,
  height: 2.1,
  layout: { tile_w: 30, tile_h: 60, grout: 2 },
  deductions: [{ name: 'Vana', width: 1.7, height: 0.55 }],
}

describe('laying plan sheet', () => {
  it('places openings in drawing coordinates (wall from the floor) and honours a set position', () => {
    const [p] = surfacePanels(wall, 0)
    expect(p.openings).toEqual([{ name: 'Vana', index: 0, x: 0, y: 2.1 - 0.55, w: 1.7, h: 0.55 }])
    const [q] = surfacePanels({ ...wall, deductions: [{ name: 'Okno', width: 0.9, height: 0.6, x: 0.3, y: 1.2 }] }, 0)
    expect(q.openings[0].x).toBe(0.3)
    expect(q.openings[0].y).toBeCloseTo(2.1 - 1.2 - 0.6, 9)
  })

  it('draws copies of a wall and multiplies a floor', () => {
    expect(surfacePanels({ ...wall, count: 2 }, 0).map((p) => p.title)).toEqual(['Stěna <za> vanou (1/2)', 'Stěna <za> vanou (2/2)'])
    const floor: Surface = { name: 'Podlaha', kind: 'floor', width: 1.2, height: 0.6, count: 3, layout: { tile_w: 60, tile_h: 60, grout: 0, align_x: 'left', align_y: 'top' } }
    const ps = surfacePanels(floor, 0)
    expect(ps).toHaveLength(1)
    expect(surfaceStats(floor, ps)).toMatchObject({ whole: 6, cut: 0, area: 2.16 })
  })

  it('skips surfaces without a plan or dimensions', () => {
    expect(canPlan({ ...wall, area: 5 })).toBe(false)
    expect(canPlan({ name: 'Lišta', kind: 'length', width: 3, height: 0 })).toBe(false)
    expect(roomPanels({ name: 'K', surfaces: [{ ...wall, layout: undefined }, wall] }).map((p) => p.index)).toEqual([1])
  })

  it('renders an escaped standalone SVG', () => {
    const s = planSheet(roomPanels({ name: 'K', surfaces: [wall] }), { width: 800, title: 'Kladečský plán — K', legend: true })
    expect(s.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(s.svg).toContain('Stěna &lt;za&gt; vanou')
    expect(s.svg).not.toContain('<za>')
    expect(s.height).toBeGreaterThan(300)
  })

  it('names the file by the room', () => {
    expect(planFilename('Koupelna a WC')).toBe('kladecsky-plan-koupelna-a-wc.png')
    expect(planFilename('Kuchyň')).toBe('kladecsky-plan-kuchyn.png')
    expect(planFilename('')).toBe('kladecsky-plan-mistnost.png')
  })
})
