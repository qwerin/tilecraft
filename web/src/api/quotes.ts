// Nabídky (SPEC §5) a veřejná stránka nabídky pro zákazníka (/n/{token}).
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type { components } from './schema.gen'

type S = components['schemas']
export type Quote = S['Quote']
export type QuoteInput = S['QuoteInput']
export type QuoteSummary = S['QuoteSummary']
export type QuoteState = Quote['state']
export type PublicQuote = S['PublicQuote']
export type Line = S['Line']
export type LineInput = S['LineInput']

export type QuoteListParams = { state?: string; q?: string; customer_id?: number; page?: number }

export function useQuotes(slug: string, p: QuoteListParams, enabled = true) {
  return useQuery({
    queryKey: [slug, 'quotes', 'list', p],
    queryFn: () =>
      unwrap(
        api.GET('/api/accounts/{slug}/quotes', {
          params: { path: { slug }, query: { state: p.state || undefined, q: p.q || undefined, customer_id: p.customer_id, page: p.page, per_page: 50 } },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useQuote(slug: string, id: number) {
  return useQuery({
    queryKey: [slug, 'quotes', id],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/quotes/{id}', { params: { path: { slug, id } } })),
  })
}

const pid = (slug: string, id: number) => ({ params: { path: { slug, id } } })

export const quoteMutations = {
  create: (slug: string) => (body: QuoteInput) => unwrap(api.POST('/api/accounts/{slug}/quotes', { params: { path: { slug } }, body })),
  update: (slug: string) => (v: { id: number; body: QuoteInput }) => unwrap(api.PUT('/api/accounts/{slug}/quotes/{id}', { ...pid(slug, v.id), body: v.body })),
  remove: (slug: string) => (id: number) => unwrap(api.DELETE('/api/accounts/{slug}/quotes/{id}', pid(slug, id))),
  duplicate: (slug: string) => (id: number) => unwrap(api.POST('/api/accounts/{slug}/quotes/{id}/duplicate', pid(slug, id))),
  send: (slug: string) => (v: { id: number; body: S['QuoteSend'] }) =>
    unwrap(api.POST('/api/accounts/{slug}/quotes/{id}/send', { ...pid(slug, v.id), body: v.body })),
  decide: (slug: string) => (v: { id: number; body: S['QuoteDecision'] }) =>
    unwrap(api.POST('/api/accounts/{slug}/quotes/{id}/decision', { ...pid(slug, v.id), body: v.body })),
  createJob: (slug: string) => (id: number) => unwrap(api.POST('/api/accounts/{slug}/quotes/{id}/job', { ...pid(slug, id), body: {} })),
}

export const quotePdfUrl = (slug: string, id: number) => `/api/accounts/${slug}/quotes/${id}/pdf`
export const publicQuotePdfUrl = (token: string) => `/api/public/quotes/${encodeURIComponent(token)}/pdf`

export function usePublicQuote(token: string) {
  return useQuery({
    queryKey: ['public-quote', token],
    queryFn: () => unwrap(api.GET('/api/public/quotes/{token}', { params: { path: { token } } })),
    retry: false,
  })
}

export const publicDecide = (token: string) => (body: S['PublicDecision']) =>
  unwrap(api.POST('/api/public/quotes/{token}/decision', { params: { path: { token } }, body }))

export const quoteStateLabels: Record<QuoteState, string> = {
  draft: 'Rozpracovaná',
  sent: 'Odeslaná',
  accepted: 'Přijatá',
  rejected: 'Odmítnutá',
}
