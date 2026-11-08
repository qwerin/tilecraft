// Drobné stavební prvky stránek nastavení.
import type { ReactNode } from 'react'
import { PencilIcon, Trash2Icon } from 'lucide-react'
import { Confirm } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

/** Přepínač s popiskem a nápovědou (řádek formuláře). */
export function SwitchRow({ label, hint, checked, onChange, className }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg p-2 -mx-2 hover:bg-muted/40', className)}>
      <Switch className="mt-0.5" checked={checked} onCheckedChange={(v) => onChange(v)} />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

/** Vysvětlující text pod hlavičkou stránky. */
export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground', className)}>{children}</div>
}

/** Ikony Upravit / Smazat na konci řádku tabulky. */
export function RowActions({ onEdit, deleteTitle, deleteDescription, onDelete }: { onEdit?: () => void; deleteTitle: string; deleteDescription?: ReactNode; onDelete: () => Promise<unknown> }) {
  return (
    <div className="flex justify-end gap-0.5">
      {onEdit && (
        <Button variant="ghost" size="icon-sm" title="Upravit" onClick={onEdit}>
          <PencilIcon />
        </Button>
      )}
      <Confirm
        title={deleteTitle}
        description={deleteDescription}
        onConfirm={() => onDelete().catch(() => undefined)}
        trigger={(open) => (
          <Button variant="ghost" size="icon-sm" title="Smazat" className="text-muted-foreground hover:text-destructive" onClick={open}>
            <Trash2Icon />
          </Button>
        )}
      />
    </div>
  )
}
