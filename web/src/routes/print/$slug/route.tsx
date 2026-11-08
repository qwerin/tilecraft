import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { PrinterIcon } from 'lucide-react'
import { accountQuery, meQuery } from '@/api/queries'
import { Button } from '@/components/ui/button'

// Tiskové stránky: bez navigace aplikace, bílý papír A4, tlačítko tisku mimo tisk.
export const Route = createFileRoute('/print/$slug')({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    await context.queryClient.ensureQueryData(accountQuery(params.slug))
  },
  component: () => (
    <div className="min-h-dvh bg-muted/60 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex w-[210mm] justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <PrinterIcon /> Vytisknout
        </Button>
      </div>
      <div className="mx-auto flex w-[210mm] flex-col gap-6 print:w-auto print:gap-0">
        <Outlet />
      </div>
    </div>
  ),
})
