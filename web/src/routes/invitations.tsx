import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { MailIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api, unwrap } from '@/api/client'
import { meQuery } from '@/api/queries'
import type { MyAccount } from '@/api/types'
import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { roleLabel } from '@/lib/format'

// Pozvánky do firem: existující uživatel, kterého firma přidala, získá přístup až po přijetí.
export const Route = createFileRoute('/invitations')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
  },
  component: InvitationsPage,
})

function InvitationsPage() {
  const me = useQuery(meQuery).data
  const qc = useQueryClient()
  const navigate = useNavigate()
  const invitations = me?.invitations ?? []

  const accept = useMutation({
    mutationFn: (slug: string) => unwrap(api.POST('/api/auth/invitations/{slug}', { params: { path: { slug } } })),
    onSuccess: (next, slug) => {
      qc.setQueryData(['me'], next)
      toast.success('Pozvánka přijata')
      void navigate({ to: '/a/$slug', params: { slug } })
    },
  })
  const decline = useMutation({
    mutationFn: (slug: string) => unwrap(api.DELETE('/api/auth/invitations/{slug}', { params: { path: { slug } } })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] })
      toast.success('Pozvánka odmítnuta')
    },
  })
  const busy = accept.isPending || decline.isPending

  return (
    <AuthLayout
      title="Pozvánky do firem"
      subtitle={invitations.length ? 'Přístup do firmy získáte až po přijetí pozvánky.' : 'Nemáte žádné nevyřízené pozvánky.'}
    >
      <div className="flex flex-col gap-3 text-sm">
        {invitations.map((inv: MyAccount) => (
          <div key={inv.slug} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MailIcon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <strong className="font-semibold break-words">{inv.name}</strong>
                <span className="text-muted-foreground">Role: {roleLabel(inv.role)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => accept.mutate(inv.slug)}>
                Přijmout
              </Button>
              <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decline.mutate(inv.slug)}>
                Odmítnout
              </Button>
            </div>
          </div>
        ))}
        {!!me?.accounts.length && (
          <Button variant="link" onClick={() => void navigate({ to: '/' })}>
            Do aplikace
          </Button>
        )}
      </div>
    </AuthLayout>
  )
}
