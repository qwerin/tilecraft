import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, BookOpenIcon, ExternalLinkIcon, LightbulbIcon, TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState, Panel } from '@/components/common'
import { GuideText } from '@/components/guides/guide-text'
import { buttonVariants } from '@/components/ui/button'
import { useFirm } from '@/hooks/use-firm'
import { guidesFor, type Guide, type GuideSection } from '@/lib/guides'
import { cn } from '@/lib/utils'

// Jeden návod: k čemu to je, oddíly s očíslovanými kroky, tipy a záludnosti, odkazy do aplikace.
export const Route = createFileRoute('/a/$slug/guides_/$topic')({ component: GuidePage })

function GuidePage() {
  const { slug, isManager } = useFirm()
  const { topic } = Route.useParams()
  const list = guidesFor(isManager)
  const i = list.findIndex((g) => g.id === topic)
  const g = list[i]

  const back = (
    <Link to="/a/$slug/guides" params={{ slug }} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon className="size-4" /> Návody
    </Link>
  )
  if (!g)
    return (
      <div className="mx-auto max-w-3xl">
        {back}
        <EmptyState icon={BookOpenIcon} title="Návod nenalezen" description="Tento návod neexistuje nebo není pro vaši roli." />
      </div>
    )

  const prev = list[i - 1]
  const next = list[i + 1]
  const related = (g.related ?? []).map((id) => list.find((x) => x.id === id)).filter((x): x is Guide => !!x)

  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <header className="mb-5 flex items-start gap-4">
        <span className="tile-grid flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm [--grout:oklch(1_0_0/12%)] [--tile:14px]">
          <g.icon className="size-7" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">Návod {i + 1} z {list.length}</p>
          <h1 className="font-heading text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{g.title}</h1>
        </div>
      </header>

      <div className="mb-5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
        <p className="mb-0.5 text-xs font-semibold text-primary">K čemu to je</p>
        <p className="text-sm leading-relaxed">{g.purpose}</p>
      </div>

      {g.sections.length > 1 && (
        <nav aria-label="Obsah návodu" className="mb-5 flex flex-wrap gap-1.5">
          {g.sections.map((s, n) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs hover:text-foreground md:py-1">
              <span className="mr-1 text-primary tabular-nums">{n + 1}.</span>
              {s.title}
            </a>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-4">
        {g.sections.map((s, n) => (
          <Section key={s.id} section={s} n={n + 1} />
        ))}
      </div>

      {g.links.length > 0 && (
        <Panel title="Kde to najdete v aplikaci" className="mt-4">
          <div className="flex flex-wrap gap-2">
            {g.links.map((l) => (
              <Link
                key={l.label}
                to={l.to}
                params={{ slug }}
                search={l.search as never}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <ExternalLinkIcon /> {l.label}
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {related.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Související návody</p>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link key={r.id} to="/a/$slug/guides/$topic" params={{ slug, topic: r.id }} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                <r.icon className="text-primary" /> {r.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2 border-t pt-4 pb-6">
        {prev ? (
          <Link to="/a/$slug/guides/$topic" params={{ slug, topic: prev.id }} className="flex flex-col rounded-xl border bg-card px-3 py-2 text-sm shadow-xs hover:bg-muted/40">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowLeftIcon className="size-3.5" /> Předchozí
            </span>
            <span className="font-medium">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to="/a/$slug/guides/$topic" params={{ slug, topic: next.id }} className="flex flex-col items-end rounded-xl border bg-card px-3 py-2 text-right text-sm shadow-xs hover:bg-muted/40">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              Další <ArrowRightIcon className="size-3.5" />
            </span>
            <span className="font-medium">{next.title}</span>
          </Link>
        )}
      </div>
    </div>
  )
}

function Section({ section: s, n }: { section: GuideSection; n: number }) {
  return (
    <Panel
      id={s.id}
      title={
        <span className="flex items-center gap-2 font-heading text-base">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary tabular-nums">{n}</span>
          {s.title}
        </span>
      }
    >
      <div className="flex flex-col gap-3 text-sm leading-relaxed">
        {s.text && (
          <p>
            <GuideText text={s.text} />
          </p>
        )}
        {s.steps && (
          <ol className="flex flex-col gap-2.5">
            {s.steps.map((step, k) => (
              <li key={k} className="flex gap-3">
                <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/40 text-xs font-semibold text-primary tabular-nums">
                  {k + 1}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <GuideText text={step} />
                </span>
              </li>
            ))}
          </ol>
        )}
        {s.code && (
          <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs leading-relaxed">
            {s.code.join('\n')}
          </pre>
        )}
        {s.example && <Example example={s.example} />}
        {s.tips?.map((t, k) => (
          <Note key={`t${k}`} tone="tip">
            <GuideText text={t} />
          </Note>
        ))}
        {s.warnings?.map((t, k) => (
          <Note key={`w${k}`} tone="warning">
            <GuideText text={t} />
          </Note>
        ))}
      </div>
    </Panel>
  )
}

function Note({ tone, children }: { tone: 'tip' | 'warning'; children: ReactNode }) {
  const Icon = tone === 'tip' ? LightbulbIcon : TriangleAlertIcon
  return (
    <div className={cn('flex gap-2.5 rounded-lg px-3 py-2', tone === 'tip' ? 'bg-success/10' : 'bg-warning/15')}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone === 'tip' ? 'text-success' : 'text-warning-foreground dark:text-warning')} />
      <p className="min-w-0 flex-1">
        <span className="sr-only">{tone === 'tip' ? 'Tip: ' : 'Pozor: '}</span>
        {children}
      </p>
    </div>
  )
}

function Example({ example: e }: { example: NonNullable<GuideSection['example']> }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <p className="border-b bg-muted/40 px-3 py-2 font-medium">{e.title}</p>
      {e.intro && <p className="px-3 pt-2 text-muted-foreground">{e.intro}</p>}
      <div className="hidden grid-cols-2 gap-3 px-3 pt-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase sm:grid">
        <span>Na papíře</span>
        <span>V aplikaci</span>
      </div>
      <ul className="divide-y">
        {e.rows.map((r, k) => (
          <li key={k} className="grid gap-1 px-3 py-2 sm:grid-cols-2 sm:gap-3">
            <span className="font-medium tabular-nums">{r.paper}</span>
            <span className="text-muted-foreground">
              <span className="text-xs font-semibold text-primary sm:hidden">→ </span>
              <GuideText text={r.app} />
            </span>
          </li>
        ))}
      </ul>
      {e.note && (
        <p className="border-t bg-primary/5 px-3 py-2">
          <GuideText text={e.note} />
        </p>
      )}
    </div>
  )
}
