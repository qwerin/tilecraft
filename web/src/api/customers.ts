// Zákazníci (SPEC §3).
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type { components } from './schema.gen'

type S = components['schemas']
export type Customer = S['Customer']
export type CustomerInput = S['CustomerInput']
export type CustomerRef = S['CustomerRef']

export function useCustomers(slug: string, q: string, page = 1, perPage = 50) {
  return useQuery({
    queryKey: [slug, 'customers', { q, page, perPage }],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/customers', { params: { path: { slug }, query: { q: q || undefined, page, per_page: perPage } } })),
    placeholderData: keepPreviousData,
  })
}

export function useCustomer(slug: string, id: number | null | undefined) {
  return useQuery({
    queryKey: [slug, 'customers', id],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/customers/{id}', { params: { path: { slug, id: id! } } })),
    enabled: !!id,
  })
}

export const customerMutations = {
  create: (slug: string) => (body: CustomerInput) => unwrap(api.POST('/api/accounts/{slug}/customers', { params: { path: { slug } }, body })),
  update: (slug: string) => (v: { id: number; body: CustomerInput }) =>
    unwrap(api.PUT('/api/accounts/{slug}/customers/{id}', { params: { path: { slug, id: v.id } }, body: v.body })),
  remove: (slug: string) => (id: number) => unwrap(api.DELETE('/api/accounts/{slug}/customers/{id}', { params: { path: { slug, id } } })),
}

export function customerInputOf(c: Customer): CustomerInput {
  const { id: _id, quotes: _q, jobs: _j, invoices: _i, ...rest } = c
  return rest
}

/** Fakturační adresa na jeden řádek. */
export function customerAddress(c: Pick<Customer, 'street' | 'zip' | 'city'>): string {
  const zc = [c.zip?.trim(), c.city?.trim()].filter(Boolean).join(' ')
  return [c.street?.trim(), zc].filter(Boolean).join(', ')
}
