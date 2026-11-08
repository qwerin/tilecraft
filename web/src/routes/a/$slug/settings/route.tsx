import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/common'
import { useFirm } from '@/hooks/use-firm'

export const Route = createFileRoute('/a/$slug/settings')({
  component: SettingsLayout,
})

const tabs = [
  { to: '/a/$slug/settings/company', label: 'Firma' },
  { to: '/a/$slug/settings/users', label: 'Uživatelé' },
  { to: '/a/$slug/settings/email', label: 'E-mail' },
] as const

// Nastavení firmy rozdělené do podstránek; každá se ukládá sama. Jen vlastník a kancelář (admin).
function SettingsLayout() {
  const { slug, isManager } = useFirm()
  if (!isManager) return <p className="text-sm text-muted-foreground">Nastavení může měnit jen vlastník nebo kancelář.</p>
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Nastavení" description="Údaje firmy, uživatelé a odesílání e-mailů.">
        <nav className="-mb-px flex gap-1 overflow-x-auto border-b">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              params={{ slug }}
              className="shrink-0 border-b-2 border-transparent px-3 pb-2 text-sm text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-medium data-[status=active]:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <Outlet />
    </div>
  )
}
