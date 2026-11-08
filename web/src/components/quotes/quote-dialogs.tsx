import { CheckIcon, CopyIcon, MailIcon, MessageCircleIcon, Share2Icon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useEmailDelivery } from '@/api/emails'
import { useFirmMutation } from '@/api/queries'
import { quoteMutations, type Quote } from '@/api/quotes'
import { FormRow } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { fmtDate, money } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Text zprávy pro WhatsApp / SMS s odkazem na nabídku. */
function shareText(q: Quote, firm: string) {
  return `Dobrý den, posíláme cenovou nabídku „${q.title}“ (${money(q.total)}, platnost do ${fmtDate(q.valid_until)}). Prohlédnete a přijmete ji zde: ${q.public_url}\n${firm}`
}

/**
 * Odeslání nabídky: e-mailem (PDF + odkaz), nebo „jinak“ — označit jako odeslanou a sdílet odkaz (WhatsApp, SMS).
 * `beforeSend` uloží neuložené změny (vrací false = neodesílat).
 */
export function SendQuoteDialog({
  slug,
  firm,
  quote,
  beforeSend,
  onClose,
}: {
  slug: string
  firm: string
  quote: Quote
  beforeSend: () => Promise<boolean>
  onClose: () => void
}) {
  const [mode, setMode] = useState<'email' | 'link'>(quote.customer.email ? 'email' : 'link')
  const [email, setEmail] = useState(quote.customer.email)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const delivery = useEmailDelivery(slug).data
  const send = useFirmMutation(slug, quoteMutations.send(slug))
  const linkReady = quote.state !== 'draft'
  const text = shareText(quote, firm)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(quote.public_url)
      setCopied(true)
      toast.success('Odkaz zkopírován')
    } catch {
      toast.error('Kopírování se nepovedlo — označte odkaz a zkopírujte ho ručně.')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Odeslat nabídku zákazníkovi</DialogTitle>
          <DialogDescription>
            Zákazník dostane odkaz, kde si nabídku prohlédne, stáhne PDF a jedním klepnutím ji přijme nebo odmítne.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ['email', 'E-mailem', MailIcon],
              ['link', 'WhatsApp, SMS…', MessageCircleIcon],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-colors md:py-1.5',
                mode === k && 'bg-card text-foreground shadow-xs',
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {mode === 'email' ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!(await beforeSend())) return
              send.mutate(
                { id: quote.id, body: { email: email.trim() || undefined, message: message.trim() || undefined } },
                {
                  onSuccess: () => {
                    toast.success(delivery && !delivery.live ? 'Nabídka označena jako odeslaná, e-mail je jen uložený (odesílání je vypnuté)' : `Nabídka odeslána na ${email}`)
                    onClose()
                  },
                },
              )
            }}
          >
            <FormRow label="Komu" htmlFor="send-email" hint={!quote.customer.email ? 'Zákazník nemá e-mail; adresa se k němu neuloží.' : undefined}>
              <Input id="send-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="zakaznik@example.cz" />
            </FormRow>
            <FormRow label="Zpráva (nepovinné)" htmlFor="send-msg" hint="Pod zprávu se doplní odkaz na nabídku, celková cena a platnost. PDF bude v příloze.">
              <Textarea id="send-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={`Dobrý den,\n\nposíláme cenovou nabídku „${quote.title}“.`} />
            </FormRow>
            {delivery && !delivery.live && (
              <p className="rounded-lg bg-warning/15 px-3 py-2 text-xs">
                Odesílání e-mailů je vypnuté — e-mail se jen uloží na stránku E-maily. Pošlete raději odkaz přes WhatsApp nebo SMS.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Zrušit
              </Button>
              <Button type="submit" disabled={!email.trim() || send.isPending}>
                <MailIcon /> Odeslat e-mail
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {!linkReady ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Odkaz začne fungovat, až nabídku označíte jako odeslanou. Pak ho zkopírujete nebo rovnou pošlete přes WhatsApp či SMS.
                </p>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onClose}>
                    Zrušit
                  </Button>
                  <Button
                    type="button"
                    disabled={send.isPending}
                    onClick={async () => {
                      if (!(await beforeSend())) return
                      send.mutate({ id: quote.id, body: { mark_only: true } }, { onSuccess: () => toast.success('Nabídka označena jako odeslaná') })
                    }}
                  >
                    <CheckIcon /> Označit jako odeslanou
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <FormRow label="Odkaz pro zákazníka" htmlFor="public-link">
                  <div className="flex gap-2">
                    <Input id="public-link" readOnly value={quote.public_url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                    <Button type="button" variant="outline" onClick={copy}>
                      {copied ? <CheckIcon /> : <CopyIcon />} Kopírovat
                    </Button>
                  </div>
                </FormRow>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" className="bg-[#25D366] text-white hover:bg-[#1ebe5b]" nativeButton={false} render={<a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" />}>
                    <MessageCircleIcon /> Poslat přes WhatsApp
                  </Button>
                  {canShare ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigator.share({ title: `Nabídka ${quote.number}`, text, url: quote.public_url }).catch(() => {})}
                    >
                      <Share2Icon /> Sdílet…
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" nativeButton={false} render={<a href={`sms:${quote.customer.phone.replace(/\s/g, '')}?&body=${encodeURIComponent(text)}`} />}>
                      <MessageCircleIcon /> Poslat SMS
                    </Button>
                  )}
                </div>
                {quote.state === 'sent' && quote.sent_at && <p className="text-xs text-muted-foreground">Nabídka je označená jako odeslaná ({fmtDate(quote.sent_at)}).</p>}
                <DialogFooter>
                  <Button type="button" onClick={onClose}>
                    Hotovo
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Ruční rozhodnutí zákazníka (domluva po telefonu): přijal / odmítl s poznámkou. */
export function DecisionDialog({ slug, quote, state, onClose }: { slug: string; quote: Quote; state: 'accepted' | 'rejected'; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const decide = useFirmMutation(slug, quoteMutations.decide(slug))
  const accepted = state === 'accepted'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            decide.mutate(
              { id: quote.id, body: { state, reason: reason.trim() || undefined } },
              {
                onSuccess: () => {
                  toast.success(accepted ? 'Nabídka je přijatá' : 'Nabídka je odmítnutá')
                  onClose()
                },
              },
            )
          }}
        >
          <DialogHeader>
            <DialogTitle>{accepted ? 'Zákazník nabídku přijal' : 'Zákazník nabídku odmítl'}</DialogTitle>
            <DialogDescription>
              {accepted
                ? 'Např. domluva po telefonu. Přijatá nabídka se zamkne a můžete z ní vytvořit zakázku.'
                : 'Odmítnutá nabídka se zamkne. Později ji můžete vrátit do rozpracovaných nebo zduplikovat.'}
            </DialogDescription>
          </DialogHeader>
          <FormRow label="Poznámka (nepovinné)" htmlFor="decision-reason">
            <Textarea id="decision-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={accepted ? 'Domluveno telefonicky…' : 'Důvod odmítnutí…'} />
          </FormRow>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" variant={accepted ? 'default' : 'destructive'} disabled={decide.isPending}>
              {accepted ? <ThumbsUpIcon /> : <ThumbsDownIcon />} {accepted ? 'Přijato' : 'Odmítnuto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
