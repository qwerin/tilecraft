import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage, isApiError } from './errors'

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silent?: boolean }
  }
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError(err, query) {
        if (query.state.data !== undefined && !(isApiError(err) && err.status === 401)) toast.error(errorMessage(err))
      },
    }),
    mutationCache: new MutationCache({
      onError(err, _v, _c, mutation) {
        if (!mutation.meta?.silent && !(isApiError(err) && err.status === 401)) toast.error(errorMessage(err))
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (n, err) => !(isApiError(err) && err.status >= 400 && err.status < 500) && n < 2,
      },
      mutations: { retry: false },
    },
  })
}
