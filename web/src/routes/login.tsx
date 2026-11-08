import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { api, unwrap } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { AuthLayout } from '@/components/auth-layout'
import { FormRow } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// `redirect` vrací po přihlášení zpět (např. na souhlas s připojením aplikace); jen cesty v rámci aplikace.
export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional().catch(undefined) }),
  component: LoginPage,
})

function LoginPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { redirect } = Route.useSearch()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const login = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/login', { body: { email, password } })),
    meta: { silent: true },
    onSuccess: (me) => {
      qc.clear()
      qc.setQueryData(['me'], me)
      if (redirect?.startsWith('/') && !redirect.startsWith('//')) void navigate({ href: redirect })
      else void navigate({ to: '/' })
    },
  })
  return (
    <AuthLayout title="Přihlášení" subtitle="Vítejte zpět" footer={<>Nová firma? <Link to="/register" className="text-primary hover:underline">Zaregistrujte se</Link></>}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate()
        }}
      >
        <FormRow label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormRow>
        <FormRow label="Heslo" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormRow>
        {login.isError && <p className="text-sm text-destructive">{errorMessage(login.error)}</p>}
        <Button type="submit" size="lg" disabled={login.isPending}>
          Přihlásit se
        </Button>
      </form>
    </AuthLayout>
  )
}
