// Typovaný HTTP klient nad openapi-fetch. Veškerá komunikace s backendem jde přes `api`.
//
//   const order = await unwrap(api.GET('/api/accounts/{slug}/quotes/{id}', { params: { path: { slug, id } } }))
//
// - Session je v HttpOnly cookie → `credentials: 'include'`.
// - Chyby: `unwrap` vyhodí `ApiError` (problem+json); toasty řeší globálně QueryClient.
// - 401 mimo „tiché“ endpointy → handler z main.tsx (redirect na /login).

import createClient, { type Middleware } from 'openapi-fetch'
import { ApiError, type Problem } from './errors'
import type { paths } from './schema.gen'

export const api = createClient<paths>({
  baseUrl: '',
  credentials: 'include',
  headers: { Accept: 'application/json, application/problem+json' },
})

const SILENT_401 = ['/api/auth/me', '/api/auth/login', '/api/auth/register']

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

const authMiddleware: Middleware = {
  onResponse({ response, schemaPath }) {
    if (response.status === 401 && !SILENT_401.includes(schemaPath)) onUnauthorized?.()
    return undefined
  },
}

api.use(authMiddleware)

type FetchResult<T> = { data?: T; error?: unknown; response: Response }

/** Rozbalí výsledek openapi-fetch: vrátí `data`, nebo vyhodí `ApiError`. */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>
  try {
    result = await request
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, { title: 'Network error' })
  }
  const { data, error, response } = result
  if (!response.ok) {
    const problem: Problem = error && typeof error === 'object' ? (error as Problem) : { title: response.statusText }
    throw new ApiError(response.status, problem)
  }
  return data as T
}

/** Nahraje logo firmy (tiskne se na nabídky a faktury). */
export function uploadLogo(slug: string, file: File) {
  return uploadTo(`/api/accounts/${slug}/logo`, [file])
}

/** Nahraje soubory multipartem (mimo OpenAPI) — po jednom: fotky z telefonu mají několik MB a limit požadavku je 50 MB. */
export async function uploadTo(url: string, files: File[]) {
  for (const f of files) {
    const body = new FormData()
    body.append('file', f, f.name || `foto-${Date.now()}.jpg`)
    const res = await fetch(url, { method: 'POST', body, credentials: 'include' })
    if (!res.ok) {
      const problem = (await res.json().catch(() => ({ title: res.statusText }))) as Problem
      throw new ApiError(res.status, problem)
    }
  }
}

export function attachmentUrl(slug: string, id: number, inline = false) {
  return `/api/accounts/${slug}/attachments/${id}${inline ? '?inline=1' : ''}`
}
