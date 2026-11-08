// Ceník (SPEC §4): položky práce, materiálu a ostatního.
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type { components } from './schema.gen'

type S = components['schemas']
export type CatalogItem = S['CatalogItem']
export type CatalogInput = S['CatalogInput']

/** Celý ceník firmy (s vyřazenými položkami, když `inactive`). Filtruje se na klientovi. */
export function useCatalog(slug: string, inactive = false, enabled = true) {
  return useQuery({
    queryKey: [slug, 'catalog', { inactive }],
    queryFn: async () => (await unwrap(api.GET('/api/accounts/{slug}/catalog', { params: { path: { slug }, query: { inactive } } }))) ?? [],
    staleTime: 60_000,
    enabled,
  })
}

export const catalogMutations = {
  create: (slug: string) => (body: CatalogInput) => unwrap(api.POST('/api/accounts/{slug}/catalog', { params: { path: { slug } }, body })),
  update: (slug: string) => (v: { id: number; body: CatalogInput }) =>
    unwrap(api.PUT('/api/accounts/{slug}/catalog/{id}', { params: { path: { slug, id: v.id } }, body: v.body })),
  /** Smaže nepoužitou položku; použitou jen vyřadí (active = false). */
  remove: (slug: string) => (id: number) => unwrap(api.DELETE('/api/accounts/{slug}/catalog/{id}', { params: { path: { slug, id } } })),
}

export function catalogInputOf(c: CatalogItem): CatalogInput {
  const { id: _id, ...rest } = c
  return rest
}
