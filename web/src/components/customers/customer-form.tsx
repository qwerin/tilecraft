import { useState } from 'react'
import { toast } from 'sonner'
import { customerInputOf, customerMutations, type Customer, type CustomerInput } from '@/api/customers'
import { useFirmMutation } from '@/api/queries'
import { FormRow } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const empty: CustomerInput = { name: '', contact_person: '', email: '', phone: '', street: '', zip: '', city: '', registration_no: '', vat_no: '', note: '' }

/** Pole zákazníka (bez tlačítek); `compact` = jen jméno, telefon, e-mail a adresa (rychlé založení na stavbě). */
export function CustomerFields({ value, onChange, compact }: { value: CustomerInput; onChange: (v: CustomerInput) => void; compact?: boolean }) {
  const f = (k: keyof CustomerInput) => ({
    id: `cust-${k}`,
    value: (value[k] as string | undefined) ?? '',
    onChange: (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value }),
  })
  return (
    <div className="grid grid-cols-6 gap-3">
      <FormRow label="Jméno / firma" htmlFor="cust-name" className="col-span-6">
        <Input {...f('name')} required autoFocus placeholder="Jan Novák" autoComplete="off" />
      </FormRow>
      <FormRow label="Telefon" htmlFor="cust-phone" className="col-span-6 sm:col-span-3">
        <Input {...f('phone')} type="tel" inputMode="tel" autoComplete="off" />
      </FormRow>
      <FormRow label="E-mail" htmlFor="cust-email" className="col-span-6 sm:col-span-3">
        <Input {...f('email')} type="email" inputMode="email" autoComplete="off" />
      </FormRow>
      <FormRow label="Ulice a číslo" htmlFor="cust-street" className="col-span-6">
        <Input {...f('street')} autoComplete="off" />
      </FormRow>
      <FormRow label="PSČ" htmlFor="cust-zip" className="col-span-2">
        <Input {...f('zip')} inputMode="numeric" autoComplete="off" />
      </FormRow>
      <FormRow label="Obec" htmlFor="cust-city" className="col-span-4">
        <Input {...f('city')} autoComplete="off" />
      </FormRow>
      {!compact && (
        <>
          <FormRow label="IČO" htmlFor="cust-registration_no" className="col-span-3">
            <Input {...f('registration_no')} inputMode="numeric" autoComplete="off" />
          </FormRow>
          <FormRow label="DIČ" htmlFor="cust-vat_no" className="col-span-3">
            <Input {...f('vat_no')} autoComplete="off" />
          </FormRow>
          <FormRow label="Kontaktní osoba" htmlFor="cust-contact_person" className="col-span-6">
            <Input {...f('contact_person')} autoComplete="off" />
          </FormRow>
          <FormRow label="Poznámka" htmlFor="cust-note" className="col-span-6">
            <Textarea {...f('note')} rows={2} />
          </FormRow>
        </>
      )}
    </div>
  )
}

/** Dialog založení / úpravy zákazníka. `customer` = úprava; `initialName` předvyplní jméno nového. */
export function CustomerFormDialog({
  slug,
  customer,
  initialName,
  compact,
  onSaved,
  onClose,
}: {
  slug: string
  customer?: Customer
  initialName?: string
  compact?: boolean
  onSaved?: (c: Customer) => void
  onClose: () => void
}) {
  const [v, setV] = useState<CustomerInput>(() => (customer ? { ...empty, ...customerInputOf(customer) } : { ...empty, name: initialName ?? '' }))
  const [more, setMore] = useState(!compact)
  const create = useFirmMutation(slug, customerMutations.create(slug), [['customers']])
  const update = useFirmMutation(slug, customerMutations.update(slug), [['customers'], ['quotes'], ['jobs'], ['invoices']])
  const pending = create.isPending || update.isPending
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const body = { ...v, name: v.name.trim() }
            const done = (c: Customer) => {
              toast.success(customer ? 'Zákazník uložen' : 'Zákazník založen')
              onSaved?.(c)
              onClose()
            }
            if (customer) update.mutate({ id: customer.id, body }, { onSuccess: done })
            else create.mutate(body, { onSuccess: done })
          }}
        >
          <DialogHeader>
            <DialogTitle>{customer ? 'Upravit zákazníka' : 'Nový zákazník'}</DialogTitle>
          </DialogHeader>
          <CustomerFields value={v} onChange={setV} compact={!more} />
          {!more && (
            <button type="button" className={cn('self-start text-xs text-primary hover:underline')} onClick={() => setMore(true)}>
              + IČO, DIČ, kontaktní osoba, poznámka
            </button>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" disabled={!v.name.trim() || pending}>
              {customer ? 'Uložit' : 'Založit zákazníka'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
