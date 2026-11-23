import { useQuery } from '@tanstack/react-query'
import { CameraIcon, EllipsisVerticalIcon, EyeIcon, EyeOffIcon, FileIcon, FolderInputIcon, ImagePlusIcon, Trash2Icon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  attachmentCategories,
  attachmentMutations,
  categoryHints,
  categoryLabels,
  isImage,
  type Attachment,
  type AttachmentCategory,
  type AttachmentTarget,
} from '@/api/attachments'
import { attachmentUrl } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { meQuery, useFirmMutation } from '@/api/queries'
import { Panel } from '@/components/common'
import { Lightbox } from '@/components/lightbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { fileSize, fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Fotky a soubory nabídky nebo zakázky po kategoriích (Před / Během / Hotovo / Kladečský plán / Ostatní):
 * vyfotit přímo fotoaparátem nebo nahrát z galerie do zvolené kategorie, přesun mezi kategoriemi,
 * kladečský plán nabídky lze ukázat zákazníkovi, mazání vlastních (kancelář všech).
 */
export function AttachmentsPanel({
  slug,
  target,
  attachments,
  categories,
  defaultCategory,
  isManager,
  canShare = false,
  invalidate,
  title = 'Fotky a kladečský plán',
  empty,
}: {
  slug: string
  target: AttachmentTarget
  attachments: Attachment[]
  /** Kategorie nabízené pro nahrání (zobrazí se i jiné, pokud v nich něco je). */
  categories: AttachmentCategory[]
  defaultCategory: AttachmentCategory
  isManager: boolean
  /** Kladečský plán lze ukázat zákazníkovi (nabídka). */
  canShare?: boolean
  invalidate: string[][]
  title?: string
  empty: string
}) {
  const me = useQuery(meQuery).data
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<AttachmentCategory | null>(null)
  const [lightbox, setLightbox] = useState<{ images: Attachment[]; index: number } | null>(null)
  const [deleting, setDeleting] = useState<Attachment | null>(null)
  const category = picked ?? defaultCategory
  const upload = useFirmMutation(slug, attachmentMutations.upload(slug, target), [...invalidate, ['dashboard']])
  const patch = useFirmMutation(slug, attachmentMutations.patch(slug), invalidate)
  const del = useFirmMutation(slug, attachmentMutations.remove(slug), invalidate)
  const canChange = (a: Attachment) => isManager || a.uploaded_by === me?.id
  const shown = attachmentCategories.filter((c) => categories.includes(c) || attachments.some((a) => a.category === c))

  const onFiles = (list: FileList | null, input: HTMLInputElement | null) => {
    const files = Array.from(list ?? [])
    if (input) input.value = ''
    if (files.length === 0) return
    upload.mutate(
      { files, category },
      {
        onSuccess: () => toast.success(`${files.length === 1 ? 'Nahráno' : `Nahráno ${files.length} souborů`} do: ${categoryLabels[category]}`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }
  const change = (a: Attachment, body: { category?: AttachmentCategory; shared?: boolean }, done: string) =>
    patch.mutate({ id: a.id, ...body }, { onSuccess: () => toast.success(done), onError: (e) => toast.error(errorMessage(e)) })

  const menu = (a: Attachment, overlay: boolean) =>
    canChange(a) && (
      <ItemMenu
        a={a}
        overlay={overlay}
        categories={categories}
        canShare={canShare && isManager && a.category === 'plan'}
        onMove={(c) => change(a, { category: c }, `Přesunuto do: ${categoryLabels[c]}`)}
        onShare={(shared) => change(a, { shared }, shared ? 'Plán uvidí zákazník v nabídce' : 'Plán je skrytý před zákazníkem')}
        onDelete={() => setDeleting(a)}
      />
    )

  return (
    <Panel
      id="fotky"
      title={`${title}${attachments.length ? ` (${attachments.length})` : ''}`}
      actions={
        <div className="flex gap-2 max-md:w-full">
          <Button className="max-md:flex-1" onClick={() => camera.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Spinner /> : <CameraIcon />} Vyfotit
          </Button>
          <Button variant="outline" className="max-md:flex-1" onClick={() => gallery.current?.click()} disabled={upload.isPending}>
            <ImagePlusIcon /> Nahrát
          </Button>
          <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onFiles(e.target.files, e.target)} />
          <input ref={gallery} type="file" accept="image/*,video/*,application/pdf" multiple hidden onChange={(e) => onFiles(e.target.files, e.target)} />
        </div>
      }
    >
      <div role="radiogroup" aria-label="Kam nahrát" className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <span className="shrink-0 self-center text-xs text-muted-foreground">Nahrát do:</span>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === category}
            onClick={() => setPicked(c)}
            title={categoryHints[c]}
            className={cn(
              'h-9 shrink-0 rounded-full border px-3 text-sm transition-colors md:h-7 md:text-xs',
              c === category ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {categoryLabels[c]}
          </button>
        ))}
      </div>

      {attachments.length === 0 && !upload.isPending ? (
        <button
          type="button"
          onClick={() => camera.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground hover:bg-muted/40"
        >
          <CameraIcon className="size-6" />
          {empty}
        </button>
      ) : (
        <div className="flex flex-col gap-4">
          {shown.map((c) => {
            const items = attachments.filter((a) => a.category === c)
            const pending = upload.isPending && c === category
            if (items.length === 0 && !pending) return null
            const images = items.filter(isImage)
            const files = items.filter((a) => !isImage(a))
            return (
              <section key={c} aria-label={categoryLabels[c]}>
                <h3 className="mb-1.5 flex items-baseline gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {categoryLabels[c]}
                  <span className="font-normal normal-case">
                    {items.length} · {categoryHints[c]}
                  </span>
                </h3>
                {(images.length > 0 || pending) && (
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
                    {images.map((a, i) => (
                      <div key={a.id} className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
                        <button type="button" className="size-full" onClick={() => setLightbox({ images, index: i })} title={`${a.filename} · ${fmtDateTime(a.created_at)}`}>
                          <img src={attachmentUrl(slug, a.id, true)} alt={a.filename} loading="lazy" className="size-full object-cover transition group-hover:scale-[1.03]" />
                        </button>
                        {a.shared && <SharedBadge />}
                        {menu(a, true)}
                      </div>
                    ))}
                    {pending && (
                      <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed">
                        <Spinner />
                      </div>
                    )}
                  </div>
                )}
                {files.length > 0 && (
                  <ul className={cn('flex flex-col divide-y rounded-lg border', images.length > 0 && 'mt-2')}>
                    {files.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                        <a href={attachmentUrl(slug, a.id, true)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                          {a.filename}
                        </a>
                        {a.shared && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
                            <EyeIcon className="size-3.5" /> zákazník
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">{fileSize(a.size)}</span>
                        {menu(a, false)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      <Lightbox
        slug={slug}
        images={lightbox?.images ?? []}
        index={lightbox?.index ?? null}
        onIndex={(i) => setLightbox((l) => (i === null || !l ? null : { ...l, index: i }))}
      />
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting && isImage(deleting) ? 'Smazat fotku?' : 'Smazat soubor?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.filename}
              {deleting?.quote_id && deleting.job_id ? ' Soubor zmizí z nabídky i ze zakázky.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zpět</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!deleting) return
                try {
                  await del.mutateAsync(deleting.id)
                  toast.success('Smazáno')
                } catch (e) {
                  toast.error(errorMessage(e))
                }
                setDeleting(null)
              }}
            >
              Smazat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  )
}

function SharedBadge() {
  return (
    <span
      title="Zákazník plán vidí v nabídce"
      className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
    >
      <EyeIcon className="size-3" /> zákazník
    </span>
  )
}

function ItemMenu({
  a,
  overlay,
  categories,
  canShare,
  onMove,
  onShare,
  onDelete,
}: {
  a: Attachment
  overlay: boolean
  categories: AttachmentCategory[]
  canShare: boolean
  onMove: (c: AttachmentCategory) => void
  onShare: (shared: boolean) => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          overlay ? (
            <button
              type="button"
              aria-label="Akce se souborem"
              className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-black/55 text-white opacity-90 transition hover:bg-black/75 md:size-7 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-popup-open:opacity-100"
            />
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label="Akce se souborem" />
          )
        }
      >
        <EllipsisVerticalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {canShare &&
          (a.shared ? (
            <DropdownMenuItem onClick={() => onShare(false)}>
              <EyeOffIcon className="size-4" /> Skrýt před zákazníkem
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => onShare(true)}>
              <EyeIcon className="size-4" /> Ukázat zákazníkovi v nabídce
            </DropdownMenuItem>
          ))}
        {canShare && <DropdownMenuSeparator />}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-1.5">
            <FolderInputIcon className="size-3.5" /> Přesunout do
          </DropdownMenuLabel>
          {categories
            .filter((c) => c !== a.category)
            .map((c) => (
              <DropdownMenuItem key={c} onClick={() => onMove(c)}>
                {categoryLabels[c]}
              </DropdownMenuItem>
            ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2Icon className="size-4" /> Smazat
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
