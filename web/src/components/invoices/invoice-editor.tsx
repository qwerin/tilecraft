// Formulář faktury: nová ruční faktura i úprava neuhrazené (hlavička, data, poznámka, řádky).
import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react'
import { api, unwrap } from '@/api/client'
import { invoiceTotals, lineAmount, vatRateLabel, vatRates, type Invoice, type InvoiceInput } from '@/api/invoices'
import { FormRow, NativeSelect, Panel } from '@/components/common'
import { DateInput } from '@/components/date-input'
import { Segmented } from '@/components/invoices/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useFirm } from '@/hooks/use-firm'
import { addDays, fmtDate, fromMinor, money, toMinor, today, unitLabel, units } from '@/lib/format'
import { cn } from '@/lib/utils'

type Draft = {
  key: number
  text: string
  unit: string
  quantity: string
  price: string
  discount: number
  vat_rate: number
  advance_id?: number
}

let nextKey = 1
const parseNum = (s: string) => {
  const t = s.replace(/\s/g, '').replace(',', '.')
  const n = Number(t)
  return t === '' || !Number.isFinite(n) ? null : n
}

export type InvoiceEditorProps = {
  slug: string
  /** Úprava existující faktury; bez ní nová. */
  invoice?: Invoice
  defaults?: { customer_id?: number; job_id?: number }
  pending: boolean
  onSubmit: (body: InvoiceInput) => void
  onCancel: () => void
}

