import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  PackageCheckIcon,
  PlusIcon,
  RulerIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  TagsIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import type { CatalogItem } from '@/api/catalog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { fromMinor, money, num, toMinor, unitLabel, units } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  computeLines,
  emptyLine,
  insertLines,
  lineFromCatalog,
  measureLabels,
  measureUnits,
  sectionLabels,
  sections,
  usualLines,
  type ComputedLine,
  type DocLine,
  type Measure,
  type Room,
  type Section,
} from './model'
import { NumberInput } from './number-input'

export interface LinesEditorProps {
  /** Řádky dokladu (v pořadí; editor je drží seřazené po sekcích). */
  value: DocLine[]
  onChange: (lines: DocLine[]) => void
  /** Zaměření — z něj se počítají množství řádků s `measure`. */
  rooms: Room[]
  /** Aktivní položky ceníku pro přidávání. */
  catalog: CatalogItem[]
  readOnly?: boolean
  /** Bez cen a částek (parťák). */
  hidePrices?: boolean
  className?: string
}

const money0 = (n: number | null | undefined) => fromMinor(n ?? 0)

/** Řádky dokladu po sekcích Práce / Materiál / Ostatní: z ceníku nebo vlastní, množství ze zaměření nebo ručně. */
export function LinesEditor({ value, onChange, rooms, catalog, readOnly, hidePrices, className }: LinesEditorProps) {
  const computed = useMemo(() => computeLines(value, rooms), [value, rooms])
  const [picker, setPicker] = useState<Section | 'all' | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const usual = useMemo(() => (readOnly ? [] : usualLines(catalog, rooms, value)), [readOnly, catalog, rooms, value])
  const roomNames = rooms.map((r) => r.name.trim()).filter(Boolean)

  const set = (i: number, l: DocLine) => onChange(value.map((x, j) => (j === i ? l : x)))
  const remove = (i: number) => {
    setOpen(null)
    onChange(value.filter((_, j) => j !== i))
  }
  const move = (i: number, dir: -1 | 1) => {
    let j = i + dir
    while (j >= 0 && j < value.length && value[j].section !== value[i].section) j += dir
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOpen(j)
    onChange(next)
  }
  const addLines = (add: DocLine[]) => onChange(insertLines(value, add))

  return (
    <div className={cn('@container flex flex-col gap-4', className)}>
      {usual.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5">
          <SparklesIcon className="size-5 shrink-0 text-primary max-sm:hidden" />
          <p className="min-w-0 flex-1 basis-56 text-sm">
            Z ceníku lze doplnit {usual.length === 1 ? '1 obvyklou položku' : `${usual.length} obvyklých položek`} s množstvím ze zaměření
            <span className="text-muted-foreground"> ({usual.map((l) => l.name).slice(0, 3).join(', ')}{usual.length > 3 ? '…' : ''})</span>.
          </p>
          <Button type="button" size="sm" className="max-sm:w-full" onClick={() => addLines(usual)}>
            <SparklesIcon /> Přidat obvyklé položky
          </Button>
        </div>
      )}

      {sections.map((sec) => {
        const idx = value.map((l, i) => (l.section === sec ? i : -1)).filter((i) => i >= 0)
        if (readOnly && idx.length === 0) return null
        const subtotal = idx.reduce((a, i) => a + computed[i].amount, 0)
        return (
          <section key={sec} className="flex flex-col">
            <div className="mb-1.5 flex items-baseline justify-between gap-2 border-b pb-1.5">
              <h3 className="font-heading text-base font-semibold">{sectionLabels[sec]}</h3>
              {!hidePrices && idx.length > 0 && <span className="text-sm font-semibold tabular-nums">{money(subtotal)}</span>}
            </div>
            {idx.length > 0 && !readOnly && (
              <div
                className={cn(
                  'hidden gap-2 px-1 pb-1 text-[11px] font-medium text-muted-foreground @5xl:grid',
                  hidePrices ? 'grid-cols-[minmax(0,1fr)_7rem_5rem_2rem]' : gridCols,
                )}
              >
                <span>Položka</span>
                <span className="text-right">Množství</span>
                <span>Jedn.</span>
                {!hidePrices && (
                  <>
                    <span className="text-right">Cena / jedn.</span>
                    <span className="text-right">Sleva</span>
                    <span className="text-right">Částka</span>
                  </>
                )}
                <span />
              </div>
            )}
            <div className="flex flex-col divide-y">
              {idx.map((i) =>
                readOnly ? (
                  <LineView key={i} line={computed[i]} hidePrices={hidePrices} />
                ) : (
                  <LineRow
                    key={i}
                    line={value[i]}
                    computed={computed[i]}
                    rooms={rooms}
                    roomNames={roomNames}
                    hidePrices={hidePrices}
                    open={open === i}
                    onToggle={() => setOpen(open === i ? null : i)}
                    onChange={(l) => set(i, l)}
                    onRemove={() => remove(i)}
                    onMove={(d) => move(i, d)}
                    onDuplicate={() => {
                      onChange([...value.slice(0, i + 1), { ...value[i] }, ...value.slice(i + 1)])
                      setOpen(i + 1)
                    }}
                  />
                ),
              )}
            </div>
            {idx.length === 0 && !readOnly && <p className="py-2 text-sm text-muted-foreground">Žádné položky.</p>}
            {!readOnly && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => setPicker(sec)}>
                  <TagsIcon /> Z ceníku
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = insertLines(value, [emptyLine(sec)])
                    onChange(next)
                    setOpen(next.findLastIndex((l) => l.section === sec))
                  }}
                >
                  <PlusIcon /> Vlastní řádek
                </Button>
              </div>
            )}
          </section>
        )
      })}

      {picker && (
        <CatalogPicker
          catalog={catalog}
          initial={picker}
          used={new Set(value.map((l) => l.catalog_item_id).filter((x): x is number => x != null))}
          onAdd={(c) => addLines([lineFromCatalog(c, rooms)])}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}

const gridCols = 'grid-cols-[minmax(0,1fr)_7rem_5rem_7rem_4.5rem_6.5rem_2rem]'

function Cell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-[11px] leading-none text-muted-foreground @5xl:hidden">{label}</span>
      {children}
    </div>
  )
}

