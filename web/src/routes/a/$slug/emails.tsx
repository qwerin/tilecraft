import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { SendIcon } from 'lucide-react'
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import { meQuery, useFirmMutation } from '@/api/queries'
import { emailMutations, useEmailDelivery, useEmails, type Email, type EmailDelivery } from '@/api/emails'
import { DataTable, EmptyRow, FormRow, PageHeader, Pager } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFirm } from '@/hooks/use-firm'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/a/$slug/emails')({
  component: EmailsPage,
})

const statusLabels: Record<Email['status'], string> = { stored: 'Jen uloženo', sent: 'Odesláno', failed: 'Neodesláno' }
const statusStyles: Record<Email['status'], string> = {
  stored: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300',
  sent: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
}

function deliveryText(d: EmailDelivery | undefined) {
  if (!d) return undefined
  if (d.test) return 'Testovací instance: e-maily se nikam neodesílají, jen se uloží sem.'
  if (!d.live) return 'Odesílání e-mailů je na serveru vypnuté: e-maily se nikam neodesílají, jen se uloží sem.'
  return `E-maily, které firma z aplikace poslala zákazníkům. Odesílatel: ${d.sender}.`
}

// E-maily, které firma poslala (nabídky, faktury, zkušební); bez ostrého odesílání se jen ukládají sem.
function EmailsPage() {
  const { slug } = useFirm()
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<number | null>(null)
  const [testing, setTesting] = useState(false)
  const { data } = useEmails(slug, page)
  const delivery = useEmailDelivery(slug).data

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="E-maily"
        description={deliveryText(delivery)}
        actions={
          <Button variant="outline" onClick={() => setTesting(true)}>
            <SendIcon /> Zkušební e-mail
          </Button>
        }
      />
      {testing && <TestEmailDialog live={delivery?.live ?? false} onClose={() => setTesting(false)} />}
      <DataTable>
        <thead>
          <tr>
            <th className="w-40">Čas</th>
            <th>Komu</th>
            <th>Předmět</th>
            <th className="w-28">Doklad</th>
            <th className="w-28">Stav</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.length === 0 && <EmptyRow cols={5}>Zatím žádné e-maily.</EmptyRow>}
          {data?.items.map((e) => (
            <Fragment key={e.id}>
              <tr className="cursor-pointer hover:bg-muted/50" onClick={() => setOpen(open === e.id ? null : e.id)}>
                <td className="tabular-nums">{fmtDateTime(e.created_at)}</td>
                <td>{e.to}</td>
                <td className="font-medium">{e.subject}</td>
                <td onClick={(ev) => ev.stopPropagation()} className="whitespace-nowrap text-muted-foreground">
                  <DocLink slug={slug} e={e} />
                </td>
                <td>
                  <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-medium', statusStyles[e.status])} title={e.error || undefined}>
                    {statusLabels[e.status]}
                  </span>
                </td>
              </tr>
              {open === e.id && (
                <tr>
                  <td colSpan={5} className="bg-muted/30">
                    {e.reply_to && <p className="mb-2 text-xs text-muted-foreground">Odpověď na: {e.reply_to}</p>}
                    {e.error && <p className="mb-2 text-xs text-destructive">{e.error}</p>}
                    {e.files && <p className="mb-2 text-xs text-muted-foreground">Příloha: {e.files}</p>}
                    <pre className="font-sans text-sm whitespace-pre-wrap">{e.body}</pre>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </DataTable>
      {data && <Pager page={page} perPage={data.per_page} total={data.total} onPage={setPage} />}
    </div>
  )
}

/** Odkaz na nabídku nebo fakturu, které se e-mail týká. */
function DocLink({ slug, e }: { slug: string; e: Email }) {
  const cls = 'font-medium text-primary hover:underline'
  if (e.invoice_id)
    return (
      <Link to="/a/$slug/invoices/$id" params={{ slug, id: String(e.invoice_id) }} className={cls}>
        {e.invoice_number || 'Faktura'}
      </Link>
    )
  if (e.quote_id)
    return (
      <Link to="/a/$slug/quotes/$id" params={{ slug, id: String(e.quote_id) }} className={cls}>
        {e.quote_number || 'Nabídka'}
      </Link>
    )
  return e.invoice_number || e.quote_number || null
}

// Zkušební e-mail: ověří, že odesílání funguje (výchozí adresa = přihlášený uživatel).
function TestEmailDialog({ live, onClose }: { live: boolean; onClose: () => void }) {
  const { slug } = useFirm()
  const qc = useQueryClient()
  const me = useQuery(meQuery).data
  const [email, setEmail] = useState<string | null>(null)
  const send = useFirmMutation(slug, emailMutations.test(slug), [['emails']])
  const to = (email ?? me?.email ?? '').trim()
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(ev) => {
            ev.preventDefault()
            send.mutate(to, {
              onSuccess: (e) => {
                toast.success(e.status === 'sent' ? `Zkušební e-mail odeslán na ${e.to}` : 'Zkušební e-mail uložen (odesílání je vypnuté)')
                onClose()
              },
              // neodeslaný e-mail se uloží i s důvodem — ukážeme ho v seznamu
              onError: () => qc.invalidateQueries({ queryKey: [slug, 'emails'] }),
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>Zkušební e-mail</DialogTitle>
            <DialogDescription>
              {live
                ? 'Pošle krátký zkušební e-mail, abyste ověřili, že odesílání funguje. Když se nepodaří, důvod uvidíte v seznamu.'
                : 'Odesílání e-mailů je vypnuté: zkušební e-mail se neodešle, jen se uloží do seznamu.'}
            </DialogDescription>
          </DialogHeader>
          <FormRow label="Komu" htmlFor="test-email">
            <Input id="test-email" type="email" value={email ?? me?.email ?? ''} onChange={(e) => setEmail(e.target.value)} />
          </FormRow>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" disabled={!to || send.isPending}>
              Odeslat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
