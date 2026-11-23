// Editor kladečského plánu místnosti (SPEC §5.6): přes celou obrazovku na telefonu, výkres nahoře, nastavení pod ním
// (na počítači vedle). Mění kopii místnosti; „Hotovo“ ji vrátí do zaměření, „Uložit jako kladečský plán“ navíc
// uloží doklad a nahraje obrázek celé místnosti do příloh (kategorie Kladečský plán).
import { CheckIcon, ImageUpIcon, RotateCwIcon, ScanIcon, SparklesIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { round2, type Deduction, type Room, type Surface } from '@/lib/calc'
import { num } from '@/lib/format'
import {
  centerLayout,
  defaultLayout,
  defaultWaste,
  GROUT_PRESETS,
  optimizeOffsets,
  patternLabels,
  TILE_PRESETS,
  type AlignX,
  type AlignY,
  type Layout,
  type Pattern,
} from '@/lib/tile-layout'
import { cn } from '@/lib/utils'
import { canPlan, cm, planFilename, planSheet, roomSheet, surfacePanels, surfaceStats, svgToPng } from './laying-plan'
import { NumberInput } from './number-input'
import { formatDecimal } from './numbers'
import { useWidth } from './use-width'

export interface LayingPlanSave {
  /** Uloží zaměření (s plánem) a nahraje obrázek; vrací false při chybě (hlášku ukáže sám). */
  onSave: (room: Room, file: File, shared: boolean) => Promise<boolean>
  /** Plán lze ukázat zákazníkovi (nabídka). */
  canShare?: boolean
  /** Byl předchozí obrázek plánu ukázaný zákazníkovi? (undefined = žádný není) */
  sharedBefore?: (filename: string) => boolean | undefined
  /** Druhý řádek nadpisu obrázku (název nabídky / zakázky). */
  subtitle?: string
  /** Proč uložit nejde (nová nabídka bez zákazníka apod.). */
  disabledReason?: string
}

export function LayingPlanDialog({
  room,
  index,
  open,
  onOpenChange,
  readOnly,
  onApply,
  save,
}: {
  room: Room
  index: number
  open: boolean
  onOpenChange: (open: boolean) => void
  readOnly?: boolean
  onApply: (room: Room) => void
  save?: LayingPlanSave
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[94dvh] gap-3 overflow-y-auto sm:max-w-5xl',
          'max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:p-3',
        )}
      >
        {open && <PlanEditor room={room} index={index} readOnly={readOnly} onApply={onApply} save={save} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function PlanEditor({
  room,
  index,
  readOnly,
  onApply,
  save,
  onClose,
}: {
  room: Room
  index: number
  readOnly?: boolean
  onApply: (room: Room) => void
  save?: LayingPlanSave
  onClose: () => void
}) {
  const surfaces = room.surfaces ?? []
  const [draft, setDraft] = useState<Room>(() => {
    if (readOnly) return room
    // otevřená plocha bez plánu dostane výchozí
    const s = surfaces[index]
    return s && canPlan(s) && !s.layout ? withSurface(room, index, { ...s, layout: defaultLayout(s.kind as 'floor' | 'wall') }) : room
  })
  const [at, setAt] = useState(index)
  const filename = planFilename(room.name)
  const [shared, setShared] = useState(() => save?.sharedBefore?.(filename) ?? true)
  const [saving, setSaving] = useState(false)
  const [ref, width] = useWidth<HTMLDivElement>()

  const plannable = surfaces.map((s, i) => ({ s, i })).filter(({ s }) => canPlan(s))
  const s = draft.surfaces?.[at] as Surface | undefined
  const layout = s?.layout ?? null
  const kind = (s?.kind ?? 'wall') as 'floor' | 'wall'
  const panels = useMemo(() => (s && layout ? surfacePanels(s, at, layout) : []), [s, at, layout])
  const stats = s ? surfaceStats(s, panels) : null
  const maxH = typeof window !== 'undefined' ? Math.max(200, window.innerHeight * (window.innerWidth < 640 ? 0.36 : 0.6)) : 400
  const sheet = useMemo(() => (width > 0 && panels.length ? planSheet(panels, { width, maxHeight: maxH, maxScale: 260 }) : null), [panels, width, maxH])
  const anyPlan = (draft.surfaces ?? []).some((x) => x.layout && canPlan(x))
  const changed = JSON.stringify(draft) !== JSON.stringify(room)

  const setSurface = (ns: Surface) => setDraft((r) => withSurface(r, at, ns))
  const setLayout = (patch: Partial<Layout>) => s && layout && setSurface({ ...s, layout: { ...layout, ...patch } })
  const pick = (i: number) => {
    setAt(i)
    const t = draft.surfaces?.[i]
    // nová plocha převezme dlaždici z poslední upravované plochy stejného druhu, jinak výchozí
    if (!readOnly && t && canPlan(t) && !t.layout) {
      const same = (draft.surfaces ?? []).find((x, j) => j !== i && x.kind === t.kind && x.layout)?.layout
      setDraft((r) => withSurface(r, i, { ...t, layout: same ? { ...same, offset_x: 0, offset_y: 0 } : defaultLayout(t.kind as 'floor' | 'wall') }))
    }
  }

  const doSave = async () => {
    if (!save) return
    setSaving(true)
    try {
      const sheet = roomSheet(draft, save.subtitle)
      const blob = await svgToPng(sheet)
      const file = new File([blob], filename, { type: 'image/png' })
      if (await save.onSave(draft, file, !!save.canShare && shared)) {
        if (!readOnly) onApply(draft)
        onClose()
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader className="pr-8">
        <DialogTitle>Kladečský plán — {room.name || 'místnost'}</DialogTitle>
        <DialogDescription className="max-sm:sr-only">
          Formát dlaždic, spára a začátek kladení pro každou podlahu a stěnu. Plocha ani ceny se nemění.
        </DialogDescription>
      </DialogHeader>

      {plannable.length > 1 && (
        <div role="tablist" aria-label="Plocha" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {plannable.map(({ i }) => {
            const x = draft.surfaces![i]
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === at}
                onClick={() => pick(i)}
                className={cn(
                  'flex h-9 shrink-0 items-center gap-1 rounded-full border px-3 text-sm transition-colors md:h-7 md:text-xs',
                  i === at ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {x.layout && <CheckIcon className="size-3.5" />}
                {x.name || (x.kind === 'floor' ? 'Podlaha' : 'Stěna')}
              </button>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-2 max-md:sticky max-md:-top-3 max-md:z-10 max-md:-mx-3 max-md:bg-popover max-md:px-3 max-md:pt-1 max-md:pb-2 max-md:shadow-sm">
          <div ref={ref} className="w-full min-w-0">
            {!s || !canPlan(s) ? (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Kladečský plán jde nakreslit jen u podlahy nebo stěny zadané rozměry (ne plochou).
              </p>
            ) : !layout ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                Tahle plocha nemá kladečský plán.
                {!readOnly && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setSurface({ ...s, layout: defaultLayout(kind) })}>
                    Nakreslit plán
                  </Button>
                )}
              </div>
            ) : (
              sheet && (
                <div
                  className="overflow-hidden rounded-lg border bg-white"
                  role="img"
                  aria-label={`Kladečský plán: ${s.name}`}
                  // SVG skládá laying-plan.ts z čísel a escapovaných názvů
                  dangerouslySetInnerHTML={{ __html: sheet.svg }}
                />
              )
            )}
          </div>
          {stats && layout && <Stats stats={stats} layout={layout} />}
        </div>

        {s && layout && canPlan(s) && (
          <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
            <Group title="Dlaždice">
              <Chips>
                {TILE_PRESETS.map(([w, h]) => {
                  const on = (layout.tile_w === w && layout.tile_h === h) || (layout.tile_w === h && layout.tile_h === w)
                  return (
                    <Chip key={`${w}x${h}`} on={on} onClick={() => !on && setLayout({ tile_w: w, tile_h: h })}>
                      {w}×{h}
                    </Chip>
                  )
                })}
              </Chips>
              <div className="flex items-end gap-1.5">
                <Field label="Šířka" className="w-24">
                  <NumberInput value={layout.tile_w} onChange={(v) => v && v >= 1 && setLayout({ tile_w: v })} suffix="cm" />
                </Field>
                <span className="pb-3 text-muted-foreground md:pb-2">×</span>
                <Field label="Výška" className="w-24">
                  <NumberInput value={layout.tile_h} onChange={(v) => v && v >= 1 && setLayout({ tile_h: v })} suffix="cm" />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mb-1.5 md:mb-0.5"
                  disabled={layout.tile_w === layout.tile_h}
                  onClick={() => setLayout({ tile_w: layout.tile_h, tile_h: layout.tile_w })}
                  title="Na výšku / na šířku"
                >
                  <RotateCwIcon /> Otočit
                </Button>
              </div>
            </Group>

            <Group title="Spára">
              <div className="flex flex-wrap items-center gap-1.5">
                {GROUT_PRESETS.map((g) => (
                  <Chip key={g} on={layout.grout === g} onClick={() => setLayout({ grout: g })}>
                    {formatDecimal(g)} mm
                  </Chip>
                ))}
                <NumberInput value={layout.grout} onChange={(v) => v != null && v >= 0 && v <= 50 && setLayout({ grout: v })} suffix="mm" className="w-24" aria-label="Spára v mm" />
              </div>
            </Group>

            <Group title="Vzor">
              <Segmented<Pattern>
                value={layout.pattern ?? 'straight'}
                options={(['straight', 'half', 'third'] as const).map((p) => [p, patternLabels[p]])}
                onChange={(p) => setLayout({ pattern: p })}
              />
            </Group>

            <Group title="Začátek kladení" hint="Odkud se klade celá dlaždice (modře ve výkresu).">
              <Segmented<AlignX>
                value={layout.align_x ?? 'center'}
                options={[
                  ['left', 'Zleva'],
                  ['center', 'Na střed'],
                  ['right', 'Zprava'],
                ]}
                onChange={(a) => setLayout({ align_x: a, offset_x: 0 })}
              />
              <Segmented<AlignY>
                value={layout.align_y ?? (kind === 'wall' ? 'bottom' : 'center')}
                options={
                  kind === 'wall'
                    ? [
                        ['bottom', 'Od podlahy'],
                        ['center', 'Na střed'],
                        ['top', 'Od stropu'],
                      ]
                    : [
                        ['top', 'Nahoře'],
                        ['center', 'Na střed'],
                        ['bottom', 'Dole'],
                      ]
                }
                onChange={(a) => setLayout({ align_y: a, offset_y: 0 })}
              />
              <div className="flex flex-wrap items-end gap-1.5">
                <Field label="Posun doprava" className="w-28">
                  <NumberInput value={layout.offset_x ?? 0} onChange={(v) => setLayout({ offset_x: v ?? 0 })} suffix="cm" />
                </Field>
                <Field label="Posun nahoru" className="w-28">
                  <NumberInput value={layout.offset_y ?? 0} onChange={(v) => setLayout({ offset_y: v ?? 0 })} suffix="cm" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => setSurface({ ...s, layout: centerLayout(s.width, s.height, layout, kind) })}>
                  <ScanIcon /> Vycentrovat
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLayout(optimizeOffsets(s.width, s.height, layout, kind, panels.length === 1 ? panels[0].openings : []))}
                  title="Posune dlaždice tak, aby u krajů a kolem otvorů nebyly úzké řezy"
                >
                  <SparklesIcon /> Optimalizovat řezy
                </Button>
              </div>
            </Group>

            {(s.deductions ?? []).length > 0 && (
              <Group title="Otvory" hint="Poloha jen pro výkres, plocha se nemění.">
                {(s.deductions ?? []).map((d, i) => (
                  <OpeningRow key={i} d={d} kind={kind} panels={panels} index={i} H={s.height} onChange={(nd) => setSurface({ ...s, deductions: s.deductions!.map((x, j) => (j === i ? nd : x)) })} />
                ))}
              </Group>
            )}

            <Group title="Nákup">
              <div className="flex flex-wrap items-end gap-1.5">
                <Field label="Prořez" className="w-24">
                  <NumberInput
                    value={layout.waste ?? null}
                    placeholder={String(defaultWaste(layout))}
                    onChange={(v) => setLayout({ waste: v == null ? undefined : Math.min(100, Math.max(0, v)) })}
                    suffix="%"
                  />
                </Field>
                <Field label="m² v balení" className="w-28">
                  <NumberInput value={layout.box_m2 || null} onChange={(v) => setLayout({ box_m2: v && v > 0 ? v : undefined })} suffix="m²" />
                </Field>
              </div>
            </Group>

            {!readOnly && (
              <Button type="button" variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setSurface({ ...s, layout: undefined })}>
                <Trash2Icon /> Bez plánu
              </Button>
            )}
          </fieldset>
        )}
      </div>

      <div className="sticky -bottom-3 z-10 -mx-3 flex flex-wrap items-center gap-2 border-t bg-popover px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-bottom-4 sm:-mx-4 sm:px-4">
        {save?.canShare && (
          <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Switch size="sm" checked={shared} onCheckedChange={setShared} />
            Ukázat zákazníkovi
          </label>
        )}
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {readOnly ? (
            <Button type="button" variant="outline" onClick={onClose}>
              Zavřít
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={onClose}>
                Zrušit
              </Button>
              <Button
                type="button"
                variant={save ? 'outline' : 'default'}
                onClick={() => {
                  if (changed) onApply(draft)
                  onClose()
                }}
              >
                Hotovo
              </Button>
            </>
          )}
          {save && (
            <Button type="button" onClick={doSave} disabled={saving || !anyPlan || !!save.disabledReason} title={save.disabledReason}>
              {saving ? <Spinner /> : <ImageUpIcon />} Uložit jako kladečský plán
            </Button>
          )}
        </div>
        {save?.disabledReason && <p className="w-full text-right text-xs text-muted-foreground">{save.disabledReason}</p>}
      </div>
    </>
  )
}

function withSurface(r: Room, i: number, s: Surface): Room {
  return { ...r, surfaces: (r.surfaces ?? []).map((x, j) => (j === i ? s : x)) }
}

function Stats({ stats, layout }: { stats: NonNullable<ReturnType<typeof surfaceStats>>; layout: Layout }) {
  const b = stats.buy
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <span className="text-muted-foreground">Celé</span> <b className="tabular-nums">{stats.whole}</b>
        </span>
        <span>
          <span className="text-muted-foreground">Řezané</span> <b className="tabular-nums">{stats.cut}</b>
        </span>
        {stats.narrowest != null && (
          <span>
            <span className="text-muted-foreground">Nejužší řez</span> <b className="tabular-nums">{cm(stats.narrowest)} cm</b>
          </span>
        )}
      </div>
      <p className="text-muted-foreground">
        {num(stats.area)} m² + prořez {num(b.waste)} % = <b className="text-foreground tabular-nums">{num(b.m2)} m²</b> ≈ {b.tiles} ks dlaždic {layout.tile_w}×
        {layout.tile_h}
        {b.boxes != null && (
          <>
            {' '}
            = <b className="text-foreground">{b.boxes} bal.</b>
          </>
        )}
      </p>
      {stats.narrow > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          {stats.narrow === 1 ? 'Jeden řez je užší' : `${stats.narrow} řezů je užších`} než ⅓ dlaždice (červeně). Zkuste Optimalizovat řezy, Vycentrovat nebo
          posunout začátek.
        </p>
      )}
    </div>
  )
}

function OpeningRow({
  d,
  kind,
  panels,
  index,
  H,
  onChange,
}: {
  d: Deduction
  kind: 'floor' | 'wall'
  panels: ReturnType<typeof surfacePanels>
  index: number
  H: number
  onChange: (d: Deduction) => void
}) {
  const name = d.name.trim() || 'Otvor'
  const many = (d.count ?? 1) > 1
  const placed = panels.flatMap((p) => p.openings).find((o) => o.index === index)
  // výkres má y shora; u stěny ukazujeme výšku od podlahy
  const x = placed ? round2(placed.x) : null
  const y = placed ? round2(kind === 'wall' ? H - placed.y - placed.h : placed.y) : null
  const manual = d.x != null || d.y != null
  const set = (p: { x?: number; y?: number }) => onChange({ ...d, x: p.x ?? d.x ?? x ?? 0, y: p.y ?? d.y ?? y ?? 0 })
  return (
    <div className="flex flex-col gap-1 border-l-2 border-muted-foreground/30 pl-2">
      <p className="text-xs">
        <b>{name}</b>{' '}
        <span className="text-muted-foreground">
          {cm(d.width)} × {cm(d.height)} cm{many ? ` · ${d.count} ks` : ''}
        </span>
      </p>
      {many ? (
        <p className="text-xs text-muted-foreground">Víc kusů se rozmístí samo. Pro vlastní polohu je zadejte v zaměření po jednom.</p>
      ) : !placed ? (
        <p className="text-xs text-muted-foreground">Nemá rozměry.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-1.5">
          <Field label="Zleva" className="w-24">
            <NumberInput value={x} onChange={(v) => v != null && v >= 0 && set({ x: v })} suffix="m" />
          </Field>
          <Field label={kind === 'wall' ? 'Od podlahy' : 'Shora'} className="w-24">
            <NumberInput value={y} onChange={(v) => v != null && v >= 0 && set({ y: v })} suffix="m" />
          </Field>
          {manual && (
            <Button type="button" variant="ghost" size="sm" className="mb-1.5 text-muted-foreground md:mb-0.5" onClick={() => onChange({ ...d, x: undefined, y: undefined })}>
              Automaticky
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-0.5', className)}>
      <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Chips({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'h-9 rounded-full border px-3 text-sm tabular-nums transition-colors disabled:opacity-50 md:h-7 md:px-2.5 md:text-xs',
        on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-muted p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'flex-1 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors disabled:opacity-60 md:py-1',
            value === v ? 'bg-card text-foreground shadow-xs' : 'hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
