import { CalendarIcon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  dateToIso,
  formatCzDate,
  formatCzDateTime,
  isoToDate,
  parseCzDate,
  parseCzDateTime,
  quarterHours,
  roundToQuarter,
} from '@/lib/czdate'
import { cn } from '@/lib/utils'

type Props = {
  /** "YYYY-MM-DD" (DateInput) nebo "YYYY-MM-DDTHH:mm" (DateTimeInput); "" = prázdné */
  value: string
  onChange: (value: string) => void
  id?: string
  className?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  min?: string
  max?: string
}

/** Datum v českém formátu („27. 10. 2026“); lze psát i zkráceně („27.10.“), ikona (nebo F4 / Alt+↓) otevře kalendář. */
export function DateInput(props: Props) {
  return <CzInput {...props} kind="date" />
}

/**
 * Datum a čas v českém formátu („27. 10. 2026 14:30“, 24 h), čas po čtvrthodinách (napsaný se zaokrouhlí);
 * bez zadaného času platí čas původní hodnoty, jinak 8:00.
 */
export function DateTimeInput(props: Props) {
  return <CzInput {...props} kind="datetime" />
}

const DEFAULT_TIME = '08:00'

function CzInput({ value, onChange, id, className, required, disabled, placeholder, min, max, kind }: Props & { kind: 'date' | 'datetime' }) {
  const isDate = kind === 'date'
  const format = isDate ? formatCzDate : formatCzDateTime
  const [text, setText] = useState(() => format(value))
  const [shown, setShown] = useState(value)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  // změna hodnoty zvenku (načtení dat, kalendář) přepíše rozepsaný text
  if (value !== shown) {
    setShown(value)
    setText(format(value))
    setError(false)
  }

  const date = value.slice(0, 10)
  const time = isDate ? '' : value.slice(11, 16)

  const commit = () => {
    // nezměněný text nic nemění (ani nezaokrouhluje starší hodnotu)
    if (text === format(value)) {
      setError(false)
      return
    }
    let parsed = isDate ? parseCzDate(text) : parseCzDateTime(text, time || DEFAULT_TIME)
    if (parsed === null) {
      setError(true)
      return
    }
    if (!isDate && parsed) parsed = roundToQuarter(parsed)
    setError(false)
    setText(format(parsed))
    if (parsed !== value) onChange(parsed)
  }

  const pick = (next: string, close: boolean) => {
    if (next !== value) onChange(next)
    if (close) setOpen(false)
  }
  const pickDay = (d: Date) => (isDate ? pick(dateToIso(d), true) : pick(`${dateToIso(d)}T${time || DEFAULT_TIME}`, false))
  const pickTime = (t: string) => pick(`${date || dateToIso(new Date())}T${t}`, true)

  const selected = isoToDate(date)
  const minDate = isoToDate(min)
  const maxDate = isoToDate(max)
  const thisYear = new Date().getFullYear()
  const startMonth = minDate ?? new Date(Math.min(selected?.getFullYear() ?? thisYear, thisYear - 10), 0)
  const endMonth = maxDate ?? new Date(Math.max(selected?.getFullYear() ?? thisYear, thisYear + 5), 11)
  const todayIso = dateToIso(new Date())
  const todayAllowed = (!min || todayIso >= min.slice(0, 10)) && (!max || todayIso <= max.slice(0, 10))

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        disabled={disabled}
        required={required}
        placeholder={placeholder ?? (isDate ? 'd. m. rrrr' : 'd. m. rrrr hh:mm')}
        aria-invalid={error || undefined}
        title={error ? 'Neplatné datum — např. 27. 10. 2026' + (isDate ? '' : ' 14:30') : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) {
            e.preventDefault()
            commit()
            setOpen(true)
          }
        }}
        className="h-full min-h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={isDate ? 'Vybrat v kalendáři' : 'Vybrat datum a čas'}
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <CalendarIcon className="size-4" />
        </PopoverTrigger>
        <PopoverContent
            ref={popupRef}
            anchor={rootRef}
            className="flex w-auto flex-col gap-2"
            initialFocus={() => popupRef.current?.querySelector<HTMLElement>('[data-day] button[tabindex="0"]') ?? true}
            finalFocus={inputRef}
          >
            <div className="flex gap-2">
              <Calendar
                mode="single"
                required
                selected={selected}
                onSelect={pickDay}
                defaultMonth={selected ?? (maxDate && maxDate < new Date() ? maxDate : undefined)}
                captionLayout="dropdown"
                startMonth={startMonth}
                endMonth={endMonth}
                disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
              />
              {!isDate && <TimeList value={time} onPick={pickTime} />}
            </div>
            <div className="flex items-center justify-between gap-2 border-t pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!todayAllowed}
                onClick={() => pickDay(new Date())}
              >
                Dnes
              </Button>
              {!required && value && (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => pick('', true)}>
                  Vymazat
                </Button>
              )}
            </div>
          </PopoverContent>
      </Popover>
    </div>
  )
}

/** Sloupec čtvrthodin; po otevření posunutý na vybraný čas (jinak na začátek pracovní doby), šipkami nahoru/dolů. */
function TimeList({ value, onPick }: { value: string; onPick: (t: string) => void }) {
  const target = value ? roundToQuarter(`2000-01-01T${value}`).slice(11, 16) : DEFAULT_TIME
  // jen při otevření (stabilní ref callback), ne při každém překreslení
  const scrollOnMount = useCallback((el: HTMLDivElement | null) => {
    const t = el?.querySelector<HTMLElement>('[data-target]')
    if (el && t) el.scrollTop = t.offsetTop - el.clientHeight / 2 + t.offsetHeight / 2
  }, [])

  return (
    <div className="flex w-20 flex-col border-l pl-2">
      <div className="flex h-8 items-center justify-center text-sm font-medium">Čas</div>
      <div
        ref={scrollOnMount}
        role="listbox"
        aria-label="Čas"
        className="relative h-64 overflow-y-auto pr-1"
        onKeyDown={(e) => {
          const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
          const i = items.indexOf(document.activeElement as HTMLButtonElement)
          const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : null
          if (to === null) return
          e.preventDefault()
          items[Math.max(0, Math.min(items.length - 1, to))]?.focus()
        }}
      >
        {quarterHours.map((t) => {
          const isSelected = t === value
          return (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-target={t === target || undefined}
              tabIndex={t === target ? 0 : -1}
              onClick={() => onPick(t)}
              className={cn(
                'flex h-7 w-full items-center justify-center rounded-md text-sm tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                t.endsWith(':00') ? 'font-medium' : 'text-muted-foreground',
                isSelected && 'bg-primary text-primary-foreground hover:bg-primary/85',
              )}
            >
              {Number(t.slice(0, 2))}:{t.slice(3)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
