import { describe, expect, it } from 'vitest'
import type { Job } from '@/api/jobs'
import { jobChanged, jobStages, stageOf, travelLine } from './stages'

const line = (p: Partial<Job['lines'][number]>) =>
  ({
    id: 1,
    section: 'work',
    catalog_item_id: null,
    name: 'Obklad',
    unit: 'm2',
    quantity: 10,
    unit_price: 65000,
    discount: 0,
    customer_supplied: false,
    measure: '',
    rooms: [],
    waste: 0,
    note: '',
    extra: false,
    amount: 650000,
    ...p,
  }) as Job['lines'][number]

const totals = (total: number) => ({ work: total, material: 0, other: 0, subtotal: total, discount: 0, base: total, vat_rate: 0, vat: 0, total })

function job(p: Partial<Job> = {}): Job {
  return {
    state: 'done',
    rooms: [],
    lines: [line({})],
    attachments: [],
    notes: [],
    invoices: [],
    revisions: [],
    extras: { count: 0, unpriced: 0, amount: 0 },
    totals: totals(650000),
    quote: { id: 1, number: 'NA26001', totals: totals(650000) },
    start_on: '2026-11-02',
    end_on: '2026-11-06',
    ...p,
  } as Job
}

describe('etapy zakázky', () => {
  it('hotová zakázka bez změn: upravená nabídka není potřeba', () => {
    const j = job()
    expect(stageOf[j.state]).toBe(2)
    expect(jobChanged(j)).toBe(false)
    const finish = jobStages(j, true)[2]
    expect(finish.items.find((i) => i.label.startsWith('Upravená'))?.mark).toBe('skip')
  })

  it('práce navíc a cestovné: upravená nabídka čeká, parťák nevidí ceny', () => {
    const j = job({
      lines: [
        line({}),
        line({ id: 2, name: 'Vyrovnání', extra: true, unit_price: 0, amount: 0 }),
        line({ id: 3, section: 'other', name: 'Cestovné', unit: 'km', amount: 84000 }),
      ],
      extras: { count: 1, unpriced: 1, amount: 0 },
    })
    expect(jobChanged(j)).toBe(true)
    expect(travelLine(j)?.amount).toBe(84000)
    const manager = jobStages(j, true)
    expect(manager[1].items.some((i) => i.mark === 'warn' && i.label.includes('K nacenění'))).toBe(true)
    expect(manager[2].items.find((i) => i.label.startsWith('Upravená'))?.mark).toBe('todo')
    const worker = jobStages(j, false)
    expect(worker.flatMap((s) => s.items).some((i) => i.label.includes('Kč') || i.label.includes('abídk'))).toBe(false)
  })

  it('přijatá upravená nabídka je hotová', () => {
    const rev = { id: 2, number: 'NA26002', state: 'accepted', revision: true } as Job['revisions'][number]
    const finish = jobStages(job({ extras: { count: 1, unpriced: 0, amount: 10000 }, revisions: [rev] }), true)[2]
    expect(finish.items.find((i) => i.label.startsWith('Upravená nabídka NA26002'))?.mark).toBe('done')
  })

  it('fotky se počítají do fáze podle kategorie', () => {
    const att = (category: string) => ({ id: 1, category }) as Job['attachments'][number]
    const [lead, build, finish] = jobStages(job({ attachments: [att('during'), att('during'), att('plan')] }), true)
    expect(lead.items.find((i) => i.label.startsWith('Fotky před'))?.label).toBe('Fotky před a plán: 1')
    expect(build.items.find((i) => i.label.startsWith('Fotky'))?.label).toBe('Fotky během: 2')
    expect(finish.items.find((i) => i.label.startsWith('Fotky'))?.mark).toBe('todo')
  })
})
