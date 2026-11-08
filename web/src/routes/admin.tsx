import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { CopyIcon, PlusIcon, ShieldIcon, TrashIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, unwrap } from '@/api/client'
import { meQuery } from '@/api/queries'
import type { AdminSignupCode } from '@/api/types'
import { DataTable, EmptyRow, FormRow, PageHeader } from '@/components/common'
import { EmailTestPanel } from '@/components/admin/email-test-panel'
import { InstanceSettings } from '@/components/admin/instance-settings'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { fmtDate, fmtDateTime } from '@/lib/format'

// Správa aplikace pro superadmina (TILECRAFT_SUPERADMINS): všechny firmy, registrační kódy, nastavení e-mailů (hodnoty z .env mají přednost) a test e-mailu.
export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me) throw redirect({ to: '/login' })
    if (!me.superadmin) throw redirect({ to: '/' })
  },
  component: AdminPage,
})

function AdminPage() {
  const me = useQuery(meQuery).data
  const accounts = useQuery({ queryKey: ['admin', 'accounts'], queryFn: () => unwrap(api.GET('/api/admin/accounts')) })
  const codes = useQuery({ queryKey: ['admin', 'codes'], queryFn: () => unwrap(api.GET('/api/admin/signup-codes')) })
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<AdminSignupCode | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const create = useMutation({
    mutationFn: (name: string) => unwrap(api.POST('/api/accounts', { body: { name } })),
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: ['me'] })
      void navigate({ to: '/a/$slug', params: { slug: a.slug } })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: number) => unwrap(api.DELETE('/api/admin/signup-codes/{id}', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'codes'] }),
  })
  const mine = new Set(me?.accounts.map((a) => a.slug))
  const today = new Date().toISOString()

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Logo />
        {!!me?.accounts.length && (
          <Button variant="outline" render={<Link to="/" />}>
            Moje firmy
          </Button>
        )}
      </div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldIcon className="size-5 text-primary" /> Správa aplikace
          </span>
        }
        description="Jako superadmin otevřete kteroukoli firmu (s právy vlastníka, členem se nestanete) a vydáváte registrační kódy pro nové firmy."
        actions={
          <Button
            variant="outline"
            onClick={() => {
              const name = window.prompt('Název nové firmy (budete jejím vlastníkem)')
              if (name?.trim()) create.mutate(name.trim())
            }}
          >
            <PlusIcon /> Nová firma
          </Button>
        }
      />

      <h2 className="mb-2 text-sm font-semibold">Firmy</h2>
      <DataTable className="mb-8">
        <thead>
          <tr>
            <th>Firma</th>
            <th>Vlastníci</th>
            <th className="text-right">Členů</th>
            <th className="text-right">Nabídek</th>
            <th>Poslední nabídka</th>
            <th>Založena</th>
          </tr>
        </thead>
        <tbody>
          {accounts.data?.items.map((a) => (
            <tr key={a.slug}>
              <td>
                <Link to="/a/$slug" params={{ slug: a.slug }} className="font-medium text-primary hover:underline">
                  {a.name}
                </Link>
                {mine.has(a.slug) && <span className="ml-2 text-xs text-muted-foreground">(jste členem)</span>}
              </td>
              <td className="text-muted-foreground">{a.owners.join(', ')}</td>
              <td className="text-right tabular-nums">{a.members}</td>
              <td className="text-right tabular-nums">{a.quotes}</td>
              <td>{a.last_quote_at ? fmtDate(a.last_quote_at) : '—'}</td>
              <td>{fmtDate(a.created_at)}</td>
            </tr>
          ))}
          {accounts.data?.items.length === 0 && <EmptyRow cols={6}>Žádné firmy.</EmptyRow>}
        </tbody>
      </DataTable>

      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Registrační kódy</h2>
        <Button size="sm" onClick={() => setCreating(true)}>
          <PlusIcon /> Nový kód
        </Button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Jednorázový kód založí jednu firmu. Pošlete ho spolu s odkazem na registraci; samotný kód se zobrazí jen při vytvoření.
      </p>
      <DataTable>
        <thead>
          <tr>
            <th>Pro koho</th>
            <th>Vytvořen</th>
            <th>Platí do</th>
            <th>Stav</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {codes.data?.items.map((c) => (
            <tr key={c.id}>
              <td>{c.note || '—'}</td>
              <td>{fmtDateTime(c.created_at)}</td>
              <td>{fmtDate(c.expires_at)}</td>
              <td>
                {c.used_at ? (
                  <>
                    Použit {fmtDate(c.used_at)} · {c.used_by_email}
                    {c.account_slug && (
                      <>
                        {' · '}
                        <Link to="/a/$slug" params={{ slug: c.account_slug }} className="text-primary hover:underline">
                          {c.account_name}
                        </Link>
                      </>
                    )}
                  </>
                ) : c.expires_at < today ? (
                  <span className="text-muted-foreground">Vypršel</span>
                ) : (
                  <span className="text-emerald-700 dark:text-emerald-400">Platný</span>
                )}
              </td>
              <td className="text-right">
                {!c.used_at && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Zrušit kód"
                    disabled={revoke.isPending}
                    onClick={() => {
                      if (window.confirm('Zrušit tento registrační kód?')) revoke.mutate(c.id)
                    }}
                  >
                    <TrashIcon />
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {codes.data?.items.length === 0 && <EmptyRow cols={5}>Zatím žádné kódy.</EmptyRow>}
        </tbody>
      </DataTable>

      {creating && (
        <NewCodeDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false)
            setIssued(c)
            void qc.invalidateQueries({ queryKey: ['admin', 'codes'] })
          }}
        />
      )}
      {issued && <IssuedCodeDialog code={issued} onClose={() => setIssued(null)} />}

      <h2 className="mt-8 mb-2 text-sm font-semibold">Nastavení aplikace</h2>
      <InstanceSettings />

      <div className="mt-4">
        <EmailTestPanel defaultTo={me?.email ?? ''} />
      </div>
    </div>
  )
}

function NewCodeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: AdminSignupCode) => void }) {
  const [note, setNote] = useState('')
  const [days, setDays] = useState('14')
  const create = useMutation({
    mutationFn: () => unwrap(api.POST('/api/admin/signup-codes', { body: { note: note.trim(), valid_days: Number(days) || 14 } })),
    onSuccess: onCreated,
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový registrační kód</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <FormRow label="Pro koho" htmlFor="note" hint="Jen pro vaši orientaci, např. název firmy.">
            <Input id="note" autoFocus maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormRow>
          <FormRow label="Platnost (dní)" htmlFor="days">
            <Input id="days" type="number" min={1} max={365} required value={days} onChange={(e) => setDays(e.target.value)} />
          </FormRow>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Zrušit
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Vytvořit kód
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function IssuedCodeDialog({ code, onClose }: { code: AdminSignupCode; onClose: () => void }) {
  const link = `${window.location.origin}/register?code=${encodeURIComponent(code.code ?? '')}`
  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast.success('Zkopírováno.'))
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrační kód je připravený</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Platí do {fmtDate(code.expires_at)} pro založení jedné firmy. Zkopírujte ho teď, později už ho neuvidíte.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-center font-mono text-lg tracking-wider">{code.code}</code>
          <Button variant="outline" size="icon" title="Kopírovat kód" onClick={() => copy(code.code ?? '')}>
            <CopyIcon />
          </Button>
        </div>
        <FormRow label="Odkaz na registraci s kódem">
          <div className="flex items-center gap-2">
            <Input readOnly value={link} onFocus={(e) => e.target.select()} />
            <Button variant="outline" size="icon" title="Kopírovat odkaz" onClick={() => copy(link)}>
              <CopyIcon />
            </Button>
          </div>
        </FormRow>
        <DialogFooter>
          <Button onClick={onClose}>Hotovo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
