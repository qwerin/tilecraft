import { describe, expect, it } from 'vitest'
import type { CatalogItem } from '@/api/catalog'
import { computeTotals, emptyLine, insertLines, lineFromCatalog, lineToInput, syncLinesWithRooms, usualLines, type Room } from './model'

const rooms: Room[] = [
  {
    name: 'Koupelna',
    surfaces: [
      { name: 'Podlaha', kind: 'floor', width: 2.95, height: 1.56 },
      { name: 'Stěna', kind: 'wall', width: 2.95, height: 2.1 },
    ],
  },
]
const item = (id: number, kind: CatalogItem['kind'], measure: CatalogItem['measure'], price = 65000, waste = 0): CatalogItem => ({
  id,
  kind,
  name: `Položka ${id}`,
  unit: 'm2',
  price,
  measure,
  waste,
  active: true,
})

describe('doc-editor model', () => {
  it('measured lines follow the rooms', () => {
    const l = lineFromCatalog(item(1, 'work', 'floor'), rooms)
    expect(l.quantity).toBe(4.6)
    const renamed = [{ ...rooms[0], name: 'Lázeň' }]
    const [s] = syncLinesWithRooms([{ ...l, rooms: ['Koupelna'] }], rooms, renamed)
    expect(s.rooms).toEqual(['Lázeň'])
    expect(s.quantity).toBe(4.6)
    const [gone] = syncLinesWithRooms([{ ...l, rooms: ['Koupelna'] }], rooms, [])
    expect(gone.rooms).toEqual([])
    expect(gone.quantity).toBe(0)
  })

  it('usual lines = catalog items with a measure present in the rooms', () => {
    const cat = [item(1, 'work', 'floor'), item(2, 'work', 'length'), item(3, 'material', 'wall', 0, 10), item(4, 'other', '')]
    const add = usualLines(cat, rooms, [lineFromCatalog(cat[0], rooms)])
    expect(add.map((l) => l.catalog_item_id)).toEqual([3])
    expect(add[0].quantity).toBe(6.82) // 6,2 m² + 10 %
  })

  it('keeps lines grouped by section', () => {
    const w = { ...emptyLine('work'), name: 'w' }
    const m = { ...emptyLine('material'), name: 'm' }
    const o = { ...emptyLine('other'), name: 'o' }
    expect(insertLines([o], [m, w]).map((l) => l.name)).toEqual(['w', 'm', 'o'])
  })

  it('totals like the server', () => {
    const lines = [lineFromCatalog(item(1, 'work', 'wall'), rooms), { ...emptyLine('material'), name: 'Lepidlo', quantity: 2, unit_price: 169400, discount: 25 }]
    const t = computeTotals(lines, rooms, 0, 0)
    expect(t.work).toBe(403000) // 6,2 × 650
    expect(t.material).toBe(254100)
    expect(lineToInput({ ...lines[1], quantity: 1.006 }).quantity).toBe(1.01)
  })
})
