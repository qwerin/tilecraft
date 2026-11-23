import { CarIcon, HammerIcon, PackagePlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { jobMutations, type Job } from '@/api/jobs'
import { useFirmMutation } from '@/api/queries'
import { FormRow } from '@/components/common'
import { NumberInput, Select } from '@/components/doc-editor'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { lineAmount, round2 } from '@/lib/calc'
import { fromMinor, money, toMinor, unitLabels, units } from '@/lib/format'
import { cn } from '@/lib/utils'
import { travelLine } from './stages'

// Práce a náklady navíc a cestovné na zakázce (SPEC §6.1). Práci navíc zapisuje i parťák — bez ceny, nacení kancelář.

type ExtraKind = 'work' | 'material'

/** Tlačítka „+ Práce navíc“, „+ Náklad navíc“ a (kancelář) „Cestovné“ s jejich dialogy. */
export function JobExtrasActions({ slug, job, isManager }: { slug: string; job: Job; isManager: boolean }) {
  const [extra, setExtra] = useState<ExtraKind | null>(null)
  const [travel, setTravel] = useState(false)
  if (job.state === 'invoiced' || job.state === 'cancelled') return null
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setExtra('work')}>
        <HammerIcon /> Práce navíc
      </Button>
      <Button variant="outline" size="sm" onClick={() => setExtra('material')}>
        <PackagePlusIcon /> Materiál / náklad navíc
      </Button>
      {isManager && (
        <Button variant="outline" size="sm" onClick={() => setTravel(true)}>
          <CarIcon /> Cestovné{travelLine(job) ? `: ${money(travelLine(job)!.amount)}` : ''}
        </Button>
      )}
      <Dialog open={extra !== null} onOpenChange={(o) => !o && setExtra(null)}>
        <DialogContent className="sm:max-w-md">
          {extra && <ExtraForm key={extra} slug={slug} job={job} kind={extra} isManager={isManager} onDone={() => setExtra(null)} />}
        </DialogContent>
      </Dialog>
      {isManager && <TravelDialog slug={slug} job={job} open={travel} onOpenChange={setTravel} />}
    </>
  )
}

/** Dialog cestovného (kancelář): km × počet cest, nebo paušál; vytvoří / přepíše řádek „Cestovné“. */
export function TravelDialog({ slug, job, open, onOpenChange }: { slug: string; job: Job; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && <TravelForm slug={slug} job={job} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function ExtraForm({ slug, job, kind, isManager, onDone }: { slug: string; job: Job; kind: ExtraKind; isManager: boolean; onDone: () => void }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState<number | null>(1)
  const [unit, setUnit] = useState(kind === 'work' ? 'hod' : 'ks')
  const [price, setPrice] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const add = useFirmMutation(slug, jobMutations.addExtra(slug, job.id), [['jobs'], ['dashboard']])
  const amount = price != null && quantity != null ? lineAmount(quantity, price, 0, false) : null
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim() || quantity == null) return
        add.mutate(
          { section: kind, name: name.trim(), unit, quantity, unit_price: isManager && price != null ? price : undefined, note: note.trim() || undefined },
          {
            onSuccess: () => {
              toast.success(kind === 'work' ? 'Práce navíc zapsána' : 'Náklad navíc zapsán')
              onDone()
            },
          },
        )
      }}
    >
      <DialogHeader>
        <DialogTitle>{kind === 'work' ? 'Práce navíc' : 'Materiál / náklad navíc'}</DialogTitle>
        <DialogDescription>
          {isManager
            ? 'Přidá se do položek zakázky jako „navíc“ a promítne se do upravené nabídky i faktury.'
            : 'Zapíše se do zakázky jako „navíc“. Cenu doplní kancelář.'}
        </DialogDescription>
      </DialogHeader>
      <FormRow label={kind === 'work' ? 'Co se dělalo' : 'Co se koupilo / navíc'} htmlFor="extra-name">
        <Input
          id="extra-name"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'work' ? 'Např. vyrovnání podlahy, oprava omítky' : 'Např. lepidlo navíc, odvoz suti'}
        />
      </FormRow>
      <div className="grid grid-cols-2 gap-3">
        <FormRow label="Množství" htmlFor="extra-qty">
          <NumberInput id="extra-qty" value={quantity} onChange={setQuantity} />
        </FormRow>
        <FormRow label="Jednotka" htmlFor="extra-unit">
          <Select id="extra-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {units.map((u) => (
              <option key={u} value={u}>
                {unitLabels[u]}
              </option>
            ))}
          </Select>
        </FormRow>
      </div>
      {isManager && (
        <FormRow label="Cena za jednotku" htmlFor="extra-price" hint={amount != null ? `Částka ${money(amount)}` : 'Bez ceny = k nacenění později.'}>
          <NumberInput id="extra-price" value={price} onChange={setPrice} parse={toMinor} format={fromMinor} suffix="Kč" />
        </FormRow>
      )}
      <FormRow label="Poznámka" htmlFor="extra-note">
        <Input id="extra-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Proč, kde (nepovinné)" />
      </FormRow>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Zrušit
        </Button>
        <Button type="submit" disabled={add.isPending || !name.trim() || quantity == null}>
          Zapsat
        </Button>
      </DialogFooter>
    </form>
  )
}

