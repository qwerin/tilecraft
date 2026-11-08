// Náhled faktury jako papírový doklad (stejný obsah jako PDF z backendu): strany, data, řádky, DPH, QR Platba.
import { invoiceTitle, type Invoice } from '@/api/invoices'
import type { Account } from '@/api/types'
import { PrintLogo } from '@/components/print-sheet'
import { QrCode } from '@/components/qr-code'
import { fmtDate, money, num, unitLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

export function InvoiceDocument({ inv, firm, className }: { inv: Invoice; firm: Account; className?: string }) {
  const payer = inv.vat_payer
  const showVat = payer && inv.kind === 'invoice'
  const hasDiscount = inv.lines.some((l) => (l.discount ?? 0) > 0)
  const reverseCharge = showVat && inv.vat_rows.some((r) => r.rate === 0 && r.base > 0)
  const cols = 4 + (hasDiscount ? 1 : 0) + (showVat ? 1 : 0)

  return (
    <article
      className={cn(
        'rounded-xl bg-white p-4 text-[13px] leading-snug text-neutral-900 shadow-sm ring-1 ring-black/5 [color-scheme:light] sm:p-8',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <PrintLogo src={firm.logo} className="mb-2 max-h-14 max-w-48 object-contain" />
          <h2 className="text-lg font-semibold">{invoiceTitle(inv)}</h2>
          <p className="text-neutral-500">
            č. <span className="font-medium text-neutral-900">{inv.number}</span>
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-right">
          <dt className="text-neutral-500">Datum vystavení</dt>
          <dd>{fmtDate(inv.issued_on)}</dd>
          {inv.kind === 'invoice' && payer && inv.taxable_on && (
            <>
              <dt className="text-neutral-500">DUZP</dt>
              <dd>{fmtDate(inv.taxable_on)}</dd>
            </>
          )}
          <dt className="text-neutral-500">Splatnost</dt>
          <dd className="font-medium">{fmtDate(inv.due_on)}</dd>
          <dt className="text-neutral-500">Var. symbol</dt>
          <dd className="font-medium">{inv.vs}</dd>
        </dl>
      </header>

      <div className="grid gap-4 border-b border-neutral-200 py-4 sm:grid-cols-2">
        <Party
          title="Dodavatel"
          name={firm.name}
          lines={[firm.street, [firm.zip, firm.city].filter(Boolean).join(' ')]}
          ids={[firm.registration_no && `IČO: ${firm.registration_no}`, firm.vat_no && `DIČ: ${firm.vat_no}`]}
          extra={[firm.phone, firm.email]}
        />
        <Party
          title="Odběratel"
          name={inv.party.name}
          lines={[inv.party.street, [inv.party.zip, inv.party.city].filter(Boolean).join(' ')]}
          ids={[inv.party.registration_no && `IČO: ${inv.party.registration_no}`, inv.party.vat_no && `DIČ: ${inv.party.vat_no}`]}
          extra={[inv.party.email]}
        />
      </div>

      <div className="-mx-4 overflow-x-auto px-4 py-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[520px] text-[13px] [&_td]:px-1.5 [&_td]:py-1.5 [&_th]:px-1.5 [&_th]:py-1 [&_th]:font-medium [&_th]:text-neutral-500">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs">
              <th>Položka</th>
              <th className="text-right">Množství</th>
              <th className="text-right">Cena/j.</th>
              {hasDiscount && <th className="text-right">Sleva</th>}
              {showVat && <th className="text-right">DPH</th>}
              <th className="text-right">{showVat ? 'Základ' : 'Celkem'}</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id} className="border-b border-neutral-100 align-top">
                <td className={cn(l.advance_id && 'italic')}>{l.text}</td>
                <td className="text-right whitespace-nowrap tabular-nums">
                  {num(l.quantity)} {l.unit ? unitLabel(l.unit) : ''}
                </td>
                <td className="text-right whitespace-nowrap tabular-nums">{money(l.unit_price)}</td>
                {hasDiscount && <td className="text-right whitespace-nowrap tabular-nums">{l.discount ? `${num(l.discount)} %` : ''}</td>}
                {showVat && <td className="text-right whitespace-nowrap tabular-nums">{l.vat_rate ?? 0} %</td>}
                <td className="text-right whitespace-nowrap tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
            {inv.lines.length === 0 && (
              <tr>
                <td colSpan={cols} className="py-6 text-center text-neutral-500">
                  Bez položek
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-4">
          {inv.qr_payment && (
            <div className="text-center">
              <QrCode value={inv.qr_payment} label={`QR Platba faktury ${inv.number}`} className="w-32" />
              <p className="mt-1 text-[11px] text-neutral-500">QR Platba</p>
            </div>
          )}
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-neutral-500">Forma úhrady</dt>
            <dd>převodem</dd>
            {(firm.bank_account || firm.iban) && (
              <>
                <dt className="text-neutral-500">Účet</dt>
                <dd className="font-medium">{firm.bank_account || firm.iban}</dd>
              </>
            )}
            {firm.bank_account && firm.iban && (
              <>
                <dt className="text-neutral-500">IBAN</dt>
                <dd>{firm.iban}</dd>
              </>
            )}
            <dt className="text-neutral-500">Var. symbol</dt>
            <dd className="font-medium">{inv.vs}</dd>
          </dl>
        </div>

        <div className="min-w-60 sm:text-right">
          {showVat && inv.vat_rows.length > 0 && (
            <table className="mb-2 ml-auto text-xs tabular-nums [&_td]:py-0.5 [&_td]:pl-4 [&_th]:pl-4 [&_th]:font-medium [&_th]:text-neutral-500">
              <thead>
                <tr>
                  <th className="text-left">Sazba</th>
                  <th className="text-right">Základ</th>
                  <th className="text-right">DPH</th>
                </tr>
              </thead>
              <tbody>
                {inv.vat_rows.map((r) => (
                  <tr key={r.rate}>
                    <td className="text-left">{r.rate} %</td>
                    <td className="text-right">{money(r.base)}</td>
                    <td className="text-right">{money(r.vat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-baseline justify-between gap-4 border-t-2 border-neutral-900 pt-2 sm:justify-end">
            <span className="font-medium">{inv.paid_on ? 'Celkem' : 'Celkem k úhradě'}</span>
            <span className="text-xl font-bold tabular-nums">{money(inv.total)}</span>
          </div>
          {inv.paid_on && <p className="mt-1 text-xs font-medium text-emerald-700">Uhrazeno {fmtDate(inv.paid_on)}</p>}
        </div>
      </div>

      {(inv.note || !payer || reverseCharge || inv.kind === 'advance') && (
        <div className="mt-6 flex flex-col gap-1 border-t border-neutral-200 pt-3 text-xs text-neutral-600">
          {inv.kind === 'advance' && <p>Zálohová faktura není daňovým dokladem.</p>}
          {reverseCharge && <p>Daň odvede zákazník (přenesená daňová povinnost, § 92a zákona o DPH).</p>}
          {!payer && <p>Nejsem plátce DPH.</p>}
          {inv.note && <p className="whitespace-pre-line">{inv.note}</p>}
        </div>
      )}
    </article>
  )
}

function Party({ title, name, lines, ids, extra }: { title: string; name: string; lines: string[]; ids: (string | false)[]; extra: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">{title}</p>
      <p className="font-semibold">{name || '—'}</p>
      {lines.filter(Boolean).map((l) => (
        <p key={l}>{l}</p>
      ))}
      {ids.some(Boolean) && <p className="mt-1">{ids.filter(Boolean).join(' · ')}</p>}
      {extra.some(Boolean) && <p className="text-neutral-500">{extra.filter(Boolean).join(' · ')}</p>}
    </div>
  )
}
