import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/lib/env' // motiv testovací instance před prvním vykreslením
import '@/hooks/use-install-app' // zachytí beforeinstallprompt co nejdřív
import { setUnauthorizedHandler } from '@/api/client'
import { createQueryClient } from '@/api/query-client'
import { ThemeProvider } from '@/components/theme'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { setupAppUpdates } from '@/lib/app-update'
import { createAppRouter } from './router'
import './index.css'

const queryClient = createQueryClient()
const router = createAppRouter(queryClient)

setupAppUpdates(router)

// Vypršelá session kdekoli v aplikaci → zahodit data a na přihlášení.
setUnauthorizedHandler(() => {
  if (router.state.location.pathname === '/login') return
  queryClient.clear()
  queryClient.setQueryData(['me'], null)
  void router.navigate({ to: '/login', replace: true })
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
