import type { ComponentProps, ReactNode } from 'react'
import { useState } from 'react'
import { ChevronDownIcon, type LucideIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Nativní <select> ve stylu inputů (spolehlivý a rychlý na desktopu). */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select
        className="h-8 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 [&>option]:bg-popover"
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

/** Popisek + ovládací prvek + nápověda. */
export function FormRow({ label, htmlFor, hint, className, children }: { label: ReactNode; htmlFor?: string; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function PageHeader({ title, description, actions, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

/** Barevný odznak stavu (nabídka, zakázka, faktura); `tone` určuje barvu. */
export type BadgeTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'outline'
const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/12 text-primary',
  info: 'bg-accent text-accent-foreground',
  success: 'bg-success/15 text-success dark:text-success',
  warning: 'bg-warning/20 text-warning-foreground dark:text-warning',
  danger: 'bg-destructive/12 text-destructive',
  outline: 'border border-dashed border-muted-foreground/40 text-muted-foreground',
}
export function StatusBadge({ tone = 'neutral', className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', badgeTones[tone], className)}>{children}</span>
}

/** Prázdný stav stránky nebo seznamu: dlaždicová ikona, nadpis, popis a akce. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center', className)}>
      <div className="relative mb-4 grid size-16 grid-cols-2 gap-1 rotate-[-4deg]" aria-hidden>
        <span className="rounded-md bg-secondary ring-1 ring-border" />
        <span className="rounded-md bg-muted ring-1 ring-border" />
        <span className="rounded-md bg-muted ring-1 ring-border" />
        <span className="flex rotate-[10deg] items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
          {Icon && <Icon className="size-4" />}
        </span>
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

/** Stránka, která ještě není hotová (zástupce routy). */
export function ComingSoon({ title, description, icon }: { title: string; description?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={title} />
      <EmptyState icon={icon} title="Připravujeme" description={description ?? 'Tahle část aplikace se právě staví. Brzy tu bude.'} />
    </div>
  )
}

/** Potvrzovací dialog před nevratnou akcí; `children` je spouštěč (dostane onClick). */
export function Confirm({
  title,
  description,
  confirm = 'Smazat',
  onConfirm,
  trigger,
}: {
  title: string
  description?: ReactNode
  confirm?: string
  onConfirm: () => void | Promise<unknown>
  trigger: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {trigger(() => setOpen(true))}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                await onConfirm()
                setOpen(false)
              }}
            >
              {confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  )
}

/** Panel s nadpisem (detail nabídky/zakázky, nastavení). */
export function Panel({
  id,
  title,
  actions,
  className,
  children,
}: {
  id?: string
  title?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={cn('scroll-mt-4 rounded-xl border bg-card p-4 shadow-xs', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2 max-md:flex-wrap">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

/** Stránkování seznamu. */
export function Pager({ page, perPage, total, onPage }: { page: number; perPage: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-3 text-sm text-muted-foreground">
      <span>
        {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} z {total}
      </span>
      <div className="flex gap-1">
        <button className="rounded-md px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ← Předchozí
        </button>
        <span className="px-2 py-1">
          {page} / {pages}
        </span>
        <button className="rounded-md px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Další →
        </button>
      </div>
    </div>
  )
}

/** Vzhled jedné karty v `CardList` (odkaz nebo tlačítko na celou šířku). */
export const cardClass = 'block w-full rounded-xl border bg-card p-3 text-left text-sm shadow-xs transition-colors active:bg-muted hover:bg-muted/40'

/** Seznam karet místo tabulky — jen na telefonu (pod `md`); tabulka vedle něj dostane `max-md:hidden`. */
export function CardList({ className, empty, children }: { className?: string; empty?: ReactNode; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-2 md:hidden', className)}>
      {empty ? <p className="rounded-xl border bg-card px-3 py-10 text-center text-sm text-muted-foreground">{empty}</p> : children}
    </div>
  )
}

/** Tabulka v kartě s jednotným vzhledem (hlavička, hover řádků). */
export function DataTable({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border bg-card shadow-xs', className)}>
      <table className="w-full text-sm [&_tbody_tr]:border-t [&_tbody_tr:hover]:bg-muted/40 [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-muted-foreground [&_thead]:bg-muted/40">
        {children}
      </table>
    </div>
  )
}
