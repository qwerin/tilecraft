import { describe, expect, it } from 'vitest'
import { changelog, changelogFor, type ChangelogEntry } from './changelog'

describe('changelog', () => {
  it('has unique ids, newest first', () => {
    expect(new Set(changelog.map((e) => e.id)).size).toBe(changelog.length)
    const dates = changelog.map((e) => e.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('shows items by role', () => {
    const entries: ChangelogEntry[] = [
      { id: 'a', date: '2026-01-02', title: 'A', items: [{ text: 'všem' }, { text: 'vedení', for: 'managers' }] },
      { id: 'b', date: '2026-01-01', title: 'B', items: [{ text: 'jen vedení', for: 'managers' }] },
    ]
    expect(changelogFor(true, entries).map((e) => e.items.length)).toEqual([2, 1])
    expect(changelogFor(false, entries).map((e) => e.items.map((i) => i.text))).toEqual([['všem']])
  })
})
