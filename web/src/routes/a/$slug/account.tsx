import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, unwrap } from '@/api/client'
import { useApiTokens, useOAuthGrants } from '@/api/queries'
import { Confirm, FormRow, PageHeader, Panel } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { fmtDate, fmtDateTime } from '@/lib/format'

export const Route = createFileRoute('/a/$slug/account')({ component: AccountPage })

function AccountPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Můj účet" />
      <PasswordPanel />
      <McpPanel />
      <TokensPanel />
    </div>
  )
}

function PasswordPanel() {
  const qc = useQueryClient()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const change = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/password', { body: { current, new: next } })),
    onSuccess: () => {
      toast.success('Heslo změněno. Ostatní zařízení, API tokeny a připojené aplikace byly odpojeny.')
      setCurrent('')
      setNext('')
      setAgain('')
      void qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
  return (
    <Panel title="Změna hesla" className="max-w-md">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (next !== again) {
            toast.error('Nová hesla se neshodují.')
            return
          }
          change.mutate()
        }}
      >
        <FormRow label="Současné heslo" htmlFor="cur">
          <Input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </FormRow>
        <FormRow label="Nové heslo" htmlFor="new" hint="Alespoň 8 znaků">
          <Input id="new" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
        </FormRow>
        <FormRow label="Nové heslo znovu" htmlFor="again">
          <Input id="again" type="password" autoComplete="new-password" minLength={8} required value={again} onChange={(e) => setAgain(e.target.value)} />
        </FormRow>
        <Button type="submit" disabled={change.isPending} className="self-start">
          Změnit heslo
        </Button>
      </form>
    </Panel>
  )
}

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success('Zkopírováno.'))
}

/** Adresa MCP serveru a aplikace připojené přes OAuth (konektory AI asistentů). */
function McpPanel() {
  const qc = useQueryClient()
  const { data: grants } = useOAuthGrants()
  const url = `${window.location.origin}/api/mcp`
  const revoke = useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/auth/oauth-grants/{id}', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'oauth-grants'] }),
  })
  return (
    <Panel title="AI asistent (MCP)">
      <p className="mb-3 text-sm text-muted-foreground">
        V nastavení AI asistenta přidejte vlastní konektor (MCP) s touto adresou. Při připojení se přihlásíte a přístup
        povolíte. Asistent pak pracuje se zakázkami, plánem a fakturami s vašimi oprávněními.
      </p>
      <div className="mb-4 flex gap-2">
        <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button variant="outline" onClick={() => copy(url)}>
          <CopyIcon /> Kopírovat
        </Button>
      </div>
      <h3 className="mb-2 text-sm font-medium">Připojené aplikace</h3>
      {!grants?.length ? (
        <p className="text-sm text-muted-foreground">Žádná aplikace není připojená.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {grants.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{g.client_name}</div>
                <div className="text-xs text-muted-foreground">
                  Připojeno {fmtDate(g.created_at)} · naposledy použito {fmtDateTime(g.last_used_at)}
                </div>
              </div>
              <Confirm
                title="Odpojit aplikaci?"
                description={`${g.client_name} ztratí přístup. Pro další použití ji bude potřeba připojit znovu.`}
                confirm="Odpojit"
                onConfirm={() => revoke.mutateAsync(g.id)}
                trigger={(open) => (
                  <Button variant="ghost" size="sm" onClick={open}>
                    Odpojit
                  </Button>
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Osobní API tokeny pro klienty bez OAuth (Authorization: Bearer tc_…). */
function TokensPanel() {
  const qc = useQueryClient()
  const { data: tokens } = useApiTokens()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [days, setDays] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['me', 'tokens'] })
  const create = useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/tokens', { body: { name, expires_in_days: Number(days) || undefined } })),
    onSuccess: (t) => {
      setCreating(false)
      setName('')
      setDays('')
      setCreated(t.token)
      void refresh()
    },
  })
  const del = useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/auth/tokens/{id}', { params: { path: { id } } })),
    onSuccess: refresh,
  })
  return (
    <Panel
      title="API tokeny"
      actions={
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <PlusIcon /> Nový token
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Pro AI asistenty a skripty bez přihlašování přes prohlížeč: token se posílá v hlavičce <code>Authorization: Bearer …</code>. Změna hesla
        všechny tokeny zruší.
      </p>
      {!tokens?.length ? (
        <p className="text-sm text-muted-foreground">Zatím žádné tokeny.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {t.name} <span className="font-mono text-xs text-muted-foreground">{t.prefix}…</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Vytvořen {fmtDate(t.created_at)} · platnost {t.expires_at ? `do ${fmtDate(t.expires_at)}` : 'neomezená'} · naposledy použit{' '}
                  {fmtDateTime(t.last_used_at)}
                </div>
              </div>
              <Confirm
                title="Smazat token?"
                description="Aplikace, které ho používají, ztratí přístup."
                onConfirm={() => del.mutateAsync(t.id)}
                trigger={(open) => (
                  <Button variant="ghost" size="icon" aria-label="Smazat token" onClick={open}>
                    <Trash2Icon />
                  </Button>
                )}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nový API token</DialogTitle>
            <DialogDescription>Token má stejná oprávnění jako vy ve všech vašich firmách.</DialogDescription>
          </DialogHeader>
          <form
            id="token-form"
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate()
            }}
          >
            <FormRow label="Název" htmlFor="token-name" hint="Např. AI asistent na notebooku">
              <Input id="token-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </FormRow>
            <FormRow label="Platnost (dní)" htmlFor="token-days" hint="Prázdné = neomezeně">
              <Input id="token-days" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
            </FormRow>
          </form>
          <DialogFooter>
            <Button type="submit" form="token-form" disabled={create.isPending}>
              Vytvořit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={created !== null} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Token vytvořen</DialogTitle>
            <DialogDescription>Zkopírujte si ho teď, znovu už zobrazit nepůjde.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={created ?? ''} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => created && copy(created)}>
              <CopyIcon /> Kopírovat
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Hotovo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  )
}
