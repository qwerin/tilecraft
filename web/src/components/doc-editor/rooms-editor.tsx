import { CopyIcon, EllipsisVerticalIcon, MinusIcon, PlusIcon, SquareDashedIcon, Trash2Icon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { round2, roomSummary, surfaceArea, total, type Deduction, type Room, type Summary, type Surface, type SurfaceKind } from '@/lib/calc'
import { num, parseMeters } from '@/lib/format'
import { cn } from '@/lib/utils'
import { duplicateRoomNames, kindLabels, newSurface, SURFACE_NAMES } from './model'
import { NumberInput } from './number-input'
import { formatDecimal } from './numbers'

export interface RoomsEditorProps {
  /** Místnosti zaměření (SPEC §5.1). */
  value: Room[]
  onChange: (rooms: Room[]) => void
  /** Jen náhled (přijatá nabídka, parťák). */
  readOnly?: boolean
  className?: string
}

const ROOM_NAMES = ['Koupelna', 'WC', 'Kuchyň', 'Chodba', 'Předsíň', 'Balkon', 'Terasa']
const DEDUCTIONS: Deduction[] = [
  { name: 'Dveře', width: 0.8, height: 1.97 },
  { name: 'Okno', width: 0.9, height: 1.2 },
  { name: 'Vana', width: 1.7, height: 0.55 },
]
const kinds: SurfaceKind[] = ['floor', 'wall', 'length', 'piece']
const wall = (width: number, height: number, count: number): Surface => ({ name: 'Stěny', kind: 'wall', width, height, count })

/** Zaměření: místnosti → plochy (podlaha, stěna, délka, kusy) s odpočty; živě spočítané plochy a souhrny. */
export function RoomsEditor({ value, onChange, readOnly, className }: RoomsEditorProps) {
  const dup = duplicateRoomNames(value)
  const setRoom = (i: number, r: Room) => onChange(value.map((x, j) => (j === i ? r : x)))
  const addRoom = (name?: string) => {
    const used = new Set(value.map((r) => r.name))
    let n = name ?? (used.has('Koupelna') ? `Místnost ${value.length + 1}` : 'Koupelna')
    for (let k = 2; used.has(n); k++) n = `${name ?? 'Místnost'} ${k}`
    onChange([...value, { name: n, surfaces: [newSurface('floor')] }])
  }
  const unusedNames = ROOM_NAMES.filter((n) => !value.some((r) => r.name === n))

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {value.length === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {readOnly ? 'Bez zaměření.' : 'Zatím žádná místnost. Přidejte první a změřte podlahu, stěny, lišty a kusy.'}
        </p>
      )}
      {value.map((r, i) => (
        <RoomCard
          key={i}
          room={r}
          duplicate={dup.has(r.name.trim()) || !r.name.trim()}
          readOnly={readOnly}
          onChange={(nr) => setRoom(i, nr)}
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
          onDuplicate={() => {
            const names = new Set(value.map((x) => x.name))
            let n = `${r.name} (kopie)`
            for (let k = 2; names.has(n); k++) n = `${r.name} (kopie ${k})`
            onChange([...value.slice(0, i + 1), { ...structuredClone(r), name: n }, ...value.slice(i + 1)])
          }}
        />
      ))}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => addRoom()}>
            <PlusIcon /> Přidat místnost
          </Button>
          {unusedNames.slice(0, 5).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => addRoom(n)}
              className="rounded-full border border-dashed px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
            >
              + {n}
            </button>
          ))}
        </div>
      )}
      {value.length > 1 && (
        <div className="rounded-xl bg-muted/50 px-3 py-2.5">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Celkem za všechny místnosti</p>
          <SummaryChips summary={total(value)} />
        </div>
      )}
    </div>
  )
}

