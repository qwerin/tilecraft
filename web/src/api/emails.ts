// Odeslané e-maily a zkušební e-mail.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type { components } from './schema.gen'

type S = components['schemas']
export type Email = S['Email']
export type EmailDelivery = S['EmailDelivery']

export const emailMutations = {
  test: (slug: string) => (email: string) =>
    unwrap(api.POST('/api/accounts/{slug}/emails/test', { params: { path: { slug } }, body: { email: email || undefined } })),
}

// Odchází e-maily opravdu? Bez ostrého odesílání (a vždy na testovací instanci) se jen ukládají na stránku E-maily.
export function useEmailDelivery(slug: string) {
  return useQuery({
    queryKey: [slug, 'emails', 'delivery'],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/emails/delivery', { params: { path: { slug } } })),
    staleTime: Infinity,
  })
}

export function useEmails(slug: string, page: number) {
  return useQuery({
    queryKey: [slug, 'emails', page],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/emails', { params: { path: { slug }, query: { page, per_page: 50 } } })),
    placeholderData: keepPreviousData,
  })
}
