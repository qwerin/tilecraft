import type { Totals } from '@/lib/calc'
import { money, num } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface DocTotalsProps {
  totals: Totals
  /** Plátce DPH: ukáže základ, DPH a celkem s DPH. */
  vatPayer: boolean
  /** Sleva na celý doklad v % (pro popisek). */
  discount?: number
  className?: string
}

/** Součty dokladu po sekcích, sleva, DPH a celkem. */
export function DocTotals({ totals: t, vatPayer, discount, className }: DocTotalsProps) {
  const row = (label: string, v: number, cls?: string) => (
    <div className={cn('flex justify-between gap-4', cls)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{money(v)}</dd>
    </div>
  )
  return (
    <dl className={cn('flex flex-col gap-1 text-sm', className)}>
      {row('Práce', t.work)}
      {row('Materiál', t.material)}
      {t.other !== 0 && row('Ostatní', t.other)}
      {t.discount !== 0 && (
        <>
          {row('Mezisoučet', t.subtotal, 'border-t pt-1')}
          {row(`Sleva ${discount ? `${num(discount)} %` : ''}`.trim(), -t.discount)}
        </>
      )}
      {vatPayer && (
        <>
          {row('Základ bez DPH', t.base, 'border-t pt-1')}
          {row(`DPH ${t.vat_rate} %`, t.vat)}
        </>
      )}
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t pt-2">
        <dt className="font-semibold">{vatPayer ? 'Celkem s DPH' : 'Celkem'}</dt>
        <dd className="font-heading text-xl font-semibold tabular-nums">{money(t.total)}</dd>
      </div>
      {!vatPayer && <p className="text-xs text-muted-foreground">Nejsem plátce DPH.</p>}
    </dl>
  )
}
