import type { ReactNode } from 'react'
import { Logo } from '@/components/logo'
import { cn } from '@/lib/utils'

// Dekorativní mozaika: pozice v mřížce 6×5, některé dlaždice terakotové, jedna se právě pokládá (pootočená).
const mosaic: { c: number; r: number; tone: 'cream' | 'sand' | 'terra' | 'glaze'; tilt?: boolean }[] = [
  { c: 3, r: 0, tone: 'sand' },
  { c: 4, r: 0, tone: 'cream' },
  { c: 5, r: 0, tone: 'glaze' },
  { c: 2, r: 1, tone: 'cream' },
  { c: 3, r: 1, tone: 'terra' },
  { c: 4, r: 1, tone: 'sand' },
  { c: 5, r: 1, tone: 'cream' },
  { c: 4, r: 2, tone: 'glaze' },
  { c: 5, r: 2, tone: 'terra' },
  { c: 3, r: 2, tone: 'cream', tilt: true },
  { c: 5, r: 3, tone: 'sand' },
]
const toneClass = {
  cream: 'bg-[#f3e6d2]',
  sand: 'bg-[#e0c6a8]',
  terra: 'bg-sidebar-primary',
  glaze: 'bg-sidebar-accent ring-1 ring-white/10',
}

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="tile-grid relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground [--tile:48px] lg:flex lg:flex-col lg:justify-between">
        <Logo tone="light" />
        <div className="pointer-events-none absolute top-16 right-10 grid grid-cols-6 gap-2.5" aria-hidden>
          {mosaic.map((t, i) => (
            <span
              key={i}
              style={{ gridColumnStart: t.c + 1, gridRowStart: t.r + 1 }}
              className={cn(
                'size-16 rounded-lg shadow-[0_6px_16px_-6px_oklch(0_0_0/0.45)] xl:size-20',
                toneClass[t.tone],
                t.tilt && 'translate-x-2 -translate-y-3 -rotate-12 shadow-[0_18px_30px_-8px_oklch(0_0_0/0.55)]',
              )}
            />
          ))}
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">Od zaměření po fakturu. Přímo ze stavby.</h2>
          <p className="mt-4 text-sidebar-foreground/75">
            Změřte místnosti v telefonu, nabídka se spočítá z vašeho ceníku. Zákazník ji přijme jedním klikem a z hotové zakázky je faktura s QR platbou.
          </p>
        </div>
        <p className="relative text-sm text-sidebar-foreground/50">© {new Date().getFullYear()} TileCraft</p>
      </div>
      <div className="flex flex-col">
        <div className="tile-grid bg-sidebar px-6 py-5 [--tile:32px] lg:hidden">
          <Logo tone="light" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
