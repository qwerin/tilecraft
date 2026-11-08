// TanStack Query hooky nad API. Klíče: ['me'], [slug, 'quotes', …] — invalidace po firmách.
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type { components } from './schema.gen'

type S = components['schemas']

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async () => {
    const res = await api.GET('/api/auth/me')
    if (res.response.status === 401) return null
    return unwrap(Promise.resolve(res))
  },
  staleTime: 60_000,
})

// API tokeny a připojené aplikace (MCP) patří uživateli, ne firmě.
export function useApiTokens() {
  return useQuery({ queryKey: ['me', 'tokens'], queryFn: () => unwrap(api.GET('/api/auth/tokens')) })
}

export function useOAuthGrants() {
  return useQuery({ queryKey: ['me', 'oauth-grants'], queryFn: () => unwrap(api.GET('/api/auth/oauth-grants')) })
}

export const oauthConsentQuery = (params: Omit<S['OAuthDecision'], 'approve'>) =>
  queryOptions({
    queryKey: ['oauth-consent', params],
    queryFn: () => unwrap(api.GET('/api/oauth/authorize', { params: { query: params } })),
    retry: false,
  })

export const accountQuery = (slug: string) =>
  queryOptions({
    queryKey: [slug, 'account'],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}', { params: { path: { slug } } })),
    staleTime: 60_000,
  })

const p = (slug: string) => ({ path: { slug } })

export function useMembers(slug: string, enabled = true) {
  return useQuery({
    queryKey: [slug, 'members'],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/members', { params: p(slug) })),
    staleTime: 60_000,
    enabled,
  })
}

/** Mutace s invalidací všeho ve firmě pod danými klíči (výchozí: celá firma). */
export function useFirmMutation<V, R>(slug: string, fn: (v: V) => Promise<R>, invalidate: string[][] = [[]]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: [slug, ...k] }))),
  })
}

// Vlastní e-mailový server firmy (bez něj se posílá přes server aplikace).
export function useFirmMail(slug: string) {
  return useQuery({
    queryKey: [slug, 'mail'],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/mail', { params: p(slug) })),
  })
}
