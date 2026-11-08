import { toast } from 'sonner'
import { Workbox } from 'workbox-window'
import type { createAppRouter } from '@/router'

// Nové vydání: service worker (skipWaiting + clientsClaim) převezme otevřenou stránku, ta ale dál běží se starým JS a CSS.
// Aplikace proto po převzetí nabídne načtení a sama se načte při nejbližším přechodu na jinou stránku, aby uživatel
// nepřišel o rozpracovaný formulář. Nová verze se hledá i při návratu do okna a každých 30 minut.
export function setupAppUpdates(router: ReturnType<typeof createAppRouter>) {
  // starý JS chunk po nasazení na serveru už není → načíst stránku znovu (cílová adresa už je v URL)
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault()
    window.location.reload()
  })

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return

  let pending = false
  const reload = () => window.location.reload()
  const wb = new Workbox('/sw.js', { scope: '/' })
  wb.addEventListener('controlling', (e) => {
    if (!e.isUpdate) return
    pending = true
    toast.info('Je k dispozici nová verze aplikace.', {
      id: 'app-update',
      duration: Infinity,
      description: 'Načte se sama při přechodu na jinou stránku.',
      action: { label: 'Načíst hned', onClick: reload },
    })
  })
  router.subscribe('onResolved', () => {
    if (pending) reload()
  })

  void wb.register().then((reg) => {
    if (!reg) return
    const check = () => {
      if (navigator.onLine) void reg.update().catch(() => {})
    }
    setInterval(check, 30 * 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  })
}
