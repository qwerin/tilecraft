// Dialogy detailu faktury: odeslání e-mailem, odkaz pro zákazníka a úhrada.
import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckIcon, CopyIcon, MessageCircleIcon, Share2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { useEmailDelivery } from '@/api/emails'
import { useFirmMutation } from '@/api/queries'
import { invoiceApi, invoiceTitle, type Invoice } from '@/api/invoices'
import { FormRow } from '@/components/common'
import { DateInput } from '@/components/date-input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { fmtDate, fmtDateTime, money, today } from '@/lib/format'

type DialogProps = { slug: string; inv: Invoice; open: boolean; onOpenChange: (o: boolean) => void }

export function InvoiceEmailDialog({ slug, inv, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">{open && <EmailForm slug={slug} inv={inv} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function EmailForm({ slug, inv, onDone }: { slug: string; inv: Invoice; onDone: () => void }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState(inv.emailed_to || inv.party.email)
  const [message, setMessage] = useState('')
  const live = useEmailDelivery(slug).data?.live
  const send = useFirmMutation(slug, invoiceApi.email(slug, inv.id), [['invoices'], ['emails']])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    send.mutate(
      { email: email.trim() || undefined, message: message.trim() || undefined },
      {
        onSuccess: () => {
          if (live === false) toast.success('E-mail uložen na stránku E-maily', { description: 'Odesílání e-mailů je vypnuté, zákazníkovi nic neodešlo.' })
          else toast.success(`Faktura odeslána na ${email.trim()}`, { description: 'Kopii najdete na stránce E-maily.' })
          onDone()
        },
        // neodeslaný e-mail se uloží i s důvodem na stránku E-maily
        onError: () => qc.invalidateQueries({ queryKey: [slug, 'emails'] }),
      },
    )
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Odeslat fakturu e-mailem</DialogTitle>
        <DialogDescription>
          Faktura {inv.number} ({money(inv.total)}) odejde jako PDF v příloze; v e-mailu bude odkaz na fakturu s QR Platbou, částka, splatnost, účet a
          variabilní symbol.
          {inv.emailed_at && ` Už odesláno ${fmtDate(inv.emailed_at)} na ${inv.emailed_to}.`}
        </DialogDescription>
      </DialogHeader>
      <FormRow label="Komu" htmlFor="inv-email" hint={!inv.party.email ? 'Zákazník nemá e-mail, zadejte adresu.' : undefined}>
        <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormRow>
      <FormRow label="Zpráva (nepovinná)" htmlFor="inv-msg" hint="Vloží se do e-mailu za úvodní větu.">
        <Textarea id="inv-msg" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Děkujeme za zakázku…" />
      </FormRow>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Zrušit
        </Button>
        <Button type="submit" disabled={send.isPending || !email.trim()}>
          Odeslat
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Text zprávy pro WhatsApp / SMS s odkazem na fakturu. */
function shareText(inv: Invoice, firm: string) {
  const what = inv.kind === 'advance' ? 'zálohovou fakturu' : 'fakturu'
  const pay = inv.paid_on || inv.total <= 0 ? '' : ` na ${money(inv.total)} se splatností ${fmtDate(inv.due_on)}`
  return `Dobrý den, posíláme ${what} ${inv.number}${pay}. Zobrazíte, stáhnete a zaplatíte ji zde: ${inv.public_url}\n${firm}`
}

/** Odkaz na fakturu pro zákazníka (/f/{token}): zkopírovat, poslat přes WhatsApp, SMS nebo sdílet. */
export function InvoiceShareDialog({ inv, firm, open, onOpenChange }: { inv: Invoice; firm: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [copied, setCopied] = useState(false)
  const text = shareText(inv, firm)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  const phone = inv.customer.phone.replace(/\s/g, '')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inv.public_url)
      setCopied(true)
      toast.success('Odkaz zkopírován')
    } catch {
      toast.error('Kopírování se nepovedlo — označte odkaz a zkopírujte ho ručně.')
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Odkaz pro zákazníka</DialogTitle>
          <DialogDescription>
            Na odkazu zákazník uvidí {invoiceTitle(inv).toLowerCase()} {inv.number}, stav úhrady, QR Platbu a stáhne si PDF. Nic jiného z firmy neuvidí.
          </DialogDescription>
        </DialogHeader>
        <FormRow label="Odkaz" htmlFor="inv-public-link">
          <div className="flex gap-2">
            <Input id="inv-public-link" readOnly value={inv.public_url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />} Kopírovat
            </Button>
          </div>
        </FormRow>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            className="bg-[#25D366] text-white hover:bg-[#1ebe5b]"
            nativeButton={false}
            render={<a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" />}
          >
            <MessageCircleIcon /> Poslat přes WhatsApp
          </Button>
          {canShare ? (
            <Button type="button" variant="outline" onClick={() => navigator.share({ title: `Faktura ${inv.number}`, text, url: inv.public_url }).catch(() => {})}>
              <Share2Icon /> Sdílet…
            </Button>
          ) : (
            <Button type="button" variant="outline" nativeButton={false} render={<a href={`sms:${phone}?&body=${encodeURIComponent(text)}`} />}>
              <MessageCircleIcon /> Poslat SMS
            </Button>
          )}
        </div>
        {inv.viewed_at && <p className="text-xs text-muted-foreground">Zákazník fakturu otevřel {fmtDateTime(inv.viewed_at)}.</p>}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Hotovo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function InvoicePaidDialog({ slug, inv, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">{open && <PaidForm slug={slug} inv={inv} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  )
}

function PaidForm({ slug, inv, onDone }: { slug: string; inv: Invoice; onDone: () => void }) {
  const [date, setDate] = useState(inv.paid_on ?? today())
  const paid = useFirmMutation(slug, invoiceApi.paid(slug, inv.id))
  const save = (v: string | null) =>
    paid.mutate(v, {
      onSuccess: () => {
        toast.success(v ? `Uhrazeno ${fmtDate(v)}` : 'Úhrada zrušena')
        onDone()
      },
    })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (date) save(date)
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{inv.paid_on ? 'Úhrada faktury' : 'Zaplaceno'}</DialogTitle>
        <DialogDescription>
          Faktura {inv.number} na {money(inv.total)}. Kdy přišly peníze?
        </DialogDescription>
      </DialogHeader>
      <FormRow label="Zaplaceno dne" htmlFor="paid-on">
        <DateInput id="paid-on" value={date} onChange={setDate} required />
      </FormRow>
      <DialogFooter className="sm:justify-between">
        {inv.paid_on ? (
          <Button type="button" variant="destructive" disabled={paid.isPending} onClick={() => save(null)}>
            Zrušit úhradu
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onDone}>
            Zrušit
          </Button>
        )}
        <Button type="submit" disabled={paid.isPending || !date}>
          Uložit
        </Button>
      </DialogFooter>
    </form>
  )
}
