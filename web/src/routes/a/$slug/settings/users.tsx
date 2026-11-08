import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api, unwrap } from '@/api/client'
import { useFirmMutation, useMembers } from '@/api/queries'
import type { Member, Role } from '@/api/types'
import { CardList, DataTable, EmptyRow, FormRow, NativeSelect, cardClass } from '@/components/common'
import { Hint, RowActions } from '@/components/settings/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFirm } from '@/hooks/use-firm'
import { roleLabel, roleLabels } from '@/lib/format'

export const Route = createFileRoute('/a/$slug/settings/users')({ component: UsersPage })

const roles: Role[] = ['owner', 'admin', 'worker']

const roleHints: Record<Role, string> = {
  owner: 'Plný přístup včetně správy vlastníků.',
  admin: 'Kancelář: nabídky, zakázky, faktury, ceník a nastavení.',
  worker: 'Parťák: vidí zakázky bez cen, nahrává fotky a mění stav zakázky. Nabídky, faktury ani ceník nevidí.',
}

function UsersPage() {
  const { slug, account } = useFirm()
  const { data: members } = useMembers(slug)
  const [editing, setEditing] = useState<Member | 'new' | null>(null)
  const del = useFirmMutation(slug, (id: number) => unwrap(api.DELETE('/api/accounts/{slug}/members/{id}', { params: { path: { slug, id } } })), [['members']])
  const list = members ?? []
  const canDelete = (m: Member) => m.role !== 'owner' || account.role === 'owner'
  const actions = (m: Member) =>
    canDelete(m) && (
      <RowActions
        onEdit={() => setEditing(m)}
        deleteTitle={`Odebrat uživatele ${m.name}?`}
        deleteDescription="Uživatel ztratí přístup do firmy. Zakázky, na kterých pracoval, zůstanou zachované."
        onDelete={() => del.mutateAsync(m.id).then(() => toast.success('Uživatel odebrán'))}
      />
    )
  const pending = (m: Member) =>
    m.pending && (
      <span
        className="ml-2 rounded-md bg-warning/15 px-1.5 py-0.5 text-xs font-normal text-warning-foreground dark:text-warning"
        title="Uživatel už má účet a do firmy se dostane, až pozvánku přijme."
      >
        Pozvánka
      </span>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Hint className="max-w-2xl flex-1">
          <b className="font-medium text-foreground">Parťák</b> vidí zakázky bez cen, nahrává k nim fotky a mění jejich stav. Nabídky, faktury ani ceník
          nevidí. <b className="font-medium text-foreground">Kancelář</b> může vše kromě odebrání vlastníka.
        </Hint>
        <Button onClick={() => setEditing('new')}>
          <PlusIcon /> Přidat uživatele
        </Button>
      </div>

      <CardList empty={members && list.length === 0 ? 'Zatím žádní uživatelé.' : undefined}>
        {list.map((m) => (
          <div key={m.id} className={cardClass}>
            <div className="flex items-start gap-2">
              <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(m)}>
                <span className="font-medium">{m.name}</span>
                {pending(m)}
                <span className="block truncate text-xs text-muted-foreground">
                  {roleLabel(m.role)} · {m.email}
                </span>
              </button>
              {actions(m)}
            </div>
          </div>
        ))}
      </CardList>

      <DataTable className="max-md:hidden">
        <thead>
          <tr>
            <th>Jméno</th>
            <th>E-mail</th>
            <th>Telefon</th>
            <th>Role</th>
            <th className="w-20" />
          </tr>
        </thead>
        <tbody>
          {members && list.length === 0 && <EmptyRow cols={5}>Zatím žádní uživatelé.</EmptyRow>}
          {list.map((m) => (
            <tr key={m.id}>
              <td className="font-medium">
                <button className="hover:underline" onClick={() => setEditing(m)}>
                  {m.name}
                </button>
                {pending(m)}
              </td>
              <td className="text-muted-foreground">{m.email}</td>
              <td className="whitespace-nowrap text-muted-foreground">{m.phone}</td>
              <td>{roleLabel(m.role)}</td>
              <td>{actions(m)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          {editing !== null && (
            <MemberForm
              key={editing === 'new' ? 'new' : editing.id}
              slug={slug}
              member={editing === 'new' ? undefined : editing}
              canOwner={account.role === 'owner'}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type Draft = {
  email: string
  password: string
  role: Role
  first_name: string
  last_name: string
  phone: string
}

function MemberForm({
  slug,
  member,
  canOwner,
  onDone,
}: {
  slug: string
  member?: Member
  canOwner: boolean
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(() => ({
    email: member?.email ?? '',
    password: '',
    role: member?.role ?? 'worker',
    first_name: member?.first_name ?? '',
    last_name: member?.last_name ?? '',
    phone: member?.phone ?? '',
  }))
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))

  const save = useFirmMutation(
    slug,
    async () => {
      const common = {
        role: d.role,
        first_name: d.first_name,
        last_name: d.last_name,
        phone: d.phone,
      }
      if (member) {
        return unwrap(
          api.PATCH('/api/accounts/{slug}/members/{id}', {
            params: { path: { slug, id: member.id } },
            body: { ...common, password: d.password || undefined },
          }),
        )
      }
      return unwrap(api.POST('/api/accounts/{slug}/members', { params: { path: { slug } }, body: { ...common, email: d.email, password: d.password || undefined } }))
    },
    [['members']],
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(undefined, {
          onSuccess: () => {
            toast.success('Uloženo')
            onDone()
          },
        })
      }}
      className="flex flex-col gap-4"
    >
      <DialogHeader>
        <DialogTitle>{member ? `Upravit uživatele` : 'Nový uživatel'}</DialogTitle>
        <DialogDescription>
          {member ? member.email : 'Pokud účet s tímto e-mailem už existuje, dostane uživatel pozvánku a do firmy se dostane po jejím přijetí.'}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 max-md:grid-cols-1 max-md:*:col-span-1 max-md:[&>div:empty]:hidden">
        <FormRow label="Role" htmlFor="role" hint={roleHints[d.role]} className="col-span-2">
          <NativeSelect id="role" value={d.role} onChange={(e) => set('role', e.target.value as Role)}>
            {roles
              .filter((r) => r !== 'owner' || canOwner || member?.role === 'owner')
              .map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
          </NativeSelect>
        </FormRow>

        <FormRow label="E-mail (přihlašovací jméno)" htmlFor="email" className="col-span-2">
          <Input id="email" type="email" required disabled={!!member} value={d.email} onChange={(e) => set('email', e.target.value)} />
        </FormRow>
        {(!member || member.password_reset) && (
          <FormRow
            label={member ? 'Nové heslo' : 'Heslo'}
            htmlFor="password"
            className="col-span-2"
            hint={member ? 'Vyplňte jen pokud chcete heslo změnit (min. 8 znaků).' : 'Min. 8 znaků. U existujícího účtu se heslo nemění.'}
          >
            <Input id="password" type="password" autoComplete="new-password" minLength={8} value={d.password} onChange={(e) => set('password', e.target.value)} />
          </FormRow>
        )}

        <div className="col-span-2 grid grid-cols-2 gap-x-4">
          <FormRow label="Jméno" htmlFor="first">
            <Input id="first" value={d.first_name} onChange={(e) => set('first_name', e.target.value)} />
          </FormRow>
          <FormRow label="Příjmení" htmlFor="last">
            <Input id="last" value={d.last_name} onChange={(e) => set('last_name', e.target.value)} />
          </FormRow>
        </div>
        <FormRow label="Telefon" htmlFor="phone">
          <Input id="phone" type="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} />
        </FormRow>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Zrušit
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {member ? 'Uložit' : 'Přidat uživatele'}
        </Button>
      </DialogFooter>
    </form>
  )
}
