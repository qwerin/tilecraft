import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useLocation, useNavigate } from '@tanstack/react-router'
import { ArrowUpRightIcon, BanIcon, CheckIcon, PlugIcon } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { api, unwrap } from '@/api/client'
import { errorMessage, isApiError } from '@/api/errors'
import { meQuery, oauthConsentQuery } from '@/api/queries'
import type { Me, OAuthAuthorizeParams, OAuthConsent } from '@/api/types'
import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

// Souhlas s připojením aplikace (OAuth pro MCP klienty, např. konektor AI asistenta). Sem posílá prohlížeč
// discovery serveru; parametry žádosti se jen předají API (ověří je backend) a po rozhodnutí se odchází
// na adresu z odpovědi (`redirect_to`). Při chybné žádosti nikdy nepřesměrováváme.
const param = z.string().optional().catch(undefined)
const searchSchema = z.object({
  client_id: param,
  redirect_uri: param,
  response_type: param,
  state: param,
  code_challenge: param,
  code_challenge_method: param,
  scope: param,
  resource: param,
})

export const Route = createFileRoute('/oauth/authorize')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login', search: { redirect: location.href }, replace: true })
  },
  component: AuthorizePage,
})

const TITLE = 'Připojit aplikaci'

function AuthorizePage() {
  const search = Route.useSearch()
  const params: OAuthAuthorizeParams = {
    client_id: search.client_id ?? '',
    redirect_uri: search.redirect_uri ?? '',
    response_type: search.response_type ?? '',
    code_challenge: search.code_challenge ?? '',
    code_challenge_method: search.code_challenge_method ?? '',
    state: search.state,
    scope: search.scope,
    resource: search.resource,
  }
  const consent = useQuery(oauthConsentQuery(params))
  const me = useQuery(meQuery)

  if (consent.isPending || me.isPending) {
    return (
      <AuthLayout title={TITLE}>
        <div className="flex justify-center py-8">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      </AuthLayout>
    )
  }
  if (consent.isError) {
    const err = consent.error
    const message =
      isApiError(err) && err.status === 422 && !err.code.startsWith('oauth_')
        ? 'Žádost aplikace o přístup je neúplná nebo neplatná. Zkuste aplikaci připojit znovu.'
        : errorMessage(err)
    return (
      <AuthLayout title="Aplikaci nelze připojit" subtitle={message}>
        <Button variant="outline" onClick={() => window.location.assign('/')}>
          Do aplikace
        </Button>
      </AuthLayout>
    )
  }
  return <ConsentView params={params} consent={consent.data} me={me.data ?? null} />
}

const can = [
  'Číst nabídky, zakázky, zákazníky, ceník a faktury ve všech vašich firmách.',
  'Zakládat a upravovat nabídky, zaměření, zákazníky a ceník.',
  'Vše se stejnými oprávněními, jaká máte vy.',
]

function ConsentView({ params, consent, me }: { params: OAuthAuthorizeParams; consent: OAuthConsent; me: Me | null }) {
  // Po úspěchu prohlížeč odchází na adresu aplikace — tlačítka zůstanou zamčená až do opuštění stránky.
  const [leaving, setLeaving] = useState<boolean | null>(null)
  const decide = useMutation({
    mutationFn: (approve: boolean) => unwrap(api.POST('/api/oauth/authorize', { body: { ...params, approve } })),
    onSuccess: ({ redirect_to }, approve) => {
      setLeaving(approve)
      window.location.assign(redirect_to)
    },
  })
  const busy = decide.isPending || leaving !== null
  const pending = (approve: boolean) => (decide.isPending && decide.variables === approve) || leaving === approve

  return (
    <AuthLayout title={TITLE}>
      <div className="flex flex-col gap-6 text-sm">
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PlugIcon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-base">
                <strong className="font-semibold break-words">{consent.client_name}</strong> chce přístup k vašemu účtu
              </p>
              <p className="text-xs text-muted-foreground">Název uvádí sama aplikace. Povolte přístup, jen pokud jste ji právě připojovali vy.</p>
            </div>
          </div>
          <div className="flex flex-col gap-0.5 rounded-lg bg-muted px-3 py-2.5">
            <span className="text-xs text-muted-foreground">Po povolení se vrátíte na</span>
            <span className="flex min-w-0 items-center gap-1.5 font-semibold">
              <span className="min-w-0 break-all">{consent.redirect_host}</span>
              <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </span>
          </div>
          {me && <SignedInAs me={me} />}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-medium">Aplikace bude moci</h2>
          <ul className="flex flex-col gap-2">
            {can.map((text) => (
              <li key={text} className="flex gap-2.5">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{text}</span>
              </li>
            ))}
            <li className="flex gap-2.5">
              <BanIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>Nic nesmaže, nic nepošle zákazníkovi a nezmění nastavení ani uživatele.</span>
            </li>
          </ul>
          <p className="text-muted-foreground">
            Přístup můžete kdykoli zrušit v <em>Můj účet → Připojené aplikace</em>.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button size="lg" disabled={busy} onClick={() => decide.mutate(true)}>
            {pending(true) && <Spinner />}
            Povolit přístup
          </Button>
          <Button size="lg" variant="outline" disabled={busy} onClick={() => decide.mutate(false)}>
            {pending(false) && <Spinner />}
            Zamítnout
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}

/** Kdo je přihlášený + přepnutí na jiný účet (odhlásit a zpět přes přihlášení sem). */
function SignedInAs({ me }: { me: Me }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const href = useLocation({ select: (l) => l.href })
  const logout = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSettled: () => {
      qc.clear()
      qc.setQueryData(['me'], null)
      void navigate({ to: '/login', search: { redirect: href }, replace: true })
    },
  })
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3">
      <p className="min-w-0 text-muted-foreground">
        Přihlášeni jako <strong className="font-medium break-all text-foreground">{me.name ? `${me.name} (${me.email})` : me.email}</strong>
      </p>
      <Button variant="link" size="sm" className="h-auto px-0" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Přihlásit jiným účtem
      </Button>
    </div>
  )
}
