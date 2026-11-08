import { useState } from 'react'
import { toast } from 'sonner'
import { jobMutations, jobToInput, type Job } from '@/api/jobs'
import { useFirmMutation, useMembers } from '@/api/queries'
import { FormRow } from '@/components/common'
import { DateInput } from '@/components/date-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CrewPicker } from './crew'

/**
 * Úprava zakázky (vlastník/kancelář): název, termín, parta, adresa stavby, kontakt na místě, poznámka.
 * PUT /jobs/{id} nahrazuje celou zakázku → řádky a zaměření se posílají beze změny z načtené zakázky.
 */
export function JobEditDialog({ slug, job, open, onOpenChange }: { slug: string; job: Job; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">{open && <JobEditForm key={job.id} slug={slug} job={job} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function JobEditForm({ slug, job, onDone }: { slug: string; job: Job; onDone: () => void }) {
  const members = useMembers(slug).data ?? []
  const [f, setF] = useState({
    title: job.title,
    start_on: job.start_on,
    end_on: job.end_on,
    site_address: job.site_address,
    site_contact: job.site_contact,
    note: job.note,
    worker_ids: job.worker_ids,
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }))
  const save = useFirmMutation(slug, jobMutations.update(slug, job.id), [['jobs'], ['dashboard']])
  const badRange = !!f.start_on && !!f.end_on && f.end_on < f.start_on

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (badRange) return
        save.mutate(jobToInput(job, { ...f, title: f.title.trim() }), {
          onSuccess: () => {
            toast.success('Zakázka uložena')
            onDone()
          },
        })
      }}
    >
      <DialogHeader>
        <DialogTitle>Upravit zakázku {job.number}</DialogTitle>
        <DialogDescription>Termín, parta a údaje ke stavbě. Položky se upravují zvlášť.</DialogDescription>
      </DialogHeader>
      <FormRow label="Název" htmlFor="job-title">
        <Input id="job-title" required value={f.title} onChange={(e) => set('title', e.target.value)} />
      </FormRow>
      <div className="grid grid-cols-2 gap-3">
        <FormRow label="Začátek">
          <DateInput value={f.start_on} onChange={(v) => set('start_on', v)} />
        </FormRow>
        <FormRow label="Konec">
          <DateInput value={f.end_on} onChange={(v) => set('end_on', v)} min={f.start_on || undefined} />
        </FormRow>
      </div>
      {badRange && <p className="-mt-2 text-xs text-destructive">Konec nesmí být před začátkem.</p>}
      <FormRow label="Parta">
        <CrewPicker members={members} value={f.worker_ids} onChange={(v) => set('worker_ids', v)} />
      </FormRow>
      <FormRow label="Adresa stavby" htmlFor="job-site">
        <Input id="job-site" value={f.site_address} onChange={(e) => set('site_address', e.target.value)} placeholder="Ulice, obec" />
      </FormRow>
      <FormRow label="Kontakt na místě" htmlFor="job-contact" hint="Kdo otevře, telefon, klíče u souseda…">
        <Input id="job-contact" value={f.site_contact} onChange={(e) => set('site_contact', e.target.value)} />
      </FormRow>
      <FormRow label="Poznámka" htmlFor="job-note">
        <Textarea id="job-note" value={f.note} onChange={(e) => set('note', e.target.value)} rows={3} />
      </FormRow>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Zrušit
        </Button>
        <Button type="submit" disabled={save.isPending || badRange || !f.title.trim()}>
          Uložit
        </Button>
      </DialogFooter>
    </form>
  )
}
