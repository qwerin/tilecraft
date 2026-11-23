// Etapy zakázky (SPEC §6): Navedení → Zhotovení → Ukončení → Faktura, odvozené ze stavu zakázky, s kontrolním seznamem.
// Parťák dostane jen body bez cen (nabídky a faktury ne).
import type { Job, JobLine, JobState } from '@/api/jobs'
import { fmtDate, money, plural } from '@/lib/format'

/** Řádek cestovného zakázky (Ostatní, „Cestovné…“) — stejně jako server. */
export function travelLine(job: Job): JobLine | undefined {
  return job.lines.find((l) => l.section === 'other' && l.name.toLowerCase().startsWith('cestovné'))
}

export type Mark = 'done' | 'todo' | 'warn' | 'skip'
export interface CheckItem {
  label: string
  mark: Mark
  href?: string
}
export interface Stage {
  key: string
  title: string
  items: CheckItem[]
}

/** Index etapy podle stavu: domluvená = Navedení, probíhá = Zhotovení, hotová = Ukončení, vyfakturovaná = Faktura. */
export const stageOf: Record<JobState, number> = { planned: 0, in_progress: 1, done: 2, invoiced: 3, cancelled: -1 }

const revisionLabels = {
  draft: 'rozpracovaná — odešlete ji zákazníkovi',
  sent: 'odeslaná, čeká na zákazníka',
  accepted: 'zákazník přijal',
  rejected: 'zákazník odmítl',
} as const

/** Zakázka se liší od nabídky (práce navíc nebo jiné množství) → zákazníkovi patří upravená nabídka. */
export const jobChanged = (job: Job) => job.extras.count > 0 || (!!job.quote && job.totals.total !== job.quote.totals.total)

export function jobStages(job: Job, isManager: boolean): Stage[] {
  const photos = job.attachments.length
  const rooms = job.rooms.length
  const cur = stageOf[job.state]
  const rev = job.revisions.at(-1)
  const finals = job.invoices.filter((i) => i.kind === 'invoice')
  const advances = job.invoices.filter((i) => i.kind === 'advance')
  const travel = travelLine(job)

  const lead: CheckItem[] = [
    { label: rooms ? `Zaměření: ${plural(rooms, 'místnost', 'místnosti', 'místností')}` : 'Zaměření', mark: rooms ? 'done' : 'todo', href: '#zamereni' },
  ]
  if (isManager) {
    lead.push(
      job.quote
        ? { label: `Nabídka ${job.quote.number} přijatá (${money(job.quote.totals.total)})`, mark: 'done' }
        : { label: 'Zakázka bez nabídky', mark: 'skip' },
    )
  }
  lead.push(
    { label: job.start_on ? `Termín od ${fmtDate(job.start_on)}` : 'Termín', mark: job.start_on ? 'done' : 'todo' },
    { label: photos ? `Fotky a soubory: ${photos}` : 'Fotky před zahájením', mark: photos ? 'done' : cur > 0 ? 'skip' : 'todo', href: '#fotky' },
  )

  const extrasLabel = job.extras.count
    ? `Práce a náklady navíc: ${plural(job.extras.count, 'položka', 'položky', 'položek')}${isManager && job.extras.amount ? ` (+${money(job.extras.amount)})` : ''}`
    : 'Práce a náklady navíc: žádné'
  const build: CheckItem[] = [
    { label: 'Práce zahájena', mark: cur >= 1 ? 'done' : 'todo' },
    { label: extrasLabel, mark: job.extras.count ? 'done' : 'skip', href: '#polozky' },
  ]
  if (isManager && job.extras.unpriced > 0) build.push({ label: `K nacenění: ${job.extras.unpriced}`, mark: 'warn', href: '#navic' })
  build.push({ label: job.notes.length ? `Deník: ${plural(job.notes.length, 'zápis', 'zápisy', 'zápisů')}` : 'Deník', mark: job.notes.length ? 'done' : 'skip', href: '#denik' })

  const finish: CheckItem[] = [{ label: job.end_on && cur >= 2 ? `Hotovo ${fmtDate(job.end_on)}` : 'Práce hotová', mark: cur >= 2 ? 'done' : 'todo' }]
  if (isManager) {
    finish.push({ label: travel ? `Cestovné ${money(travel.amount)}` : 'Cestovné', mark: travel ? 'done' : 'todo' })
    finish.push(
      rev
        ? { label: `Upravená nabídka ${rev.number}: ${revisionLabels[rev.state]}`, mark: rev.state === 'accepted' ? 'done' : rev.state === 'rejected' ? 'warn' : 'todo' }
        : jobChanged(job)
          ? { label: 'Upravená nabídka (práce navíc)', mark: 'todo' }
          : { label: 'Upravená nabídka — beze změn proti nabídce není potřeba', mark: 'skip' },
    )
  }
  finish.push({ label: 'Fotky hotové zakázky', mark: photos ? (cur >= 2 ? 'done' : 'skip') : 'todo', href: '#fotky' })

  const bill: CheckItem[] = []
  if (isManager) {
    for (const a of advances) bill.push({ label: `Záloha ${a.number}${a.paid_on ? ' zaplacená' : ' nezaplacená'}`, mark: a.paid_on ? 'done' : 'warn', href: '#faktury' })
    const f = finals.at(-1)
    bill.push(
      f
        ? { label: `Faktura ${f.number} ${f.paid_on ? 'zaplacená' : 'vystavená, čeká na úhradu'}`, mark: f.paid_on ? 'done' : 'todo', href: '#faktury' }
        : { label: 'Faktura vystavená', mark: 'todo', href: '#faktury' },
    )
  } else {
    bill.push({ label: cur >= 3 ? 'Vyfakturováno' : 'Fakturu vystaví kancelář', mark: cur >= 3 ? 'done' : 'skip' })
  }

  return [
    { key: 'lead', title: 'Navedení', items: lead },
    { key: 'build', title: 'Zhotovení', items: build },
    { key: 'finish', title: 'Ukončení', items: finish },
    { key: 'bill', title: 'Faktura', items: bill },
  ]
}

