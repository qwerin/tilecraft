import { useSyncExternalStore } from 'react'

/** Telefon: pod breakpointem `md` (768 px) mají hlavní seznamy kartové zobrazení a panely se skládají pod sebe. */
const MOBILE_QUERY = '(max-width: 767px)'

const subscribe = (cb: () => void) => {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}
