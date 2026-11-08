import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SaveIcon, ServerIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { api, unwrap } from '@/api/client'
import type { components } from '@/api/schema.gen'
import { Panel } from '@/components/common'
import { SwitchRow } from '@/components/settings/shared'
import { Button } from '@/components/ui/button'
import { mailServerInput, mailServerState } from '@/components/settings/mail-server'
import { MailServerFields } from '@/components/settings/mail-server-fields'

type Settings = components['schemas']['AdminSettings']
type MailInput = components['schemas']['AdminMailInput']

const key = ['admin', 'settings']

/** Nastavení celé aplikace (superadmin): odesílání e-mailů. Hodnoty z .env mají přednost a jsou jen ke čtení. */
export function InstanceSettings() {
  const { data } = useQuery({ queryKey: key, queryFn: () => unwrap(api.GET('/api/admin/settings')) })
  if (!data) return null
  return (
    <div className="flex flex-col gap-4">
      <MailForm key={JSON.stringify(data.mail)} st={data} />
    </div>
  )
}

function useSave<B>(path: '/api/admin/settings/mail') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: B) => unwrap(api.PUT(path, { body: body as never })),
    onSuccess: (r) => {
      qc.setQueryData(key, r)
      toast.success('Uloženo')
    },
  })
}

function EnvNote({ children }: { children: string }) {
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
      <ServerIcon className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  )
}

function MailForm({ st }: { st: Settings }) {
  const m = st.mail
  const env = m.source === 'env'
  const [server, setServer] = useState(() => mailServerState(m))
  const [live, setLive] = useState(m.live)
  const save = useSave<MailInput>('/api/admin/settings/mail')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate({ ...mailServerInput(server), live })
  }

  return (
    <Panel title="E-maily">
      <form onSubmit={submit}>
        {env && <EnvNote>Server pro odesílání je nastavený v prostředí serveru (.env) a má přednost. Tady lze jen zapnout ostré odesílání.</EnvNote>}
        {m.test_instance && <EnvNote>Testovací instance e-maily nikdy neodesílá, jen je ukládá na stránku E-maily.</EnvNote>}
        <p className="-mt-1 mb-4 text-xs text-muted-foreground">
          Server pro firmy, které nemají vlastní. Firma si vlastní (např. svůj Gmail) nastaví v Nastavení → E-mail.
        </p>
        <MailServerFields value={server} onChange={setServer} stored={m} noneLabel="Bez serveru aplikace" disabled={env} />
        <SwitchRow
          className="mt-3"
          label="Ostré odesílání"
          hint={
            m.live_source === 'env'
              ? 'Zapnuto v prostředí serveru (TILECRAFT_EMAIL_LIVE).'
              : 'Platí pro všechny firmy. Vypnuto = e-maily se neodesílají, jen se uloží na stránku E-maily. Bez serveru aplikace odesílají jen firmy s vlastním serverem.'
          }
          checked={live}
          onChange={(v) => m.live_source !== 'env' && setLive(v)}
        />
        <div className="mt-3 flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            <SaveIcon /> Uložit
          </Button>
        </div>
      </form>
    </Panel>
  )
}
