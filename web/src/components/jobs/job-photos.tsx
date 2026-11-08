import { useQuery } from '@tanstack/react-query'
import { CameraIcon, FileIcon, ImagePlusIcon, Trash2Icon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { attachmentUrl } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { isImage, jobMutations, type Job } from '@/api/jobs'
import { meQuery, useFirmMutation } from '@/api/queries'
import { Confirm, Panel } from '@/components/common'
import { Lightbox } from '@/components/lightbox'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { fileSize, fmtDateTime } from '@/lib/format'

/** Fotky a soubory zakázky: vyfotit přímo fotoaparátem nebo nahrát z galerie, náhled přes celou obrazovku, mazání vlastních. */
export function JobPhotos({ slug, job, isManager }: { slug: string; job: Job; isManager: boolean }) {
  const me = useQuery(meQuery).data
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [index, setIndex] = useState<number | null>(null)
  const upload = useFirmMutation(slug, jobMutations.upload(slug, job.id), [['jobs'], ['dashboard']])
  const del = useFirmMutation(slug, jobMutations.deleteAttachment(slug), [['jobs']])
  const images = job.attachments.filter(isImage)
  const files = job.attachments.filter((a) => !isImage(a))
  const canDelete = (uploadedBy: number) => isManager || uploadedBy === me?.id

  const onFiles = (list: FileList | null, input: HTMLInputElement | null) => {
    const picked = Array.from(list ?? [])
    if (input) input.value = ''
    if (picked.length === 0) return
    upload.mutate(picked, {
      onSuccess: () => toast.success(picked.length === 1 ? 'Fotka nahrána' : `Nahráno ${picked.length} souborů`),
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  return (
    <Panel
      id="fotky"
      title={`Fotky${job.attachments.length ? ` (${job.attachments.length})` : ''}`}
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
      {job.attachments.length === 0 && !upload.isPending ? (
        <button
          type="button"
          onClick={() => camera.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-8 text-sm text-muted-foreground hover:bg-muted/40"
        >
          <CameraIcon className="size-6" />
          Zatím žádné fotky. Vyfoťte stav před, během a po práci.
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
          {images.map((a, i) => (
            <div key={a.id} className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
              <button type="button" className="size-full" onClick={() => setIndex(i)} title={`${a.filename} · ${fmtDateTime(a.created_at)}`}>
                <img src={attachmentUrl(slug, a.id, true)} alt={a.filename} loading="lazy" className="size-full object-cover transition group-hover:scale-[1.03]" />
              </button>
              {canDelete(a.uploaded_by) && (
                <DeleteButton name={a.filename} onDelete={() => del.mutateAsync(a.id).then(() => toast.success('Fotka smazána'))} />
              )}
            </div>
          ))}
          {upload.isPending && (
            <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed">
              <Spinner />
            </div>
          )}
        </div>
      )}
      {files.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y rounded-lg border">
          {files.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <a href={attachmentUrl(slug, a.id, true)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                {a.filename}
              </a>
              <span className="text-xs text-muted-foreground">{fileSize(a.size)}</span>
              {canDelete(a.uploaded_by) && (
                <Confirm
                  title={`Smazat ${a.filename}?`}
                  onConfirm={() => del.mutateAsync(a.id)}
                  trigger={(open) => (
                    <Button variant="ghost" size="icon-sm" aria-label="Smazat" onClick={open}>
                      <Trash2Icon />
                    </Button>
                  )}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <Lightbox slug={slug} images={images} index={index} onIndex={setIndex} />
    </Panel>
  )
}

function DeleteButton({ name, onDelete }: { name: string; onDelete: () => Promise<unknown> }) {
  return (
    <Confirm
      title="Smazat fotku?"
      description={name}
      onConfirm={onDelete}
      trigger={(open) => (
        <button
          type="button"
          aria-label="Smazat fotku"
          onClick={open}
          className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-black/55 text-white opacity-90 transition hover:bg-black/75 md:size-7 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}
    />
  )
}
