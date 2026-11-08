import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { accountQuery, meQuery } from '@/api/queries'
import { AppShell } from '@/components/layout/app-shell'

export const Route = createFileRoute('/a/$slug')({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    // superadmin otevře i firmu, jejímž není členem
    if (!me.superadmin && !me.accounts.some((a) => a.slug === params.slug)) throw redirect({ to: '/' })
    await context.queryClient.ensureQueryData(accountQuery(params.slug))
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
})
