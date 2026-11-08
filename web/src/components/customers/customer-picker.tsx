import { ChevronsUpDownIcon, PhoneIcon, PlusIcon, SearchIcon, UserIcon } from 'lucide-react'
import { useState } from 'react'
import { useCustomers, type Customer } from '@/api/customers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { CustomerFormDialog } from './customer-form'

/** Vybraný zákazník (stačí id a jméno — např. `CustomerRef` z dokladu). */
export type PickedCustomer = { id: number; name: string; phone?: string; email?: string; address?: string }

export interface CustomerPickerProps {
  slug: string
  value: PickedCustomer | null
  /** Vybraný nebo právě založený zákazník (celý záznam). */
  onChange: (c: Customer) => void
  disabled?: boolean
  /** Popisek tlačítka bez výběru. */
  placeholder?: string
  /** Otevřít výběr hned po zobrazení (nové zaměření). */
  defaultOpen?: boolean
  className?: string
  id?: string
}

/** Výběr zákazníka: tlačítko → dialog s hledáním a založením nového zákazníka přímo z výběru. */
export function CustomerPicker({ slug, value, onChange, disabled, placeholder = 'Vybrat zákazníka', defaultOpen, className, id }: CustomerPickerProps) {
  const [open, setOpen] = useState(!!defaultOpen && !value)
  const [creating, setCreating] = useState<string | null>(null)
  return (
    <>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60 md:min-h-8 dark:bg-input/30',
          className,
        )}
      >
        <UserIcon className="size-4 shrink-0 text-muted-foreground" />
        {value ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{value.name}</span>
            {(value.address || value.phone) && <span className="block truncate text-xs text-muted-foreground">{[value.address, value.phone].filter(Boolean).join(' · ')}</span>}
          </span>
        ) : (
          <span className="flex-1 text-muted-foreground">{placeholder}</span>
        )}
        {!disabled && <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <PickerDialog
          slug={slug}
          selectedId={value?.id}
          onPick={(c) => {
            onChange(c)
            setOpen(false)
          }}
          onCreate={(name) => {
            setOpen(false)
            setCreating(name)
          }}
          onClose={() => setOpen(false)}
        />
      )}
      {creating !== null && <CustomerFormDialog slug={slug} initialName={creating} compact onSaved={onChange} onClose={() => setCreating(null)} />}
    </>
  )
}

function PickerDialog({
  slug,
  selectedId,
  onPick,
  onCreate,
  onClose,
}: {
  slug: string
  selectedId?: number
  onPick: (c: Customer) => void
  onCreate: (name: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const { data, isFetching } = useCustomers(slug, q.trim(), 1, 30)
  const items = data?.items ?? []
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(36rem,calc(100dvh-2rem))] flex-col gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zákazník</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Jméno, telefon, e-mail, obec…"
            className="pl-8"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (items.length === 1) onPick(items[0])
                else if (items.length === 0 && q.trim()) onCreate(q.trim())
              }
            }}
          />
          {isFetching && <Spinner className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />}
        </div>
        <Button type="button" variant="outline" className="justify-start" onClick={() => onCreate(q.trim())}>
          <PlusIcon /> {q.trim() ? `Nový zákazník „${q.trim()}“` : 'Nový zákazník'}
        </Button>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto border-t">
          {data && items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{q ? 'Nikdo takový zatím není.' : 'Zatím žádní zákazníci.'}</p>}
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className={cn('flex w-full flex-col border-b px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted/60 active:bg-muted', c.id === selectedId && 'bg-primary/8')}
            >
              <span className="font-medium">{c.name}</span>
              <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {c.phone && (
                  <span className="inline-flex items-center gap-1">
                    <PhoneIcon className="size-3" />
                    {c.phone}
                  </span>
                )}
                {[c.street, c.city].filter(Boolean).join(', ')}
                {c.quotes > 0 && <span>{c.quotes} nab.</span>}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
