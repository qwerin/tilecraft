import { createFileRoute, redirect } from '@tanstack/react-router'

// Nastavení je v podstránkách /settings/company, /settings/users, /settings/email.
export const Route = createFileRoute('/a/$slug/settings/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/a/$slug/settings/company', params, replace: true })
  },
})
