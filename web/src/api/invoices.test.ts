import { describe, expect, it } from 'vitest'
import { advanceFromPercent, invoiceTotals, lineAmount } from './invoices'

describe('invoice math (jako server)', () => {
  it('lineAmount zaokrouhluje na celé Kč, slevy i odpočty', () => {
    expect(lineAmount(14.11, 65000)).toBe(917200) // 9 171,50 → 9 172 Kč
    expect(lineAmount(1, 338800, 25)).toBe(254100)
    expect(lineAmount(1, -1050)).toBe(-1100) // půlka od nuly
  })
  it('invoiceTotals: DPH po sazbách', () => {
    const t = invoiceTotals(
      [
        { amount: 100000, vat_rate: 12 },
        { amount: 50000, vat_rate: 21 },
        { amount: -20000, vat_rate: 12 },
      ],
      true,
    )
    expect(t.rows).toEqual([
      { rate: 21, base: 50000, vat: 10500 },
      { rate: 12, base: 80000, vat: 9600 },
    ])
    expect(t.total).toBe(150100)
    expect(invoiceTotals([{ amount: 100000, vat_rate: 12 }], false)).toMatchObject({ vat: 0, total: 100000, rows: [] })
  })
  it('advanceFromPercent na celé Kč', () => {
    expect(advanceFromPercent(3844400, 50)).toBe(1922200)
    expect(advanceFromPercent(100050, 30)).toBe(30000)
  })
})
