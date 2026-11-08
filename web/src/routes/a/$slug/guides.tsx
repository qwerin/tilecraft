import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRightIcon, BookOpenIcon, SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, PageHeader } from '@/components/common'
import { Input } from '@/components/ui/input'
import { useFirm } from '@/hooks/use-firm'
import { guidesFor, searchGuides, type Guide, type GuideId } from '@/lib/guides'
import { cn } from '@/lib/utils'

// Návody (lib/guides.ts): karty po tématech a hledání v textu. Parťák vidí jen návody pro sebe.
type Search = { q?: string }

export const Route = createFileRoute('/a/$slug/guides')({
  validateSearch: (s: Record<string, unknown>): Search => ({ q: typeof s.q === 'string' && s.q ? s.q : undefined }),
  component: GuidesPage,
})

/** Cesta zakázky v aplikaci (jen vedení). */
const FLOW: { id: GuideId; label: string }[] = [
  { id: 'zamereni', label: 'Zaměření' },
  { id: 'nabidka', label: 'Nabídka' },
  { id: 'odeslani', label: 'Přijetí' },
  { id: 'zakazka', label: 'Zakázka' },
  { id: 'faktury', label: 'Faktura' },
]

function GuidesPage() {
  const { slug, isManager } = useFirm()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [q, setQ] = useState(search.q ?? '')
  const list = guidesFor(isManager)
  const matches = searchGuides(list, q)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Návody"
        description={isManager ? 'Krok za krokem, jak pracovat v každé části aplikace.' : 'Jak s aplikací pracovat na stavbě.'}
      >
        <div className="relative max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              void navigate({ search: { q: e.target.value || undefined }, replace: true })
            }}
            placeholder="Hledat: prořez, záloha, WhatsApp…"
            className="h-11 pl-8 md:h-9"
            aria-label="Hledat v návodech"
          />
        </div>
      </PageHeader>

      {isManager && !q && (
        <div className="tile-grid mb-5 rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm [--grout:oklch(1_0_0/9%)] [--tile:22px] sm:p-5">
          <p className="font-heading text-lg font-semibold">Od zaměření po fakturu</p>
          <p className="mb-3 text-sm text-primary-foreground/80">Jedna zakázka prochází aplikací v tomto pořadí. Klepněte na krok.</p>
          <ol className="flex flex-wrap items-center gap-1.5">
            {FLOW.map((f, i) => (
              <li key={f.id} className="flex items-center gap-1.5">
                <Link
                  to="/a/$slug/guides/$topic"
                  params={{ slug, topic: f.id }}
                  className="flex items-center gap-2 rounded-full bg-primary-foreground/15 py-1.5 pr-3 pl-1.5 text-sm font-medium transition hover:bg-primary-foreground/25"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary-foreground text-xs font-semibold text-primary">{i + 1}</span>
                  {f.label}
                </Link>
                {i < FLOW.length - 1 && <ArrowRightIcon className="size-4 opacity-60" aria-hidden />}
              </li>
            ))}
          </ol>
        </div>
      )}

      {matches.length === 0 ? (
        <EmptyState icon={BookOpenIcon} title="Nic nenalezeno" description="Zkuste jiné slovo, např. název tlačítka." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map(({ guide, sections }) => (
            <GuideCard key={guide.id} slug={slug} guide={guide} number={list.indexOf(guide) + 1} hits={q ? sections : []} />
          ))}
        </div>
      )}
    </div>
  )
}

function GuideCard({ slug, guide: g, number, hits }: { slug: string; guide: Guide; number: number; hits: Guide['sections'] }) {
  return (
    <div className="group relative flex flex-col rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/30">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
          <g.icon className="size-5" />
        </span>
        <span className="font-heading text-2xl font-semibold text-muted-foreground/30 tabular-nums">{String(number).padStart(2, '0')}</span>
      </div>
      <Link
        to="/a/$slug/guides/$topic"
        params={{ slug, topic: g.id }}
        className="font-heading text-lg leading-tight font-semibold after:absolute after:inset-0 group-hover:text-primary"
      >
        {g.title}
      </Link>
      <p className="mt-1 text-sm text-muted-foreground">{g.summary}</p>
      {hits.length > 0 && (
        <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
          {hits.slice(0, 4).map((s) => (
            <Link
              key={s.id}
              to="/a/$slug/guides/$topic"
              params={{ slug, topic: g.id }}
              hash={s.id}
              className={cn('rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10')}
            >
              {s.title}
            </Link>
          ))}
          {hits.length > 4 && <span className="self-center text-xs text-muted-foreground">+{hits.length - 4}</span>}
        </div>
      )}
    </div>
  )
}
