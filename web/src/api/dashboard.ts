// Přehled (SPEC §8). Parťák dostane jen zakázky (bez cen), ostatní seznamy prázdné.
import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from './client'
import type { components } from './schema.gen'

export type Dashboard = components['schemas']['Dashboard']

export function useDashboard(slug: string) {
  return useQuery({
    queryKey: [slug, 'dashboard'],
    queryFn: () => unwrap(api.GET('/api/accounts/{slug}/dashboard', { params: { path: { slug } } })),
  })
}
