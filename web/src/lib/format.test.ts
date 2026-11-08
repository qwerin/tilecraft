import { describe, expect, it } from 'vitest'
import { fromMinor, money, parseMeters, plural, qty, toMinor } from './format'

describe('format', () => {
  it('money in haléře', () => {
    expect(money(2225600).replace(/\s/g, ' ')).toBe('22 256 Kč')
    expect(money(null)).toBe('—')
    expect(toMinor('1 190,50')).toBe(119050)
    expect(fromMinor(119050)).toBe('1190,50')
  })
  it('meters from phone input', () => {
    expect(parseMeters('2,95')).toBe(2.95)
    expect(parseMeters('295')).toBe(2.95)
    expect(parseMeters('3')).toBe(3)
    expect(parseMeters('')).toBeNull()
  })
  it('quantities and plurals', () => {
    expect(qty(14.11, 'm2')).toBe('14,11 m²')
    expect(plural(3, 'položka', 'položky', 'položek')).toBe('3 položky')
    expect(plural(5, 'položka', 'položky', 'položek')).toBe('5 položek')
  })
})
