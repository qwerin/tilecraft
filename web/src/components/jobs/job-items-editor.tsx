import { useState } from 'react'
import { toast } from 'sonner'
import { useCatalog } from '@/api/catalog'
import { jobMutations, jobToInput, type Job } from '@/api/jobs'
import { useFirmMutation } from '@/api/queries'
import { Panel } from '@/components/common'
import { LinesEditor } from '@/components/doc-editor/lines-editor'
import { computeTotals, duplicateRoomNames, lineFromApi, lineToInput, roomsToInput, syncLinesWithRooms, type DocLine, type Room } from '@/components/doc-editor/model'
import { RoomsEditor } from '@/components/doc-editor/rooms-editor'
import { Button } from '@/components/ui/button'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Úprava skutečnosti zakázky (vlastník/kancelář): zaměření a řádky podle reality (víc m², vícepráce).
 * Řádky jsou ve dvou skupinách: původní (z nabídky) a „Práce a náklady navíc“ (`extra`, SPEC §6.1) —
 * co se přidá do druhé skupiny, je navíc a v upravené nabídce se zákazníkovi zvýrazní.
 * Ukládá se celá zakázka přes PUT /jobs/{id}; ostatní údaje zůstávají z načtené zakázky.
 */
export function JobItemsEditor({ slug, job, onDone }: { slug: string; job: Job; onDone: () => void }) {
  const catalog = useCatalog(slug).data ?? []
  const [rooms, setRooms] = useState<Room[]>(() => job.rooms as Room[])
  const [base, setBase] = useState<DocLine[]>(() => job.lines.filter((l) => !l.extra).map(lineFromApi))
  const [extras, setExtras] = useState<DocLine[]>(() => job.lines.filter((l) => l.extra).map(lineFromApi))
  const lines = [...base, ...extras]
  const setLines = (f: (ls: DocLine[]) => DocLine[]) => {
    setBase((b) => f(b))
    setExtras((e) => f(e))
  }
  const save = useFirmMutation(slug, jobMutations.update(slug, job.id), [['jobs'], ['dashboard']])
  const totals = computeTotals(lines, rooms, job.discount, job.vat_rate)
  const diff = totals.total - job.totals.total
  const dup = duplicateRoomNames(rooms)
  const invalid = dup.size > 0 || lines.some((l) => !l.name.trim())

  return (
    <div className="flex flex-col gap-4">
      <Panel id="polozky" title={job.quote ? 'Položky podle nabídky' : 'Položky zakázky'}>
        <LinesEditor value={base} onChange={setBase} rooms={rooms} catalog={catalog.filter((c) => c.active)} />
      </Panel>
      <Panel
        id="navic"
        title="Práce a náklady navíc"
        actions={extras.length > 0 && <span className="text-sm font-semibold tabular-nums">{money(computeTotals(extras, rooms, 0, 0).subtotal)}</span>}
      >
        <p className="mb-3 text-xs text-muted-foreground">
          Co se dělalo nebo koupilo navíc proti nabídce (vícepráce, materiál, náklady). V upravené nabídce pro zákazníka jsou označené „navíc“.
        </p>
        <LinesEditor
          value={extras}
          onChange={(ls) => setExtras(ls.map((l) => (l.extra ? l : { ...l, extra: true })))}
          rooms={rooms}
          catalog={catalog.filter((c) => c.active)}
          hideUsual
        />
      </Panel>
      <Panel id="zamereni" title="Zaměření">
        <RoomsEditor
          value={rooms}
          onChange={(next) => {
            setLines((ls) => syncLinesWithRooms(ls, rooms, next))
            setRooms(next)
          }}
        />
      </Panel>
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
        <div className="mr-auto text-sm">
          <span className="text-muted-foreground">Celkem </span>
          <span className="font-semibold tabular-nums">{money(totals.total)}</span>
          {diff !== 0 && (
            <span className={cn('ml-2 text-xs tabular-nums', diff > 0 ? 'text-success' : 'text-destructive')}>
              ({diff > 0 ? '+' : '−'}
              {money(Math.abs(diff))} proti uloženému)
            </span>
          )}
          {dup.size > 0 && <p className="text-xs text-destructive">Názvy místností se nesmí opakovat.</p>}
        </div>
        <Button variant="outline" onClick={onDone} disabled={save.isPending}>
          Zrušit
        </Button>
        <Button
          disabled={save.isPending || invalid}
          onClick={() =>
            save.mutate(jobToInput(job, { rooms: roomsToInput(rooms), lines: lines.map(lineToInput) }), {
              onSuccess: () => {
                toast.success('Položky uloženy')
                onDone()
              },
            })
          }
        >
          Uložit položky
        </Button>
      </div>
    </div>
  )
}
