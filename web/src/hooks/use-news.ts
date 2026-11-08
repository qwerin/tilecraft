import { useMemo, useSyncExternalStore } from 'react'
import { changelogFor, markNewsSeen, seenNews } from '@/lib/changelog'
import { useFirm } from './use-firm'

const EVENT = 'tilecraft-news-seen'
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}
const snapshot = () => [...seenNews()].join()

/** Novinky pro roli přihlášeného uživatele, počet nepřečtených a označení za přečtené. */
export function useNews() {
  const { isManager } = useFirm()
  const entries = useMemo(() => changelogFor(isManager), [isManager])
  const seen = useSyncExternalStore(subscribe, snapshot)
  const seenIds = useMemo(() => new Set(seen.split(',')), [seen])
  const unread = entries.filter((e) => !seenIds.has(e.id)).length
  const markSeen = () => {
    markNewsSeen(entries.map((e) => e.id))
    window.dispatchEvent(new Event(EVENT))
  }
  return { entries, unread, seenIds, markSeen }
}