/** Souhrn zaměření: podlahy, stěny, obvod, délky, kusy (nulové se nezobrazují). */
export function SummaryChips({ summary, className }: { summary: Summary; className?: string }) {
  const items: [string, string][] = []
  if (summary.floor) items.push(['Podlahy', `${num(summary.floor)} m²`])
  if (summary.wall) items.push(['Stěny', `${num(summary.wall)} m²`])
  if (summary.perimeter) items.push(['Obvod podlah', `${num(summary.perimeter)} bm`])
  if (summary.length) items.push(['Délky', `${num(summary.length)} bm`])
  if (summary.pieces) items.push(['Kusy', `${num(summary.pieces)} ks`])
  if (items.length === 0) return <p className={cn('text-xs text-muted-foreground', className)}>Zatím nic změřeno.</p>
  return (
    <div className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm', className)}>
      {items.map(([k, v]) => (
        <span key={k} className="whitespace-nowrap">
          <span className="text-muted-foreground">{k}</span> <span className="font-semibold tabular-nums">{v}</span>
        </span>
      ))}
    </div>
  )
}

function RoomCard({
  room,
  duplicate,
  readOnly,
  onChange,
  onRemove,
  onDuplicate,
}: {
  room: Room
  duplicate: boolean
  readOnly?: boolean
  onChange: (r: Room) => void
  onRemove: () => void
  onDuplicate: () => void
}) {
  const surfaces = room.surfaces ?? []
  const setSurface = (i: number, s: Surface) => onChange({ ...room, surfaces: surfaces.map((x, j) => (j === i ? s : x)) })
  const add = (...s: Surface[]) => onChange({ ...room, surfaces: [...surfaces, ...s] })
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        {readOnly ? (
          <h3 className="flex-1 font-heading text-base font-semibold">{room.name}</h3>
        ) : (
          <Input
            value={room.name}
            onChange={(e) => onChange({ ...room, name: e.target.value })}
            aria-label="Název místnosti"
            aria-invalid={duplicate || undefined}
            title={duplicate ? 'Každá místnost musí mít jiný název' : undefined}
            className="h-9 flex-1 border-transparent bg-transparent font-heading text-base font-semibold shadow-none hover:border-input md:h-8"
          />
        )}
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Možnosti místnosti" />}>
              <EllipsisVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDuplicate}>
                <CopyIcon /> Duplikovat místnost
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                <Trash2Icon /> Smazat místnost
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {duplicate && !readOnly && <p className="px-3 pt-2 text-xs text-destructive">Každá místnost musí mít vlastní název (řádky nabídky se na něj odkazují).</p>}
      <div className="divide-y">
        {surfaces.map((s, i) => (
          <SurfaceRow
            key={i}
            surface={s}
            readOnly={readOnly}
            onChange={(ns) => setSurface(i, ns)}
            onRemove={() => onChange({ ...room, surfaces: surfaces.filter((_, j) => j !== i) })}
            onAddWalls={(h) => {
              const w = round2(s.width)
              const d = round2(s.height)
              add(...(w === d ? [wall(w, h, 4)] : [wall(w, h, 2), wall(d, h, 2)]))
            }}
          />
        ))}
        {surfaces.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">Žádné plochy.</p>}
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
          {kinds.map((k) => (
            <Button key={k} type="button" variant="ghost" size="sm" onClick={() => add(newSurface(k))}>
              <PlusIcon /> {kindLabels[k]}
            </Button>
          ))}
        </div>
      )}
      <div className="border-t bg-muted/25 px-3 py-2">
        <SummaryChips summary={roomSummary(room)} />
      </div>
    </div>
  )
}

const meters = (n: number | null | undefined) => (n ? formatDecimal(n) : '')

