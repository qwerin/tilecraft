import { useQuery } from '@tanstack/react-query'
import { NotebookPenIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { jobMutations, type Job } from '@/api/jobs'
import { meQuery, useFirmMutation } from '@/api/queries'
import { Confirm, Panel } from '@/components/common'
import { DateInput } from '@/components/date-input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { fmtDate, fmtWeekday, today } from '@/lib/format'

/** Deník zakázky: krátké poznámky s datem (co se udělalo, co chybí) — píšou i parťáci. */
export function JobDiary({ slug, job, isManager }: { slug: string; job: Job; isManager: boolean }) {
  const me = useQuery(meQuery).data
  const [on, setOn] = useState(today)
  const [text, setText] = useState('')
  const add = useFirmMutation(slug, jobMutations.addNote(slug, job.id), [['jobs']])
  const del = useFirmMutation(slug, jobMutations.deleteNote(slug), [['jobs']])

  // poznámky jsou od API seřazené od nejnovějšího dne; seskupit po dnech
  const days: { on: string; notes: Job['notes'] }[] = []
  for (const n of job.notes) {
    const last = days[days.length - 1]
    if (last?.on === n.on) last.notes.push(n)
    else days.push({ on: n.on, notes: [n] })
  }

  return (
    <Panel id="denik" title="Deník">
      <form
        className="mb-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          add.mutate(
            { on: on || undefined, text: text.trim() },
            {
              onSuccess: () => {
                setText('')
                setOn(today())
                toast.success('Zapsáno do deníku')
              },
            },
          )
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Co se dnes udělalo, co chybí, co dovézt…"
          rows={2}
          aria-label="Zápis do deníku"
        />
        <div className="flex items-center gap-2">
          <DateInput value={on} onChange={setOn} className="w-40" />
          <Button type="submit" className="ml-auto" disabled={!text.trim() || add.isPending}>
            <NotebookPenIcon /> Zapsat
          </Button>
        </div>
      </form>
      {days.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Deník je zatím prázdný.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {days.map((d) => (
            <li key={d.on}>
              <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">
                <span className="capitalize">{fmtWeekday(d.on)}</span> {fmtDate(d.on)}
              </h3>
              <ul className="flex flex-col gap-2 border-l-2 border-primary/30 pl-3">
                {d.notes.map((n) => (
                  <li key={n.id} className="group flex items-start gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap">{n.text}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.author}</p>
                    </div>
                    {(isManager || n.user_id === me?.id) && (
                      <Confirm
                        title="Smazat zápis z deníku?"
                        onConfirm={() => del.mutateAsync(n.id)}
                        trigger={(open) => (
                          <Button variant="ghost" size="icon-sm" aria-label="Smazat zápis" className="text-muted-foreground md:opacity-0 md:group-hover:opacity-100" onClick={open}>
                            <Trash2Icon />
                          </Button>
                        )}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
