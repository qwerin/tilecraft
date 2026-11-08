import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/common'
import { useNews } from '@/hooks/use-news'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/a/$slug/news')({ component: NewsPage })

function NewsPage() {
  const { entries, seenIds, markSeen } = useNews()
  // „nové“ se zvýrazní podle stavu při otevření stránky, pak se vše označí za přečtené
  const [fresh] = useState(() => new Set(entries.filter((e) => !seenIds.has(e.id)).map((e) => e.id)))
  useEffect(() => {
    markSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Novinky" description="Co v aplikaci přibylo a změnilo se." />
      <ol className="flex flex-col gap-4">
        {entries.map((e) => (
          <li key={e.id} className={cn('rounded-xl border bg-card p-4 shadow-xs', fresh.has(e.id) && 'border-primary/40 bg-primary/5')}>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-semibold">{e.title}</h2>
              <span className="text-xs text-muted-foreground">{fmtDate(e.date)}</span>
              {fresh.has(e.id) && <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">nové</span>}
            </div>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {e.items.map((it) => (
                <li key={it.text}>{it.text}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