function Dim({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Times() {
  return <span className="self-end pb-3 text-muted-foreground md:pb-2">×</span>
}

function SurfaceRow({
  surface: s,
  readOnly,
  onChange,
  onRemove,
  onAddWalls,
}: {
  surface: Surface
  readOnly?: boolean
  onChange: (s: Surface) => void
  onRemove: () => void
  onAddWalls: (height: number) => void
}) {
  const [wallsHeight, setWallsHeight] = useState<number | null | undefined>(undefined)
  const kind = s.kind as SurfaceKind
  const isArea = kind === 'floor' || kind === 'wall'
  const manual = s.area != null
  const area = surfaceArea(s)
  const deds = s.deductions ?? []
  const setDed = (i: number, d: Deduction) => onChange({ ...s, deductions: deds.map((x, j) => (j === i ? d : x)) })
  const meterProps = { parse: parseMeters, format: meters, placeholder: 'm / cm', disabled: readOnly }

  const result =
    kind === 'length' ? `${num(round2(s.width * (s.count || 1)))} bm` : kind === 'piece' ? `${num(s.count || 1)} ks` : `${num(area)} m²`

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <Input
          value={s.name}
          disabled={readOnly}
          onChange={(e) => onChange({ ...s, name: e.target.value })}
          placeholder={SURFACE_NAMES[kind]}
          aria-label="Název plochy"
          className="h-9 min-w-0 flex-1 font-medium md:h-8"
        />
        <span className="shrink-0 text-right font-semibold tabular-nums">{result}</span>
        {!readOnly && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Odebrat plochu" onClick={onRemove} className="text-muted-foreground">
            <Trash2Icon />
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <KindPicker value={kind} disabled={readOnly} onChange={(k) => onChange({ ...s, kind: k, name: s.name === SURFACE_NAMES[kind] ? SURFACE_NAMES[k] : s.name })} />
        {isArea && !readOnly && (
          <div className="ml-auto flex flex-wrap justify-end gap-1">
            {kind === 'floor' && !manual && s.width > 0 && s.height > 0 && wallsHeight === undefined && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setWallsHeight(2.1)} title="Přidá stěny podle rozměrů podlahy">
                <PlusIcon /> Stěny dokola
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onChange(manual ? { ...s, area: undefined } : { ...s, area: area || round2(s.width * s.height * (s.count || 1)) })}
            >
              <SquareDashedIcon /> {manual ? 'Zadat rozměry' : 'Zadat plochu'}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-1.5">
        {isArea && !manual && (
          <>
            <Dim label={kind === 'floor' ? 'Délka' : 'Šířka'} className="w-24">
              <NumberInput value={s.width || null} onChange={(v) => onChange({ ...s, width: v ?? 0 })} suffix="m" {...meterProps} />
            </Dim>
            <Times />
            <Dim label={kind === 'floor' ? 'Šířka' : 'Výška'} className="w-24">
              <NumberInput value={s.height || null} onChange={(v) => onChange({ ...s, height: v ?? 0 })} suffix="m" {...meterProps} />
            </Dim>
            <Times />
            <Dim label="Počet" className="w-16">
              <CountInput value={s.count} onChange={(c) => onChange({ ...s, count: c })} disabled={readOnly} />
            </Dim>
          </>
        )}
        {isArea && manual && (
          <Dim label="Plocha (nepravidelný tvar)" className="w-40">
            <NumberInput value={s.area ?? null} onChange={(v) => onChange({ ...s, area: v ?? 0 })} suffix="m²" disabled={readOnly} />
          </Dim>
        )}
        {kind === 'length' && (
          <>
            <Dim label="Délka" className="w-24">
              <NumberInput value={s.width || null} onChange={(v) => onChange({ ...s, width: v ?? 0 })} suffix="m" {...meterProps} />
            </Dim>
            <Times />
            <Dim label="Počet" className="w-16">
              <CountInput value={s.count} onChange={(c) => onChange({ ...s, count: c })} disabled={readOnly} />
            </Dim>
          </>
        )}
        {kind === 'piece' && (
          <Dim label="Počet kusů" className="w-24">
            <CountInput value={s.count} onChange={(c) => onChange({ ...s, count: c })} disabled={readOnly} />
          </Dim>
        )}
      </div>

      {wallsHeight !== undefined && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/50 p-2">
          <Dim label="Výška obkladu" className="w-28">
            <NumberInput value={wallsHeight} onChange={setWallsHeight} parse={parseMeters} format={meters} suffix="m" autoFocus />
          </Dim>
          <Button
            type="button"
            size="sm"
            disabled={!wallsHeight}
            onClick={() => {
              onAddWalls(wallsHeight!)
              setWallsHeight(undefined)
            }}
          >
            Přidat stěny
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setWallsHeight(undefined)}>
            Zrušit
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Přidá stěny {num(s.width)} a {num(s.height)} m, každou 2×. Okna, dveře a vanu pak odečtěte u stěn.
          </p>
        </div>
      )}

      {isArea && (deds.length > 0 || !readOnly) && (
        <div className="flex flex-col gap-1.5 pl-3 md:pl-10">
          {deds.map((d, i) => (
            <div key={i} className="flex flex-wrap items-end gap-1.5 border-l-2 border-destructive/30 pl-2">
              <Dim label="Odečet" className="w-full md:w-28">
                <Input
                  value={d.name}
                  disabled={readOnly}
                  onChange={(e) => setDed(i, { ...d, name: e.target.value })}
                  placeholder="Dveře, okno…"
                  className="h-11 md:h-8"
                />
              </Dim>
              <Dim label="Šířka" className="w-20">
                <NumberInput value={d.width || null} onChange={(v) => setDed(i, { ...d, width: v ?? 0 })} {...meterProps} />
              </Dim>
              <Times />
              <Dim label="Výška" className="w-20">
                <NumberInput value={d.height || null} onChange={(v) => setDed(i, { ...d, height: v ?? 0 })} {...meterProps} />
              </Dim>
              <Times />
              <Dim label="Počet" className="w-14">
                <CountInput value={d.count} onChange={(c) => setDed(i, { ...d, count: c })} disabled={readOnly} />
              </Dim>
              <span className="self-end pb-3 text-sm whitespace-nowrap text-destructive tabular-nums md:pb-2">
                −{num(round2(d.width * d.height * (d.count || 1)))} m²
              </span>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Odebrat odečet"
                  className="mb-2 text-muted-foreground md:mb-0.5"
                  onClick={() => onChange({ ...s, deductions: deds.filter((_, j) => j !== i) })}
                >
                  <MinusIcon />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted-foreground">Odečíst:</span>
              {DEDUCTIONS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => onChange({ ...s, deductions: [...deds, { ...p }] })}
                  className="rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
                >
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChange({ ...s, deductions: [...deds, { name: '', width: 0, height: 0 }] })}
                className="rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
              >
                Jiné
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CountInput({ value, onChange, disabled }: { value: number | undefined; onChange: (c: number | undefined) => void; disabled?: boolean }) {
  return (
    <NumberInput
      value={value || 1}
      disabled={disabled}
      inputMode="numeric"
      parse={(t) => {
        const n = Number(t.trim())
        return t.trim() === '' ? null : Number.isInteger(n) && n >= 0 ? n : null
      }}
      format={(n) => (n == null ? '' : String(n))}
      onChange={(v) => onChange(v && v > 1 ? v : undefined)}
    />
  )
}

function KindPicker({ value, onChange, disabled }: { value: SurfaceKind; onChange: (k: SurfaceKind) => void; disabled?: boolean }) {
  return (
    <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Druh plochy">
      {kinds.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          disabled={disabled && value !== k}
          onClick={() => !disabled && onChange(k)}
          className={cn(
            'rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors md:py-1',
            value === k ? 'bg-card text-foreground shadow-xs' : 'hover:text-foreground',
            disabled && value !== k && 'hidden',
          )}
          title={kindLabels[k]}
        >
          {kindLabels[k]}
        </button>
      ))}
    </div>
  )
}

