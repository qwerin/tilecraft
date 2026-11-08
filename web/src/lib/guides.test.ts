import { describe, expect, it } from 'vitest'
import routeTree from '@/routeTree.gen.ts?raw'
import { guides, guidesFor, searchGuides, splitLabels } from './guides'

// Cesty, na které se dá navigovat (FileRoutesByTo v routeTree.gen.ts).
const routes = new Set([...(routeTree.match(/export interface FileRoutesByTo \{([\s\S]*?)\n\}/)?.[1] ?? '').matchAll(/'([^']+)':/g)].map((m) => m[1]))

// Stránky, které parťák smí otevřít (workerAllowed v app-shell.tsx).
const workerRoutes = new Set(['/a/$slug', '/a/$slug/jobs', '/a/$slug/news', '/a/$slug/account', '/a/$slug/guides'])

describe('guides', () => {
  it('links point to existing routes', () => {
    expect(routes.has('/a/$slug/guides')).toBe(true)
    expect(routes.has('/a/$slug/guides/$topic')).toBe(true)
    for (const g of guides) for (const l of g.links) expect(routes, `${g.id}: ${l.to}`).toContain(l.to)
  })

  it('has unique ids, sections and related guides that exist', () => {
    const ids = guides.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const g of guides) {
      const sections = g.sections.map((s) => s.id)
      expect(new Set(sections).size, g.id).toBe(sections.length)
      for (const r of g.related ?? []) expect(ids).toContain(r)
    }
  })

  it('has balanced [[labels]]', () => {
    for (const g of guides)
      for (const s of g.sections)
        for (const t of [s.text, ...(s.steps ?? []), ...(s.tips ?? []), ...(s.warnings ?? [])].filter((x): x is string => !!x)) {
          const rest = t.replace(/\[\[(.+?)\]\]/g, '')
          expect(rest, `${g.id}#${s.id}`).not.toMatch(/\[\[|\]\]/)
        }
    expect(splitLabels('Klepněte na [[Uložit]].')).toEqual([{ text: 'Klepněte na ' }, { text: 'Uložit', label: true }, { text: '.' }])
  })

  it('shows workers only their guides', () => {
    const worker = guidesFor(false)
    expect(worker.map((g) => g.id)).toEqual(['zaciname', 'partaci'])
    expect(worker[0].sections.map((s) => s.id)).toEqual(['instalace'])
    for (const g of worker) {
      for (const l of g.links) expect(workerRoutes, `${g.id}: ${l.to}`).toContain(l.to)
      for (const r of g.related ?? []) expect(worker.map((x) => x.id)).toContain(r)
    }
    expect(guidesFor(true)).toHaveLength(guides.length)
  })

  it('searches without diacritics', () => {
    const hits = searchGuides(guides, 'proREZ')
    expect(hits.map((h) => h.guide.id)).toContain('nabidka')
    expect(hits.find((h) => h.guide.id === 'nabidka')?.sections.map((s) => s.id)).toContain('prorez')
    expect(searchGuides(guidesFor(false), 'faktura zaloha')).toEqual([])
  })
})
