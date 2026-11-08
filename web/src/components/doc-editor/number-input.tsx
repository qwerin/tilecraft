import { useState, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { formatDecimal, parseDecimal } from './numbers'

type Props = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined
  onChange: (v: number | null) => void
  parse?: (s: string) => number | null
  format?: (n: number | null | undefined) => string
  /** Jednotka za číslem (m, m², %, Kč). */
  suffix?: string
  inputClassName?: string
}

/**
 * Číselný vstup s českou čárkou. Drží rozepsaný text (nepřepisuje ho při psaní), změny hlásí hned;
 * po opuštění pole text přeformátuje (např. „295“ → „2,95“ u metrů).
 */
export function NumberInput({ value, onChange, parse = parseDecimal, format = formatDecimal, suffix, className, inputClassName, onBlur, ...props }: Props) {
  const [text, setText] = useState(() => format(value))
  const [seen, setSeen] = useState(value)
  // změna hodnoty zvenku (ne naším psaním) přepíše text
  if (value !== seen) {
    setSeen(value)
    setText(format(value))
  }
  const invalid = text.trim() !== '' && parse(text) === null
  return (
    <div className={cn('relative', className)}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        value={text}
        aria-invalid={invalid || undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          const v = parse(t)
          if (t.trim() === '' || v !== null) {
            setSeen(v)
            if (v !== value) onChange(v)
          }
        }}
        onBlur={(e) => {
          setText(format(value))
          onBlur?.(e)
        }}
        className={cn(
          'h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-right text-base tabular-nums outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:h-8 md:text-sm dark:bg-input/30',
          suffix && 'pr-8',
          inputClassName,
        )}
        {...props}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  )
}
