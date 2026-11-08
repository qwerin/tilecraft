import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { api, unwrap } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { AuthLayout } from '@/components/auth-layout'
import { FormRow } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Registrace firmy; s kódem z odkazu správce (/register?code=…) je pole kódu předvyplněné.
export const Route = createFileRoute('/register')({
  validateSearch: z.object({ code: z.string().optional() }),
  component: RegisterPage,
})

function RegisterPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const signup = useQuery({ queryKey: ['signup'], queryFn: () => unwrap(api.GET('/api/auth/signup')), staleTime: Infinity })
  const [f, setF] = useState({ firm: '', name: '', email: '', password: '', code: search.code ?? '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const reg = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/register', { body: f })),
    meta: { silent: true },
    onSuccess: (me) => {
      qc.clear()
      qc.setQueryData(['me'], me)
      void navigate({ to: '/a/$slug', params: { slug: me.accounts[0].slug } })
    },
  })
  return (
    <AuthLayout title="Nová firma" subtitle="Založte firmu a pozvěte do ní kancelář i parťáky." footer={<>Máte účet? <Link to="/login" className="text-primary hover:underline">Přihlaste se</Link></>}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          reg.mutate()
        }}
      >
        {(signup.data?.code_required || !!search.code) && (
          <FormRow label="Registrační kód" htmlFor="code" hint="Kód vám pošle správce aplikace.">
            <Input id="code" required autoComplete="off" spellCheck={false} value={f.code} onChange={set('code')} />
          </FormRow>
        )}
        <FormRow label="Název firmy" htmlFor="firm">
          <Input id="firm" required autoFocus value={f.firm} onChange={set('firm')} />
        </FormRow>
        <FormRow label="Vaše jméno" htmlFor="name">
          <Input id="name" required autoComplete="name" value={f.name} onChange={set('name')} />
        </FormRow>
        <FormRow label="E-mail" htmlFor="email">
          <Input id="email" type="email" required autoComplete="username" value={f.email} onChange={set('email')} />
        </FormRow>
        <FormRow label="Heslo" htmlFor="password" hint="Alespoň 8 znaků">
          <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} />
        </FormRow>
        {reg.isError && <p className="text-sm text-destructive">{errorMessage(reg.error)}</p>}
        <Button type="submit" size="lg" disabled={reg.isPending}>
          Založit firmu
        </Button>
      </form>
    </AuthLayout>
  )
}