export function InvoiceEditor({ slug, invoice, defaults, pending, onSubmit, onCancel }: InvoiceEditorProps) {
  const { account } = useFirm()
  const st = account.settings
  const payer = invoice ? invoice.vat_payer : st.vat_payer
  const [kind, setKind] = useState<'invoice' | 'advance'>(invoice?.kind ?? 'invoice')
  const [customerId, setCustomerId] = useState<number | undefined>(invoice?.customer.id ?? defaults?.customer_id)
  const [jobId, setJobId] = useState<number | undefined>(invoice ? (invoice.job_id ?? undefined) : defaults?.job_id)
  const [issued, setIssued] = useState(invoice?.issued_on ?? today())
  const [taxable, setTaxable] = useState(invoice?.taxable_on ?? '')
  const [due, setDue] = useState(invoice?.due_on ?? '')
  const [note, setNote] = useState(invoice ? invoice.note : st.invoice_text)
  const [lines, setLines] = useState<Draft[]>(() =>
    invoice
      ? invoice.lines.map((l) => ({
          key: nextKey++,
          text: l.text,
          unit: l.unit ?? '',
          quantity: String(l.quantity).replace('.', ','),
          price: fromMinor(l.unit_price),
          discount: l.discount ?? 0,
          vat_rate: l.vat_rate ?? 0,
          advance_id: l.advance_id,
        }))
      : [emptyLine(st.default_vat_rate)],
  )
  const withVat = payer && kind === 'invoice'
  const hasDiscount = lines.some((l) => l.discount > 0)

  const customers = useQuery({
    queryKey: [slug, 'customers', 'all'],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/customers', { params: { path: { slug }, query: { per_page: 500 } } })),
    staleTime: 60_000,
  })
  const jobs = useQuery({
    queryKey: [slug, 'jobs', 'by-customer', customerId],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/jobs', { params: { path: { slug }, query: { customer_id: customerId, per_page: 200 } } })),
    enabled: !!customerId,
  })

  const amounts = lines.map((l) => lineAmount(parseNum(l.quantity) ?? 0, toMinor(l.price) ?? 0, l.discount))
  const totals = invoiceTotals(
    lines.map((l, i) => ({ amount: amounts[i], vat_rate: withVat ? l.vat_rate : 0 })),
    withVat,
  )

  const setLine = (key: number, patch: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const filled = lines.filter((l) => l.text.trim())
  const invalidLine = filled.find((l) => parseNum(l.quantity) === null || toMinor(l.price) === null)
  const dueDefault = addDays(issued || today(), st.invoice_due_days)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!customerId || filled.length === 0 || invalidLine) return
    onSubmit({
      kind,
      customer_id: customerId,
      job_id: jobId,
      issued_on: issued || undefined,
      taxable_on: kind === 'invoice' && taxable ? taxable : undefined,
      due_on: due || undefined,
      note,
      lines: filled.map((l) => ({
        text: l.text.trim(),
        unit: l.unit || undefined,
        quantity: parseNum(l.quantity) ?? 0,
        unit_price: toMinor(l.price) ?? 0,
        discount: l.discount || undefined,
        vat_rate: withVat ? l.vat_rate : 0,
        advance_id: l.advance_id,
      })),
    })
  }

  const customerList = customers.data?.items ?? []
  const missingCustomer = invoice && !customerList.some((c) => c.id === invoice.customer.id)

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Panel title="Doklad">
        <div className="grid grid-cols-6 gap-x-4 gap-y-3 max-md:grid-cols-1 max-md:*:col-span-1">
          {!invoice && (
            <FormRow label="Druh" className="col-span-6">
              <Segmented
                className="w-full md:w-auto"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'invoice', label: 'Faktura' },
                  { value: 'advance', label: 'Zálohová faktura' },
                ]}
              />
            </FormRow>
          )}
          <FormRow label="Zákazník" htmlFor="inv-customer" className="col-span-3">
            <NativeSelect
              id="inv-customer"
              required
              className="[&_select]:h-11 md:[&_select]:h-8"
              value={customerId ?? ''}
              onChange={(e) => {
                setCustomerId(Number(e.target.value) || undefined)
                setJobId(undefined)
              }}
            >
              <option value="">{customers.isPending ? 'Načítám…' : '— vyberte zákazníka —'}</option>
              {missingCustomer && <option value={invoice.customer.id}>{invoice.customer.name}</option>}
              {customerList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.city ? `, ${c.city}` : ''}
                </option>
              ))}
            </NativeSelect>
          </FormRow>
          <FormRow label="Zakázka (nepovinné)" htmlFor="inv-job" className="col-span-3">
            <NativeSelect
              id="inv-job"
              disabled={!customerId}
              className="[&_select]:h-11 md:[&_select]:h-8"
              value={jobId ?? ''}
              onChange={(e) => setJobId(Number(e.target.value) || undefined)}
            >
              <option value="">— bez zakázky —</option>
              {jobId && !jobs.data?.items.some((j) => j.id === jobId) && <option value={jobId}>{invoice?.job_number || `Zakázka #${jobId}`}</option>}
              {jobs.data?.items.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.number} — {j.title}
                </option>
              ))}
            </NativeSelect>
          </FormRow>
          <FormRow label="Datum vystavení" htmlFor="inv-issued" className="col-span-2">
            <DateInput id="inv-issued" value={issued} onChange={setIssued} required />
          </FormRow>
          {kind === 'invoice' && (
            <FormRow label="DUZP" htmlFor="inv-taxable" className="col-span-2" hint={taxable ? undefined : 'Prázdné = datum vystavení'}>
              <DateInput id="inv-taxable" value={taxable} onChange={setTaxable} />
            </FormRow>
          )}
          <FormRow label="Splatnost" htmlFor="inv-due" className="col-span-2" hint={due ? undefined : `Prázdné = ${st.invoice_due_days} dní (${fmtDate(dueDefault)})`}>
            <DateInput id="inv-due" value={due} onChange={setDue} min={issued || undefined} />
          </FormRow>
        </div>
      </Panel>

      <Panel
        title="Položky"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine(st.default_vat_rate)])}>
            <PlusIcon /> Přidat řádek
          </Button>
        }
      >
        <div className="flex flex-col gap-3 md:gap-1.5">
          <div
            className={cn(
              'grid gap-2 text-xs font-medium text-muted-foreground max-md:hidden',
              gridCols(withVat, hasDiscount),
            )}
          >
            <span>Text</span>
            <span className="text-right">Množství</span>
            <span>Jedn.</span>
            <span className="text-right">Cena/j. {withVat ? 'bez DPH' : ''} (Kč)</span>
            {hasDiscount && <span className="text-right">Sleva %</span>}
            {withVat && <span>DPH</span>}
            <span className="text-right">Celkem</span>
            <span />
          </div>
          {lines.map((l, i) => {
            const qtyBad = l.text.trim() !== '' && parseNum(l.quantity) === null
            const priceBad = l.text.trim() !== '' && toMinor(l.price) === null
            return (
              <div key={l.key} className={cn('grid gap-2 max-md:grid-cols-6 max-md:rounded-lg max-md:border max-md:p-2', gridCols(withVat, hasDiscount))}>
                <Input
                  aria-label="Text položky"
                  placeholder={l.advance_id ? 'Odpočet zálohy' : 'Např. Pokládka dlažby'}
                  value={l.text}
                  onChange={(e) => setLine(l.key, { text: e.target.value })}
                  className="max-md:col-span-6"
                  maxLength={500}
                />
                <Input
                  aria-label="Množství"
                  inputMode="decimal"
                  value={l.quantity}
                  aria-invalid={qtyBad || undefined}
                  onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                  className="text-right tabular-nums max-md:col-span-2"
                />
                <NativeSelect aria-label="Jednotka" value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value })} className="max-md:col-span-1 [&_select]:pr-6">
                  <option value="">—</option>
                  {!!l.unit && !(units as readonly string[]).includes(l.unit) && <option value={l.unit}>{l.unit}</option>}
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {unitLabel(u)}
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  aria-label="Cena za jednotku v Kč"
                  inputMode="decimal"
                  placeholder="0"
                  value={l.price}
                  aria-invalid={priceBad || undefined}
                  onChange={(e) => setLine(l.key, { price: e.target.value })}
                  className="text-right tabular-nums max-md:col-span-3"
                />
                {hasDiscount && (
                  <Input
                    aria-label="Sleva v %"
                    inputMode="decimal"
                    value={l.discount ? String(l.discount).replace('.', ',') : ''}
                    onChange={(e) => setLine(l.key, { discount: Math.min(100, Math.max(0, parseNum(e.target.value) ?? 0)) })}
                    className="text-right tabular-nums max-md:col-span-2"
                  />
                )}
                {withVat && (
                  <NativeSelect aria-label="Sazba DPH" value={l.vat_rate} onChange={(e) => setLine(l.key, { vat_rate: Number(e.target.value) })} className="max-md:col-span-2 [&_select]:pr-6">
                    {[...new Set([...vatRates, l.vat_rate])].map((r) => (
                      <option key={r} value={r}>
                        {vatRateLabel(r)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
                <span className="self-center text-right text-sm font-medium tabular-nums max-md:col-span-2 max-md:text-left">{money(amounts[i])}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="Odebrat řádek"
                  className="self-center justify-self-end text-muted-foreground hover:text-destructive"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <Trash2Icon />
                </Button>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Záporná cena = odpočet (např. zaplacená záloha).{kind === 'advance' && payer && ' Zálohová faktura se vystavuje bez DPH (není daňový doklad).'}
        </p>
        <div className="mt-4 ml-auto flex max-w-xs flex-col gap-1 text-sm tabular-nums">
          {withVat && (
            <>
              <Row label="Základ" value={money(totals.base)} />
              {totals.rows.map((r) => (
                <Row key={r.rate} label={`DPH ${r.rate} %`} value={money(r.vat)} />
              ))}
            </>
          )}
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <span>Celkem</span>
            <span>{money(totals.total)}</span>
          </div>
        </div>
      </Panel>

      <Panel title="Poznámka na faktuře">
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} placeholder="Např. Děkujeme za zakázku." />
      </Panel>

      <div className="flex flex-wrap items-center justify-end gap-2 pb-6">
        {!customerId && <span className="mr-auto text-sm text-muted-foreground">Vyberte zákazníka.</span>}
        {customerId && filled.length === 0 && <span className="mr-auto text-sm text-muted-foreground">Doplňte aspoň jednu položku.</span>}
        {invalidLine && <span className="mr-auto text-sm text-destructive">Zkontrolujte množství a cenu u „{invalidLine.text}“.</span>}
        <Button type="button" variant="outline" onClick={onCancel}>
          Zrušit
        </Button>
        <Button type="submit" disabled={pending || !customerId || filled.length === 0 || !!invalidLine}>
          <SaveIcon /> {invoice ? 'Uložit změny' : 'Vystavit fakturu'}
        </Button>
      </div>
    </form>
  )
}

function emptyLine(vat: number): Draft {
  return { key: nextKey++, text: '', unit: 'ks', quantity: '1', price: '', discount: 0, vat_rate: vat }
}

// celé třídy (Tailwind je musí najít ve zdrojáku)
function gridCols(vat: boolean, discount: boolean) {
  if (vat && discount) return 'md:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_8rem_4.5rem_6.5rem_7rem_2rem]'
  if (vat) return 'md:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_8rem_6.5rem_7rem_2rem]'
  if (discount) return 'md:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_8rem_4.5rem_7rem_2rem]'
  return 'md:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_8rem_7rem_2rem]'
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
