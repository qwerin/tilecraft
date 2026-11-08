import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, XIcon } from 'lucide-react'
import { attachmentUrl } from '@/api/client'
import { cn } from '@/lib/utils'

type Image = { id: number; filename: string }

/** Náhled obrázků přes celou obrazovku: ←/→ mezi obrázky, Esc nebo klik mimo zavře, odkaz na originál. */
export function Lightbox({ slug, images, index, onIndex }: { slug: string; images: Image[]; index: number | null; onIndex: (i: number | null) => void }) {
  const open = index !== null && images.length > 0
  const i = open ? Math.min(index, images.length - 1) : 0
  const img = images[i]
  const many = images.length > 1
  const go = (step: number) => onIndex((i + step + images.length) % images.length)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/95 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          aria-label={img?.filename}
          className="fixed inset-0 z-50 flex flex-col text-white outline-none"
          onKeyDown={(e) => {
            if (!many) return
            if (e.key === 'ArrowLeft') go(-1)
            else if (e.key === 'ArrowRight') go(1)
            else return
            e.preventDefault()
          }}
        >
          {img && (
            <>
              <div className="flex items-center gap-3 px-4 py-3 text-sm">
                <DialogPrimitive.Title className="min-w-0 flex-1 truncate font-medium">{img.filename}</DialogPrimitive.Title>
                {many && (
                  <span className="text-white/70 tabular-nums">
                    {i + 1} / {images.length}
                  </span>
                )}
                <a href={attachmentUrl(slug, img.id)} download={img.filename} className={barButton}>
                  <DownloadIcon className="size-4" /> <span className="hidden sm:inline">Stáhnout originál</span>
                </a>
                <DialogPrimitive.Close className={barButton} aria-label="Zavřít">
                  <XIcon className="size-5" />
                </DialogPrimitive.Close>
              </div>
              <div
                className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16"
                onClick={(e) => e.target === e.currentTarget && onIndex(null)}
              >
                <img key={img.id} src={attachmentUrl(slug, img.id, true)} alt={img.filename} className="max-h-full max-w-full object-contain select-none" />
                {many && (
                  <>
                    <button type="button" onClick={() => go(-1)} className={cn(navButton, 'left-2')} aria-label="Předchozí">
                      <ChevronLeftIcon className="size-6" />
                    </button>
                    <button type="button" onClick={() => go(1)} className={cn(navButton, 'right-2')} aria-label="Další">
                      <ChevronRightIcon className="size-6" />
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

const barButton = 'flex h-9 items-center gap-1.5 rounded-md px-2.5 text-white/85 hover:bg-white/10 hover:text-white'
const navButton = 'absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/85 hover:bg-black/70 hover:text-white'