function TravelForm({ slug, job, onDone }: { slug: string; job: Job; onDone: () => void }) {
  const cur = travelLine(job)
  const [mode, setMode] = useState<'km' | 'lump'>(cur && cur.unit !== 'km' ? 'lump' : 'km')
  const [km, setKm] = useState<number | null>(null)
  const [trips, setTrips] = useState<number | null>(1)
  const [perKm, setPerKm] = useState<number | null>(cur?.unit === 'km' && cur.unit_price > 0 ? cur.unit_price : null)
  const [lump, setLump] = useState<number | null>(cur && cur.unit !== 'km' ? cur.unit_price : null)
  const save = useFirmMutation(slug, jobMutations.setTravel(slug, job.id), [['jobs'], ['dashboard']])
  const total = mode === 'km' ? (km && perKm ? lineAmount(round2(km * (trips || 1)), perKm, 0, false) : null) : lump
  const ok = mode === 'km' ? !!km && km > 0 : lump != null
  const done = (msg: string) => ({
    onSuccess: () => {
      toast.success(msg)
      onDone()
    },
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!ok) return
        save.mutate(
          mode === 'km' ? { km: km ?? 0, trips: trips || 1, per_km: perKm ?? undefined } : { lump_sum: lump ?? 0, trips: trips && trips > 1 ? trips : undefined },
          done('Cestovné uloženo'),
        )
      }}
    >
      <DialogHeader>
        <DialogTitle>Cestovné</DialogTitle>
        <DialogDescription>
          {cur ? `Teď: ${cur.name} ${money(cur.amount)}${cur.note ? ` (${cur.note})` : ''}. Uložením se řádek přepíše.` : 'Přidá řádek „Cestovné“ do sekce Ostatní.'}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(
          [
            ['km', 'Podle km'],
            ['lump', 'Paušál'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn('rounded-md px-3 py-1.5 font-medium', mode === m ? 'bg-card shadow-xs' : 'text-muted-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'km' ? (
        <div className="grid grid-cols-3 gap-3">
          <FormRow label="Km za cestu" htmlFor="tr-km" hint="tam i zpět">
            <NumberInput id="tr-km" value={km} onChange={setKm} suffix="km" autoFocus />
          </FormRow>
          <FormRow label="Počet cest" htmlFor="tr-trips">
            <NumberInput id="tr-trips" value={trips} onChange={(v) => setTrips(v == null ? null : Math.max(1, Math.round(v)))} />
          </FormRow>
          <FormRow label="Cena za km" htmlFor="tr-per" hint={perKm == null ? 'z ceníku' : undefined}>
            <NumberInput id="tr-per" value={perKm} onChange={setPerKm} parse={toMinor} format={fromMinor} suffix="Kč" />
          </FormRow>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <FormRow label="Částka" htmlFor="tr-lump">
            <NumberInput id="tr-lump" value={lump} onChange={setLump} parse={toMinor} format={fromMinor} suffix="Kč" autoFocus />
          </FormRow>
          <FormRow label="Počet cest" htmlFor="tr-trips2" hint="jen do poznámky">
            <NumberInput id="tr-trips2" value={trips} onChange={(v) => setTrips(v == null ? null : Math.max(1, Math.round(v)))} />
          </FormRow>
        </div>
      )}
      {total != null && (
        <p className="text-sm">
          Cestovné celkem <span className="font-semibold tabular-nums">{money(total)}</span>
          {mode === 'km' && km ? <span className="text-muted-foreground"> ({trips || 1} × {String(km).replace('.', ',')} km)</span> : null}
        </p>
      )}
      <DialogFooter>
        {cur && (
          <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" disabled={save.isPending} onClick={() => save.mutate({ remove: true }, done('Cestovné odebráno'))}>
            Odebrat
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Zrušit
        </Button>
        <Button type="submit" disabled={save.isPending || !ok}>
          Uložit
        </Button>
      </DialogFooter>
    </form>
  )
}
