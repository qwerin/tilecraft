// Faktury a zálohové faktury (SPEC §7). Klíče: [slug, 'invoices', …].
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type { components, operations } from './schema.gen'

type S = components['schemas']
export type Invoice = S['Invoice']
export type InvoiceSummary = S['InvoiceSummary']
export type InvoiceInput = S['InvoiceInput']
export type InvoiceLineInput = S['InvoiceLineInput']
export type JobInvoiceInput = S['JobInvoiceInput']
export type InvoiceFilter = NonNullable<operations['get-api-accounts-by-slug-invoices']['parameters']['query']>

const path = (slug: string) => ({ path: { slug } })
const pathId = (slug: string, id: number) => ({ path: { slug, id } })

/** Seznam faktur (filtr bez stránkování: do 500 kusů, kvůli součtům). */
export function useInvoices(slug: string, filter: InvoiceFilter) {
  return useQuery({
    queryKey: [slug, 'invoices', 'list', filter],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/invoices', { params: { ...path(slug), query: { per_page: 500, ...filter } } })),
    placeholderData: keepPreviousData,
  })
}

export const invoiceQuery = (slug: string, id: number) =>
  queryOptions({
    queryKey: [slug, 'invoices', id],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/invoices/{id}', { params: pathId(slug, id) })),
  })

export function useInvoice(slug: string, id: number) {
  return useQuery(invoiceQuery(slug, id))
}

export const invoicePdfUrl = (slug: string, id: number) => `/api/accounts/${slug}/invoices/${id}/pdf`

export const invoiceApi = {
  create: (slug: string) => (body: InvoiceInput) => unwrap(api.POST('/api/accounts/{slug}/invoices', { params: path(slug), body })),
  update: (slug: string, id: number) => (body: InvoiceInput) =>
    unwrap(api.PUT('/api/accounts/{slug}/invoices/{id}', { params: pathId(slug, id), body })),
  remove: (slug: string, id: number) => () => unwrap(api.DELETE('/api/accounts/{slug}/invoices/{id}', { params: pathId(slug, id) })),
  paid: (slug: string, id: number) => (paid_on: string | null) =>
    unwrap(api.POST('/api/accounts/{slug}/invoices/{id}/paid', { params: pathId(slug, id), body: { paid_on } })),
  email: (slug: string, id: number) => (body: { email?: string; message?: string }) =>
    unwrap(api.POST('/api/accounts/{slug}/invoices/{id}/email', { params: pathId(slug, id), body })),
  fromJob: (slug: string, jobId: number) => (body: JobInvoiceInput) =>
    unwrap(api.POST('/api/accounts/{slug}/jobs/{id}/invoice', { params: pathId(slug, jobId), body })),
}

export const kindLabels: Record<Invoice['kind'], string> = { invoice: 'Faktura', advance: 'Zálohová faktura' }

/** Stav úhrady pro odznak. */
export function invoiceState(i: Pick<InvoiceSummary, 'paid_on' | 'overdue'>): { label: string; tone: 'success' | 'danger' | 'warning' } {
  if (i.paid_on) return { label: 'Uhrazeno', tone: 'success' }
  if (i.overdue) return { label: 'Po splatnosti', tone: 'danger' }
  return { label: 'Neuhrazeno', tone: 'warning' }
}

/** Sazby DPH pro plátce: 12 % opravy bytů a RD, 21 % základní, 0 % přenesená daňová povinnost. */
export const vatRates = [12, 21, 0] as const
export const vatRateLabel = (r: number) => (r === 0 ? '0 % (PDP)' : `${r} %`)

/** Záloha z procent ceny zakázky: stejně jako server (zaokrouhleno na celé Kč). */
export function advanceFromPercent(total: number, percent: number) {
  return Math.round((total * percent) / 100 / 100) * 100
}

/** Nadpis dokladu: zálohová faktura, faktura (neplátce), faktura – daňový doklad (plátce). */
export function invoiceTitle(inv: Pick<Invoice, 'kind' | 'vat_payer'>) {
  if (inv.kind === 'advance') return 'Zálohová faktura'
  return inv.vat_payer ? 'Faktura – daňový doklad' : 'Faktura'
}

/** Částka řádku jako na serveru: množství × cena × (1 − sleva), zaokrouhleno na celé Kč (půlky od nuly). */
export function lineAmount(quantity: number, unitPrice: number, discount = 0) {
  const v = (quantity * unitPrice * (1 - discount / 100)) / 100
  return Math.sign(v) * Math.round(Math.abs(v)) * 100
}

/** Základ, DPH po sazbách a celkem (plátce); neplátce bez DPH. */
export function invoiceTotals(lines: { amount: number; vat_rate: number }[], vatPayer: boolean) {
  const byRate = new Map<number, number>()
  let base = 0
  for (const l of lines) {
    base += l.amount
    if (vatPayer) byRate.set(l.vat_rate, (byRate.get(l.vat_rate) ?? 0) + l.amount)
  }
  const rows = [...byRate.entries()]
    .map(([rate, b]) => ({ rate, base: b, vat: Math.sign(b) * Math.round((Math.abs(b) * rate) / 100) }))
    .sort((a, b) => b.rate - a.rate)
  const vat = rows.reduce((a, r) => a + r.vat, 0)
  return { rows, base, vat, total: base + vat }
}
