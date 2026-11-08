import { createFileRoute, redirect } from '@tanstack/react-router'
import { meQuery } from '@/api/queries'

// Úvod: přihlášený uživatel jde do první firmy, bez firmy na pozvánky, správu (superadmin) nebo registraci,
// jinak na přihlášení.
export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    const first = me.accounts[0]
    if (!first) throw redirect({ to: me.invitations.length ? '/invitations' : me.superadmin ? '/admin' : '/register' })
    throw redirect({ to: '/a/$slug', params: { slug: first.slug } })
  },
})