function measureCaption(l: DocLine) {
  if (!l.measure) return ''
  return `ze zaměření: ${measureLabels[l.measure]}${l.rooms.length ? ` (${l.rooms.join(', ')})` : ''}${l.waste ? ` + ${num(l.waste)} %` : ''}`
}

function LineRow({
  line: l,
  computed: c,
  rooms,
  roomNames,
  hidePrices,
  open,
  onToggle,
  onChange,
  onRemove,
  onMove,
  onDuplicate,
}: {
  line: DocLine
  computed: ComputedLine
  rooms: Room[]
  roomNames: string[]
  hidePrices?: boolean
  open: boolean
  onToggle: () => void
  onChange: (l: DocLine) => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
}) {
  const measured = !!l.measure
  return (
    <div className={cn('py-2', open && 'rounded-lg bg-muted/30')}>
      <div className={cn('grid grid-cols-12 items-start gap-x-2 gap-y-2 px-1', hidePrices ? '@5xl:grid-cols-[minmax(0,1fr)_7rem_5rem_2rem]' : '@5xl:grid-cols-[minmax(0,1fr)_7rem_5rem_7rem_4.5rem_6.5rem_2rem]')}>
        <div className="col-span-10 min-w-0 @xl:col-span-11 @5xl:col-span-1">
          <Input
            value={l.name}
            onChange={(e) => onChange({ ...l, name: e.target.value })}
            placeholder="Název položky"
            aria-label="Název položky"
            aria-invalid={!l.name.trim() || undefined}
            className="font-medium"
          />
          {(measured || l.note) && (
            <p className="mt-0.5 truncate px-1 text-xs text-muted-foreground @max-xl:hidden">
              {measured && (
                <>
                  <RulerIcon className="mr-1 inline size-3 text-primary" />
                  {measureCaption(l)}
                </>
              )}
              {measured && l.note && ' · '}
              {l.note}
            </p>
          )}
        </div>
        <div className="col-span-2 flex justify-end @xl:col-span-1 @5xl:order-last">
          <Button
            type="button"
            variant={open ? 'secondary' : 'ghost'}
            size="icon"
            aria-label="Podrobnosti řádku"
            aria-expanded={open}
            onClick={onToggle}
            className="text-muted-foreground"
          >
            <Settings2Icon />
          </Button>
        </div>
        <Cell label={measured ? 'Ze zaměření' : 'Množství'} className="col-span-4 @xl:col-span-3 @5xl:col-span-1">
          <div className="relative">
            {measured && <RulerIcon className="pointer-events-none absolute top-1/2 left-2 z-10 size-3.5 -translate-y-1/2 text-primary" />}
            <NumberInput
              value={c.quantity}
              onChange={(v) => onChange({ ...l, measure: '', rooms: [], quantity: v ?? 0 })}
              aria-label="Množství"
              title={measured ? `${measureCaption(l)} — přepsáním zadáte množství ručně` : undefined}
              inputClassName={cn(measured && 'border-primary/40 bg-primary/5 pl-7 dark:bg-primary/10')}
            />
          </div>
        </Cell>
        <Cell label="Jedn." className="col-span-3 @xl:col-span-2 @5xl:col-span-1">
          <UnitSelect value={l.unit} onChange={(u) => onChange({ ...l, unit: u })} />
        </Cell>
        {!hidePrices && (
          <>
            <Cell label="Cena / jedn." className="col-span-5 @xl:col-span-3 @5xl:col-span-1">
              <NumberInput
                value={l.unit_price}
                onChange={(v) => onChange({ ...l, unit_price: v ?? 0 })}
                parse={toMinor}
                format={money0}
                suffix="Kč"
                aria-label="Cena za jednotku"
              />
            </Cell>
            <Cell label="Sleva" className="col-span-3 @xl:col-span-2 @5xl:col-span-1">
              <NumberInput
                value={l.discount || null}
                onChange={(v) => onChange({ ...l, discount: Math.min(100, Math.max(0, v ?? 0)) })}
                suffix="%"
                placeholder="0"
                aria-label="Sleva v %"
              />
            </Cell>
            <div className="col-span-9 flex items-center justify-between gap-2 self-end pb-2 @xl:col-span-2 @xl:justify-end @5xl:col-span-1 @5xl:block @5xl:self-start @5xl:pt-1.5 @5xl:pb-0 @5xl:text-right">
              <span className="flex flex-wrap gap-1 @xl:hidden">
                {measured && <Tag tone="primary">{measureCaption(l)}</Tag>}
                {l.customer_supplied && <Tag>dodá zákazník</Tag>}
              </span>
              <span className={cn('font-semibold whitespace-nowrap tabular-nums', l.customer_supplied && 'text-muted-foreground')}>
                {l.customer_supplied ? <span className="text-xs font-normal">dodá zákazník</span> : money(c.amount)}
              </span>
            </div>
          </>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-3 border-t px-1 pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Množství</span>
              <Select
                value={l.measure}
                onChange={(e) => {
                  const m = e.target.value as Measure
                  onChange({ ...l, measure: m, rooms: m ? l.rooms : [], unit: m ? measureUnits[m] : l.unit, quantity: c.quantity })
                }}
              >
                <option value="">Zadané ručně</option>
                {(Object.keys(measureLabels) as Exclude<Measure, ''>[]).map((m) => (
                  <option key={m} value={m}>
                    Ze zaměření: {measureLabels[m]} ({unitLabel(measureUnits[m])})
                  </option>
                ))}
              </Select>
            </label>
            {measured && (
              <label className="flex w-28 flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Prořez</span>
                <NumberInput value={l.waste || null} onChange={(v) => onChange({ ...l, waste: Math.min(100, Math.max(0, v ?? 0)) })} suffix="%" placeholder="0" />
              </label>
            )}
            {!hidePrices && (
              <label className="flex items-center gap-2 pb-2 text-sm @5xl:pb-1">
                <Switch checked={l.customer_supplied} onCheckedChange={(v) => onChange({ ...l, customer_supplied: v })} />
                <PackageCheckIcon className="size-4 text-muted-foreground" /> Dodá zákazník (0 Kč)
              </label>
            )}
          </div>
          {measured && roomNames.length > 1 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Z místností</span>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={l.rooms.length === 0} onClick={() => onChange({ ...l, rooms: [] })}>
                  Všechny
                </Chip>
                {roomNames.map((n) => (
                  <Chip
                    key={n}
                    active={l.rooms.includes(n)}
                    onClick={() => onChange({ ...l, rooms: l.rooms.includes(n) ? l.rooms.filter((x) => x !== n) : [...l.rooms, n] })}
                  >
                    {n}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {measured && rooms.length === 0 && <p className="text-xs text-warning-foreground dark:text-warning">Zaměření je prázdné — množství vychází 0.</p>}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Poznámka k řádku</span>
            <Input value={l.note} onChange={(e) => onChange({ ...l, note: e.target.value })} placeholder="Např. barva, formát obkladu…" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => onMove(-1)}>
              <ArrowUpIcon /> Nahoru
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onMove(1)}>
              <ArrowDownIcon /> Dolů
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDuplicate}>
              <CopyIcon /> Duplikovat
            </Button>
            <Button type="button" variant="destructive" size="sm" className="ml-auto" onClick={onRemove}>
              <Trash2Icon /> Odebrat řádek
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Řádek jen pro čtení. */
function LineView({ line: l, hidePrices }: { line: ComputedLine; hidePrices?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium">{l.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {num(l.quantity)} {unitLabel(l.unit)}
          {!hidePrices && <> × {money(l.unit_price)}</>}
          {!hidePrices && l.discount > 0 && <> − {num(l.discount)} %</>}
          {l.measure && <> · {measureCaption(l)}</>}
          {l.note && <> · {l.note}</>}
        </p>
      </div>
      {!hidePrices && (
        <span className={cn('shrink-0 font-semibold whitespace-nowrap tabular-nums', l.customer_supplied && 'text-xs font-normal text-muted-foreground')}>
          {l.customer_supplied ? 'dodá zákazník' : money(l.amount)}
        </span>
      )}
    </div>
  )
}

function Tag({ tone, children }: { tone?: 'primary'; children: ReactNode }) {
  return (
    <span className={cn('inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[11px]', tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      {children}
    </span>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs transition-colors md:py-1',
        active ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** Nativní select s výškou podle zařízení (velký prst na telefonu). */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:h-8 md:text-sm dark:bg-input/30 [&>option]:bg-popover',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

function UnitSelect({ value, onChange }: { value: string; onChange: (u: string) => void }) {
  const list: string[] = units.includes(value as (typeof units)[number]) || !value ? [...units] : [value, ...units]
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Jednotka">
      {list.map((u) => (
        <option key={u} value={u}>
          {unitLabel(u)}
        </option>
      ))}
    </Select>
  )
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Výběr z ceníku: hledání, filtr podle druhu; klepnutí položku přidá (dialog zůstane otevřený). */
function CatalogPicker({
  catalog,
  initial,
  used,
  onAdd,
  onClose,
}: {
  catalog: CatalogItem[]
  initial: Section | 'all'
  used: Set<number>
  onAdd: (c: CatalogItem) => void
  onClose: () => void
}) {
  const [kind, setKind] = useState<Section | 'all'>(initial)
  const [q, setQ] = useState('')
  const [added, setAdded] = useState<number[]>([])
  const items = catalog.filter((c) => c.active && (kind === 'all' || c.kind === kind) && (!q || fold(`${c.code ?? ''} ${c.name}`).includes(fold(q))))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Přidat z ceníku</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat v ceníku…" className="pl-8" autoFocus />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', ...sections] as const).map((k) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
              {k === 'all' ? 'Vše' : sectionLabels[k]}
            </Chip>
          ))}
        </div>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto border-y">
          {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nic nenalezeno.</p>}
          {items.map((c) => {
            const n = added.filter((x) => x === c.id).length
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onAdd(c)
                  setAdded([...added, c.id])
                }}
                className="flex w-full items-center gap-3 border-b px-4 py-2.5 text-left text-sm last:border-b-0 hover:bg-muted/60 active:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {kind === 'all' && `${sectionLabels[c.kind]} · `}
                    {money(c.price)} / {unitLabel(c.unit)}
                    {c.discount ? ` · sleva ${num(c.discount)} %` : ''}
                    {c.measure ? ` · ze zaměření: ${measureLabels[c.measure as Exclude<Measure, ''>]}` : ''}
                    {c.waste ? ` + ${num(c.waste)} %` : ''}
                  </span>
                </span>
                {n > 0 ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-success">
                    <CheckIcon className="size-4" /> {n > 1 ? `${n}×` : 'přidáno'}
                  </span>
                ) : used.has(c.id) ? (
                  <span className="text-xs text-muted-foreground">v nabídce</span>
                ) : (
                  <PlusIcon className="size-4 text-muted-foreground" />
                )}
              </button>
            )
          })}
        </div>
        <DialogFooter>
          <span className="mr-auto self-center text-sm text-muted-foreground">{added.length > 0 && `Přidáno ${added.length}`}</span>
          <Button type="button" onClick={onClose}>
            Hotovo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

