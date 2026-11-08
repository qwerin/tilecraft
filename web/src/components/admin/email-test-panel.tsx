import { useMutation } from '@tanstack/react-query'
import { AlertTriangleIcon, CheckCircle2Icon, ChevronDownIcon, InfoIcon, MailCheckIcon, SendIcon, XCircleIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { api, unwrap } from '@/api/client'
import { errorMessage } from '@/api/errors'
import type { components } from '@/api/schema.gen'
import { FormRow, Panel } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDuration, groupChecks, reportSummary, statusLabels, type DiagStatus } from '@/lib/mail-diag'
import { cn } from '@/lib/utils'

type Report = components['schemas']['DiagReport']
type Check = components['schemas']['DiagCheck']

const icons: Record<DiagStatus, { icon: typeof InfoIcon; className: string }> = {
  ok: { icon: CheckCircle2Icon, className: 'text-emerald-600 dark:text-emerald-400' },
  info: { icon: InfoIcon, className: 'text-sky-600 dark:text-sky-400' },
  warning: { icon: AlertTriangleIcon, className: 'text-amber-600 dark:text-amber-400' },
  error: { icon: XCircleIcon, className: 'text-destructive' },
}

function StatusIcon({ status, className }: { status: DiagStatus; className?: string }) {
  const { icon: Icon, className: color } = icons[status]
  return <Icon className={cn('size-4 shrink-0', color, className)} aria-label={statusLabels[status]} />
}

/** Test e-mailu: projde SMTP krok po kroku, zkontroluje DNS domény odesílatele a pošle skutečný e-mail. */
export function EmailTestPanel({ defaultTo }: { defaultTo: string }) {
  const test = useMutation({
    mutationFn: (body: { to?: string; dkim_selector?: string }) => unwrap(api.POST('/api/admin/email-test', { body })),
  })
  const [to, setTo] = useState(defaultTo)
  const [selector, setSelector] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    test.mutate({ to: to.trim() || undefined, dkim_selector: selector.trim() || undefined })
  }
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Test e-mailu">
        <p className="-mt-1 mb-4 text-xs text-muted-foreground">
          Projde spojení se SMTP serverem krok po kroku, zkontroluje DNS záznamy domény odesílatele (SPF, DKIM, DMARC, MX) a pošle skutečný
          e-mail — i když je ostré odesílání (TILECRAFT_EMAIL_LIVE) vypnuté. Trvá to obvykle pár sekund.
        </p>
        <form onSubmit={submit} noValidate className="grid gap-4 md:grid-cols-2">
          <FormRow label="Příjemce" htmlFor="et-to" hint="Pro kontrolu podpisů pošlete test na Gmail — umí zobrazit výsledek SPF/DKIM/DMARC.">
            <Input id="et-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormRow>
          <FormRow label="Selektor DKIM (nepovinné)" htmlFor="et-sel" hint="Když e-maily podepisuje poskytovatel SMTP (např. Google), zadejte jeho selektor a ověříme jeho DNS záznam.">
            <Input id="et-sel" value={selector} placeholder="např. google, selector1" spellCheck={false} onChange={(e) => setSelector(e.target.value)} />
          </FormRow>
          <div className="md:col-span-2">
            <Button type="submit" disabled={test.isPending}>
              <SendIcon /> {test.isPending ? 'Testuji…' : 'Spustit test'}
            </Button>
            {test.isError && <p className="mt-2 text-sm text-destructive">{errorMessage(test.error)}</p>}
          </div>
        </form>
      </Panel>
      {test.data && <EmailTestResult report={test.data} />}
    </div>
  )
}

function EmailTestResult({ report }: { report: Report }) {
  const groups = groupChecks(report)
  return (
    <section aria-label="Výsledek testu" className="flex flex-col gap-3">
      <div className={cn('flex gap-3 rounded-xl border p-4', report.sent ? 'bg-card' : 'border-destructive/40 bg-destructive/5')}>
        {report.sent ? <MailCheckIcon className="size-5 shrink-0 text-emerald-600" /> : <StatusIcon status="error" className="size-5" />}
        <div className="text-sm">
          <div className="font-medium">{report.sent ? 'E-mail odeslán' : 'E-mail se nepodařilo odeslat'}</div>
          <p className="mt-0.5">{reportSummary(report)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {report.from} → {report.to}
            {report.smtp_host && ` · ${report.smtp_host}:${report.smtp_port} (${report.tls_mode})`}
            {report.queue_id && ` · ID ve frontě ${report.queue_id}`}
            {` · ${formatDuration(report.duration_ms)}`}
            {report.dkim_signed && ' · podepsáno DKIM'}
          </p>
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.id} className="rounded-xl border bg-card shadow-xs">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <StatusIcon status={g.status} />
            <h3 className="flex-1 text-sm font-semibold">{g.label}</h3>
            <span className="text-xs text-muted-foreground">{statusLabels[g.status]}</span>
          </div>
          <ul className="divide-y">
            {g.checks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}

function CheckRow({ check }: { check: Check }) {
  const details = check.details ?? []
  const body = (
    <>
      <StatusIcon status={check.status} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 text-sm font-medium">{check.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDuration(check.duration_ms)}</span>
        </div>
        <p className="mt-0.5 text-sm break-words text-muted-foreground">{check.message}</p>
        {check.hint && (
          <p className={cn('mt-1.5 rounded-md px-2.5 py-1.5 text-sm break-words', check.status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted')}>
            {check.hint}
          </p>
        )}
      </div>
      {details.length > 0 && <ChevronDownIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />}
    </>
  )
  if (details.length === 0) return <li className="flex gap-3 px-4 py-3">{body}</li>
  return (
    <li>
      <details className="group [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none gap-3 px-4 py-3 hover:bg-muted/50">{body}</summary>
        <pre className="mx-4 mb-3 max-h-72 overflow-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">{details.join('\n')}</pre>
      </details>
    </li>
  )
}
