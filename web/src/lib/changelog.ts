// Novinky pro uživatele (stránka Novinky). Nový záznam patří NAHORU; `id` se už nikdy nemění
// (podle něj se pamatuje přečtení). Položka bez `for` je pro všechny členy firmy,
// 'managers' = jen vlastník a kancelář (parťák ji neuvidí).

export type Audience = 'managers'

export type ChangelogItem = { text: string; for?: Audience }

export type ChangelogEntry = {
  id: string
  date: string // YYYY-MM-DD
  title: string
  items: ChangelogItem[]
}

export const changelog: ChangelogEntry[] = [
  {
    id: '2026-11-08-prvni-verze',
    date: '2026-11-08',
    title: 'První verze TileCraft',
    items: [
      { text: 'Zakázky přehledně na telefonu i na počítači: stav, adresa stavby, fotky z místa.' },
      {
        text: 'Zaměření místností přímo na stavbě, nabídka s cenami z ceníku, odkaz pro zákazníka k přijetí nabídky a faktura s QR platbou.',
        for: 'managers',
      },
    ],
  },
]

export function changelogFor(isManager: boolean, entries: ChangelogEntry[] = changelog): ChangelogEntry[] {
  const visible = (it: ChangelogItem) => !it.for || isManager
  return entries.map((e) => ({ ...e, items: e.items.filter(visible) })).filter((e) => e.items.length > 0)
}

const SEEN_KEY = 'tilecraft-news-seen'

/** Přečtené novinky (v prohlížeči; bez localStorage se nic nepamatuje). */
export function seenNews(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function markNewsSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...seenNews(), ...ids])]))
  } catch {
    // localStorage nedostupný (privátní režim)
  }
}
