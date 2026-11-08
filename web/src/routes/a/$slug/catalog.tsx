import { createFileRoute } from '@tanstack/react-router'
import { PlusIcon, RulerIcon, SearchIcon, TagsIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { catalogInputOf, catalogMutations, useCatalog, type CatalogInput, type CatalogItem } from '@/api/catalog'
import { useFirmMutation } from '@/api/queries'
import { DataTable, EmptyState, FormRow, PageHeader, StatusBadge } from '@/components/common'
import { measureLabels, NumberInput, Select, sectionLabels, sections, type Measure, type Section } from '@/components/doc-editor'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useFirm } from '@/hooks/use-firm'
import { fromMinor, money, num, toMinor, unitLabel, units } from '@/lib/format'
import { cn } from '@/lib/utils'

// Ceník (SPEC §4): položky práce, materiálu a ostatního, ze kterých se skládá nabídka.
export const Route = createFileRoute('/a/$slug/catalog')({ component: CatalogPage })

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const measureText = (m: string | undefined) => (m ? measureLabels[m as Exclude<Measure, ''>] ?? m : '')

function CatalogPage() {
  const { slug, account } = useFirm()
  const [q, setQ] = useState('')
  const [inactive, setInactive] = useState(false)
  const [editing, setEditing] = useState<CatalogItem | Section | null>(null)
  const { data } = useCatalog(slug, true)
  const all = data ?? []
  const items = all.filter((c) => (inactive || c.active) && (!q || fold(`${c.code ?? ''} ${c.name}`).includes(fold(q))))
  const hiddenCount = all.filter((c) => !c.active).length
  const vat = account.settings.vat_payer

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Ceník"
        description={`Ceny za jednotku${vat ? ' bez DPH' : ''}. Položky se zdrojem „ze zaměření“ dostanou v nabídce množství spočítané z místností.`}
        actions={
          <Button onClick={() => setEditing('work')}>
            <PlusIcon /> Nová položka
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat v ceníku…" className="pl-8" />
          </div>
          {hiddenCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={inactive} onCheckedChange={setInactive} /> Vyřazené ({hiddenCount})
            </label>
          )}
        </div>
      </PageHeader>

      {data && all.length === 0 ? (
        <EmptyState
          icon={TagsIcon}
          title="Ceník je prázdný"
          description="Přidejte práce a materiál, které běžně účtujete."
          action={
            <Button onClick={() => setEditing('work')}>
              <PlusIcon /> Nová položka
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((sec) => {
            const list = items.filter((c) => c.kind === sec)
            if (q && list.length === 0) return null
            return (
              <section key={sec}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="font-heading text-lg font-semibold">
                    {sectionLabels[sec]} <span className="text-sm font-normal text-muted-foreground">{list.length}</span>
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(sec)}>
                    <PlusIcon /> Přidat
                  </Button>
                </div>
                {/* telefon: karty */}
                <div className="flex flex-col gap-2 md:hidden">
                  {list.length === 0 && <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">Žádné položky.</p>}
                  {list.map((c) => (
                    <button key={c.id} type="button" onClick={() => setEditing(c)} className={cn('rounded-xl border bg-card p-3 text-left text-sm shadow-xs active:bg-muted', !c.active && 'opacity-60')}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{c.name}</span>
                        <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
                          {money(c.price)} / {unitLabel(c.unit)}
                        </span>
                      </div>
                      <Meta c={c} />
                    </button>
                  ))}
                </div>
                <DataTable className="max-md:hidden">
                  <thead>
                    <tr>
                      <th>Položka</th>
                      <th className="w-16">Jedn.</th>
                      <th className="w-28 text-right!">Cena</th>
                      <th className="w-28 text-right!">Nákup</th>
                      <th className="w-20 text-right!">Sleva</th>
                      <th className="w-40">Množství</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-muted-foreground">
                          Žádné položky.
                        </td>
                      </tr>
                    )}
                    {list.map((c) => (
                      <tr key={c.id} className={cn('cursor-pointer', !c.active && 'opacity-60')} onClick={() => setEditing(c)}>
                        <td>
                          <span className="font-medium">{c.name}</span>
                          {c.code && <span className="ml-2 font-mono text-xs text-muted-foreground">{c.code}</span>}
                          {!c.active && (
                            <StatusBadge className="ml-2" tone="outline">
                              vyřazeno
                            </StatusBadge>
                          )}
                        </td>
                        <td>{unitLabel(c.unit)}</td>
                        <td className="text-right font-semibold tabular-nums">{money(c.price)}</td>
                        <td className="text-right text-muted-foreground tabular-nums">{c.purchase_price ? money(c.purchase_price) : ''}</td>
                        <td className="text-right tabular-nums">{c.discount ? `${num(c.discount)} %` : ''}</td>
                        <td className="text-xs">
                          {c.measure ? (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <RulerIcon className="size-3" /> {measureText(c.measure)}
                              {c.waste ? ` + ${num(c.waste)} %` : ''}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">ručně</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </section>
            )
          })}
        </div>
      )}
      {editing !== null && (
        <CatalogDialog slug={slug} item={typeof editing === 'string' ? undefined : editing} kind={typeof editing === 'string' ? editing : editing.kind} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function Meta({ c }: { c: CatalogItem }) {
  const parts = [
    c.code,
    c.discount ? `sleva ${num(c.discount)} %` : '',
    c.measure ? `ze zaměření: ${measureText(c.measure)}${c.waste ? ` + ${num(c.waste)} %` : ''}` : '',
    !c.active ? 'vyřazeno' : '',
  ].filter(Boolean)
  return parts.length > 0 ? <p className="mt-0.5 text-xs text-muted-foreground">{parts.join(' · ')}</p> : null
}

function CatalogDialog({ slug, item, kind, onClose }: { slug: string; item?: CatalogItem; kind: Section; onClose: () => void }) {
  const [v, setV] = useState<CatalogInput>(() =>
    item ? catalogInputOf(item) : { kind, name: '', code: '', unit: kind === 'work' ? 'm2' : kind === 'material' ? 'ks' : 'kpl', price: 0, purchase_price: 0, discount: 0, measure: '', waste: 0, note: '', active: true },
  )
  const create = useFirmMutation(slug, catalogMutations.create(slug), [['catalog']])
  const update = useFirmMutation(slug, catalogMutations.update(slug), [['catalog']])
  const remove = useFirmMutation(slug, catalogMutations.remove(slug), [['catalog']])
  const set = <K extends keyof CatalogInput>(k: K, val: CatalogInput[K]) => setV((x) => ({ ...x, [k]: val }))
  const pending = create.isPending || update.isPending || remove.isPending
  const margin = v.purchase_price && v.price ? Math.round(((v.price * (1 - (v.discount ?? 0) / 100) - v.purchase_price) / v.price) * 100) : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const body = { ...v, name: v.name.trim(), code: v.code?.trim() }
            const done = () => {
              toast.success(item ? 'Položka uložena' : 'Položka přidána')
              onClose()
            }
            if (item) update.mutate({ id: item.id, body }, { onSuccess: done })
            else create.mutate(body, { onSuccess: done })
          }}
        >
          <DialogHeader>
            <DialogTitle>{item ? 'Upravit položku ceníku' : 'Nová položka ceníku'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-3">
            <FormRow label="Druh" htmlFor="cat-kind" className="col-span-3">
              <Select id="cat-kind" value={v.kind} onChange={(e) => set('kind', e.target.value as Section)}>
                {sections.map((s) => (
                  <option key={s} value={s}>
                    {sectionLabels[s]}
                  </option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="Kód (nepovinné)" htmlFor="cat-code" className="col-span-3">
              <Input id="cat-code" value={v.code ?? ''} onChange={(e) => set('code', e.target.value)} />
            </FormRow>
            <FormRow label="Název" htmlFor="cat-name" className="col-span-6">
              <Input id="cat-name" value={v.name} onChange={(e) => set('name', e.target.value)} required autoFocus={!item} placeholder="Montáž obkladu, spárování, silikon" />
            </FormRow>
            <FormRow label="Jednotka" htmlFor="cat-unit" className="col-span-2">
              <Select id="cat-unit" value={v.unit} onChange={(e) => set('unit', e.target.value as CatalogInput['unit'])}>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="Prodejní cena" htmlFor="cat-price" className="col-span-4">
              <NumberInput id="cat-price" value={v.price} onChange={(x) => set('price', x ?? 0)} parse={toMinor} format={(n) => fromMinor(n ?? 0)} suffix={`Kč/${unitLabel(v.unit)}`} inputClassName="pr-14" />
            </FormRow>
            <FormRow label="Nákupní cena" htmlFor="cat-purchase" className="col-span-3" hint={margin != null ? `Marže ${margin} %` : 'Pro přehled marže, zákazník ji nevidí.'}>
              <NumberInput id="cat-purchase" value={v.purchase_price || null} onChange={(x) => set('purchase_price', x ?? 0)} parse={toMinor} format={(n) => (n ? fromMinor(n) : '')} suffix="Kč" />
            </FormRow>
            <FormRow label="Sleva" htmlFor="cat-discount" className="col-span-3" hint="Výchozí sleva řádku (např. sleva dodavatele).">
              <NumberInput id="cat-discount" value={v.discount || null} onChange={(x) => set('discount', Math.min(100, Math.max(0, x ?? 0)))} suffix="%" placeholder="0" />
            </FormRow>
            <FormRow label="Množství v nabídce" htmlFor="cat-measure" className="col-span-4" hint="Ze zaměření se množství spočítá samo a přepočítá při každé změně místností.">
              <Select id="cat-measure" value={v.measure ?? ''} onChange={(e) => set('measure', e.target.value as CatalogInput['measure'])}>
                <option value="">Zadává se ručně</option>
                {(Object.keys(measureLabels) as Exclude<Measure, ''>[]).map((m) => (
                  <option key={m} value={m}>
                    Ze zaměření: {measureLabels[m]}
                  </option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="Prořez" htmlFor="cat-waste" className="col-span-2">
              <NumberInput id="cat-waste" value={v.waste || null} onChange={(x) => set('waste', Math.min(100, Math.max(0, x ?? 0)))} suffix="%" placeholder="0" disabled={!v.measure} />
            </FormRow>
            <FormRow label="Poznámka" htmlFor="cat-note" className="col-span-6">
              <Textarea id="cat-note" value={v.note ?? ''} onChange={(e) => set('note', e.target.value)} rows={2} />
            </FormRow>
            <label className="col-span-6 flex items-center gap-2 text-sm">
              <Switch checked={v.active} onCheckedChange={(x) => set('active', x)} /> Aktivní (nabízí se v nabídkách)
            </label>
          </div>
          <DialogFooter className="items-center">
            {item && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive"
                disabled={pending}
                onClick={() =>
                  remove.mutate(item.id, {
                    onSuccess: () => {
                      toast.success('Položka smazána (použitá položka je jen vyřazená)')
                      onClose()
                    },
                  })
                }
              >
                <Trash2Icon /> Smazat
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" disabled={!v.name.trim() || pending}>
              {item ? 'Uložit' : 'Přidat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
