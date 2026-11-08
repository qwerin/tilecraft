import { describe, expect, it } from 'vitest'
import { dateToIso, formatCzDate, formatCzDateTime, isoToDate, parseCzDate, parseCzDateTime, quarterHours, roundToQuarter } from './czdate'

const today = new Date(2026, 9, 27) // 27. 10. 2026

describe('parseCzDate', () => {
  it('accepts Czech forms', () => {
    expect(parseCzDate('27. 10. 2026', today)).toBe('2026-10-27')
    expect(parseCzDate('1.2.2027', today)).toBe('2027-02-01')
    expect(parseCzDate('1.2.27', today)).toBe('2027-02-01')
    expect(parseCzDate('5.11.', today)).toBe('2026-11-05')
    expect(parseCzDate('5.11', today)).toBe('2026-11-05')
    expect(parseCzDate('3', today)).toBe('2026-10-03')
    expect(parseCzDate('2026-10-27', today)).toBe('2026-10-27')
    expect(parseCzDate('', today)).toBe('')
  })
  it('rejects nonsense', () => {
    expect(parseCzDate('31. 2. 2026', today)).toBeNull()
    expect(parseCzDate('zítra', today)).toBeNull()
  })
})

describe('parseCzDateTime', () => {
  it('parses date and time', () => {
    expect(parseCzDateTime('27. 10. 2026 14:30', '00:00', today)).toBe('2026-10-27T14:30')
    expect(parseCzDateTime('27.10. 8.15', '00:00', today)).toBe('2026-10-27T08:15')
    expect(parseCzDateTime('27.10. 9', '00:00', today)).toBe('2026-10-27T09:00')
    expect(parseCzDateTime('27.10.2026', '12:00', today)).toBe('2026-10-27T12:00')
    expect(parseCzDateTime('27.10.26', '07:00', today)).toBe('2026-10-27T07:00')
    expect(parseCzDateTime('27.10. 25:00', '00:00', today)).toBeNull()
  })
})

describe('format', () => {
  it('formats the Czech way', () => {
    expect(formatCzDate('2026-02-01')).toBe('1. 2. 2026')
    expect(formatCzDateTime('2026-02-01T08:05')).toBe('1. 2. 2026 8:05')
  })
})

describe('roundToQuarter', () => {
  it('rounds to the nearest quarter hour', () => {
    expect(roundToQuarter('2026-10-27T14:30')).toBe('2026-10-27T14:30')
    expect(roundToQuarter('2026-10-27T14:37')).toBe('2026-10-27T14:30')
    expect(roundToQuarter('2026-10-27T14:38')).toBe('2026-10-27T14:45')
    expect(roundToQuarter('2026-10-27T14:07')).toBe('2026-10-27T14:00')
    expect(roundToQuarter('2026-10-27T14:08')).toBe('2026-10-27T14:15')
    expect(roundToQuarter('2026-10-27T09:53')).toBe('2026-10-27T10:00')
  })
  it('rolls over midnight and month end', () => {
    expect(roundToQuarter('2026-10-31T23:53')).toBe('2026-11-01T00:00')
    expect(roundToQuarter('2026-12-31T23:59')).toBe('2027-01-01T00:00')
    // přechod na zimní čas nic neposouvá
    expect(roundToQuarter('2026-10-25T02:52')).toBe('2026-10-25T02:45')
  })
  it('leaves other values alone', () => {
    expect(roundToQuarter('')).toBe('')
    expect(roundToQuarter('2026-10-27')).toBe('2026-10-27')
  })
  it('works on typed input', () => {
    expect(roundToQuarter(parseCzDateTime('27.10. 8.10', '00:00', today)!)).toBe('2026-10-27T08:15')
  })
})

describe('calendar helpers', () => {
  it('lists quarter hours of a day', () => {
    expect(quarterHours).toHaveLength(96)
    expect(quarterHours.slice(0, 3)).toEqual(['00:00', '00:15', '00:30'])
    expect(quarterHours.at(-1)).toBe('23:45')
  })
  it('converts between ISO and local dates', () => {
    expect(dateToIso(isoToDate('2026-03-29')!)).toBe('2026-03-29')
    expect(dateToIso(isoToDate('2026-10-27T14:30')!)).toBe('2026-10-27')
    expect(isoToDate('')).toBeUndefined()
    expect(isoToDate(undefined)).toBeUndefined()
  })
})
