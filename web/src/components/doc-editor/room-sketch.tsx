// Náčrt místnosti ze zaměření (inline SVG): podlahy půdorysem, stěny rozvinuté s výřezy odpočtů, délky, kusy.
// Geometrie v sketch-layout.ts; tady jen kreslení, barvy z tématu (fill-/stroke- třídy) a klik na plochu.
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Room } from '@/lib/calc'
import { cn } from '@/lib/utils'
import { layoutRoom, type SketchItem, type SketchText } from './sketch-layout'

export interface RoomSketchProps {
  room: Room
  /** Index plochy (v `room.surfaces`), která se právě upravuje — zvýrazní se. */
  highlight?: number | null
  /** Klik na plochu v náčrtu. */
  onSelectSurface?: (index: number) => void
  className?: string
}

/** Šířka prvku v px (ResizeObserver). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

const TILE_M = 0.3 // dlaždice 30 cm

const toneClass: Record<SketchText['tone'], string> = {
  normal: 'fill-foreground/80',
  muted: 'fill-muted-foreground',
  strong: 'fill-foreground font-semibold',
  cut: 'fill-muted-foreground',
  warn: 'fill-destructive',
}

export function RoomSketch({ room, highlight, onSelectSurface, className }: RoomSketchProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const layout = useMemo(() => (width > 0 ? layoutRoom(room, width) : null), [room, width])
  const uid = useId().replace(/:/g, '')
  const tile = TILE_M * (layout?.scale ?? 0)

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div ref={ref}>
        {layout && layout.items.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">Náčrt se objeví po zadání rozměrů.</p>}
        {layout && layout.items.length > 0 && (
          <svg
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="block max-w-full font-sans text-foreground select-none"
            role="img"
            aria-label={`Náčrt: ${room.name}`}
          >
            <defs>
              <pattern id={`${uid}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" className="stroke-muted-foreground/60" strokeWidth="1.5" />
              </pattern>
              {tile >= 5 &&
                layout.items.map(
                  (it, i) =>
                    it.box &&
                    it.tileOrigin && (
                      <pattern key={i} id={`${uid}-tile-${i}`} x={it.tileOrigin.x} y={it.tileOrigin.y} width={tile} height={tile} patternUnits="userSpaceOnUse">
                        <path d={`M ${tile} 0 L 0 0 0 ${tile}`} fill="none" className="stroke-foreground/12" strokeWidth="1" />
                      </pattern>
                    ),
                )}
            </defs>
            {layout.labels.map((t, i) => (
              <Label key={`l${i}`} t={t} />
            ))}
            {layout.items.map((it, i) => (
              <Item
                key={i}
                it={it}
                tileId={tile >= 5 ? `${uid}-tile-${i}` : undefined}
                hatchId={`${uid}-hatch`}
                active={highlight === it.index}
                onSelect={onSelectSurface}
                name={room.surfaces?.[it.index]?.name}
              />
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}

function Label({ t }: { t: SketchText }) {
  return (
    <text
      x={t.x}
      y={t.y}
      fontSize={t.size}
      textAnchor={t.anchor}
      transform={t.vertical ? `rotate(-90 ${t.x} ${t.y})` : undefined}
      className={cn(toneClass[t.tone], 'tabular-nums', t.tone === 'strong' && 'stroke-card [paint-order:stroke]')}
      strokeWidth={t.tone === 'strong' ? 3 : undefined}
      strokeLinejoin="round"
    >
      {t.text}
    </text>
  )
}

function Item({
  it,
  tileId,
  hatchId,
  active,
  onSelect,
  name,
}: {
  it: SketchItem
  tileId?: string
  hatchId: string
  active: boolean
  onSelect?: (i: number) => void
  name?: string
}) {
  const clickable = !!onSelect
  return (
    <g
      className={cn(clickable && 'cursor-pointer', 'group/sk')}
      onClick={clickable ? () => onSelect(it.index) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(it.index)
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Upravit: ${name || 'plocha'}` : undefined}
    >
      <title>{it.warning ? `${name ?? ''} — ${it.warning.message}` : (name ?? '')}</title>
      <rect x={it.hit.x} y={it.hit.y} width={it.hit.w} height={it.hit.h} fill="transparent" />
      {it.box && (
        <>
          <rect
            x={it.box.x}
            y={it.box.y}
            width={it.box.w}
            height={it.box.h}
            className={cn(active ? 'fill-primary/20' : 'fill-primary/7', clickable && !active && 'group-hover/sk:fill-primary/12')}
          />
          {tileId && !it.box.dashed && <rect x={it.box.x} y={it.box.y} width={it.box.w} height={it.box.h} fill={`url(#${tileId})`} />}
          <rect
            x={it.box.x}
            y={it.box.y}
            width={it.box.w}
            height={it.box.h}
            fill="none"
            strokeWidth={active ? 2.5 : 1.25}
            strokeDasharray={it.box.dashed ? '5 4' : undefined}
            className={active ? 'stroke-primary' : 'stroke-foreground/70'}
          />
        </>
      )}
      {it.cuts.map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={c.y} width={c.w} height={c.h} className="fill-card" />
          <rect x={c.x} y={c.y} width={c.w} height={c.h} fill={`url(#${hatchId})`} />
          <rect
            x={c.x}
            y={c.y}
            width={c.w}
            height={c.h}
            fill="none"
            strokeWidth={1}
            strokeDasharray={c.clamped ? '3 2' : undefined}
            className={c.clamped ? 'stroke-destructive' : 'stroke-foreground/60'}
          />
        </g>
      ))}
      {it.dims.map((d, i) => (
        <Dim key={i} {...d} />
      ))}
      {it.line && (
        <g className={active ? 'stroke-primary' : 'stroke-foreground/70'} strokeWidth={active ? 2.5 : 1.75} strokeLinecap="round">
          <line x1={it.line.x1} y1={it.line.y} x2={it.line.x2} y2={it.line.y} />
          <line x1={it.line.x1} y1={it.line.y - 5} x2={it.line.x1} y2={it.line.y + 5} />
          <line x1={it.line.x2} y1={it.line.y - 5} x2={it.line.x2} y2={it.line.y + 5} />
          {it.line.ticks.map((x, i) => (
            <line key={i} x1={x} y1={it.line!.y - 2.5} x2={x} y2={it.line!.y + 2.5} strokeWidth={1} />
          ))}
          {it.line.broken && (
            <path
              d={`M ${it.line.x2 - 14} ${it.line.y + 5} l 4 -10 M ${it.line.x2 - 9} ${it.line.y + 5} l 4 -10`}
              strokeWidth={1.25}
              className="stroke-muted-foreground"
            />
          )}
        </g>
      )}
      {it.dots?.map((d, i) => (
        <circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={d.r}
          strokeWidth={active ? 2 : 1.25}
          className={active ? 'fill-primary/30 stroke-primary' : 'fill-primary/10 stroke-foreground/70'}
        />
      ))}
      {it.texts.map((t, i) => (
        <Label key={i} t={t} />
      ))}
      {it.warning && (
        <g>
          <circle cx={it.warning.x} cy={it.warning.y} r={6.5} className="fill-destructive" />
          <text x={it.warning.x} y={it.warning.y + 3.5} fontSize={10} textAnchor="middle" className="fill-white font-bold">
            !
          </text>
        </g>
      )}
    </g>
  )
}

/** Kótovací čára se šikmými značkami na koncích. */
function Dim({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g className="stroke-muted-foreground" strokeWidth={0.75}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1 - 3} y1={y1 + 3} x2={x1 + 3} y2={y1 - 3} />
      <line x1={x2 - 3} y1={y2 + 3} x2={x2 + 3} y2={y2 - 3} />
    </g>
  )
}
