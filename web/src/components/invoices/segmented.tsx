import { cn } from '@/lib/utils'

/** Přepínač několika voleb (tlačítka vedle sebe), na telefonu dost velký na prst. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'default',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
  size?: 'default' | 'sm'
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-lg bg-muted p-[3px]', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-md px-3 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors hover:text-foreground',
            size === 'sm' ? 'h-7' : 'h-10 md:h-7',
            value === o.value && 'bg-background text-foreground shadow-sm dark:bg-input/40',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
