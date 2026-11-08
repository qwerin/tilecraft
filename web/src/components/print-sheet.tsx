import type { ReactNode } from 'react'

/** Jedna strana A4 (na obrazovce jako papír; při tisku nová stránka před každým dalším listem, viz index.css). */
export function Sheet({ children }: { children: ReactNode }) {
  return (
    <div
      data-sheet
      className="min-h-[297mm] bg-white p-[14mm] text-[12px] leading-snug text-black shadow-lg [color-scheme:light] print:min-h-0 print:p-0 print:shadow-none"
    >
      {children}
    </div>
  )
}

/** Logo firmy na tiscích (nabídka, faktura); bez loga nic. */
export function PrintLogo({ src, className }: { src: string | undefined; className?: string }) {
  if (!src) return null
  return <img src={src} alt="" className={className ?? 'max-h-[18mm] max-w-[60mm] object-contain'} />
}
