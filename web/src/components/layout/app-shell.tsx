import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  BookOpenIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  ContactIcon,
  DownloadIcon,
  EllipsisIcon,
  FileTextIcon,
  HardHatIcon,
  HouseIcon,
  KeyRoundIcon,
  LogOutIcon,
  MailIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  ReceiptTextIcon,
  RulerIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  TagsIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api, unwrap } from '@/api/client'
import { meQuery } from '@/api/queries'
import { useInstallAction } from '@/components/install/use-install-action'
import { LogoMark, Logo } from '@/components/logo'
import { ThemeSegmented } from '@/components/theme'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useFirm } from '@/hooks/use-firm'
import { useNews } from '@/hooks/use-news'
import { useThemeChoice } from '@/hooks/use-theme-choice'
import { roleLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

// Rozvržení aplikace /a/$slug/…: na počítači tmavý panel vlevo (lze sbalit na ikony), na telefonu tmavá hlavička,
// spodní lišta (Přehled, Nabídky, + Zaměřit, Zakázky, Faktury, Více) a panel „Více“ se zbytkem menu.
// Parťák (worker) vidí jen Přehled a Zakázky (bez cen).

type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean; badge?: number }

const NAV = {
  home: { to: '/a/$slug', label: 'Přehled', icon: HouseIcon, exact: true },
  quotes: { to: '/a/$slug/quotes', label: 'Nabídky', icon: FileTextIcon },
  jobs: { to: '/a/$slug/jobs', label: 'Zakázky', icon: HardHatIcon },
  invoices: { to: '/a/$slug/invoices', label: 'Faktury', icon: ReceiptTextIcon },
  customers: { to: '/a/$slug/customers', label: 'Zákazníci', icon: ContactIcon },
  catalog: { to: '/a/$slug/catalog', label: 'Ceník', icon: TagsIcon },
  emails: { to: '/a/$slug/emails', label: 'E-maily', icon: MailIcon },
  settings: { to: '/a/$slug/settings', label: 'Nastavení', icon: SettingsIcon },
  account: { to: '/a/$slug/account', label: 'Můj účet', icon: KeyRoundIcon },
  news: { to: '/a/$slug/news', label: 'Novinky', icon: SparklesIcon },
  guides: { to: '/a/$slug/guides', label: 'Návody', icon: BookOpenIcon },
} satisfies Record<string, NavItem>

/** Hlavní akce: nové zaměření = nová nabídka (jen vlastník a kancelář). */
const NEW_MEASUREMENT = { to: '/a/$slug/quotes/new', label: 'Nové zaměření', short: 'Zaměřit' } as const

/** Sbalené menu na počítači (jen ikony) — pamatuje se v prohlížeči. */
const COLLAPSED_KEY = 'tilecraft.sidebar-collapsed'

function useCollapsedSidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1')
      } catch {
        // localStorage nedostupný (privátní režim)
      }
      return !c
    })
  return [collapsed, toggle] as const
}

/** Stránky, které smí otevřít parťák: Přehled, seznam a detail zakázky, Novinky, Návody a vlastní účet. */
function workerAllowed(path: string, slug: string): boolean {
  const rest = path.slice(`/a/${slug}`.length).replace(/\/$/, '')
  return rest === '' || rest === '/jobs' || /^\/jobs\/[^/]+$/.test(rest) || rest === '/news' || rest === '/account' || /^\/guides(\/[^/]+)?$/.test(rest)
}

export function AppShell({ children }: { children: ReactNode }) {
  const { slug, account, isManager } = useFirm()
  const path = useRouterState({ select: (s) => s.location.pathname })
  const news = useNews()
  const [collapsed, toggleCollapsed] = useCollapsedSidebar()

  const main: NavItem[] = isManager ? [NAV.home, NAV.quotes, NAV.jobs, NAV.invoices, NAV.customers, NAV.catalog] : [NAV.home, NAV.jobs]
  const firm: NavItem[] = isManager ? [NAV.emails, NAV.settings] : []
  const extra: NavItem[] = [{ ...NAV.news, badge: news.unread }, NAV.guides]

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside
        className={cn(
          'tile-grid sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground [--tile:36px] lg:flex print:hidden',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        <div className={cn('flex items-center gap-2 pt-5 pb-4', collapsed ? 'flex-col px-2' : 'justify-between pr-2 pl-5')}>
          <Link to="/a/$slug" params={{ slug }} aria-label="Přehled">
            <Logo tone="light" compact={collapsed} />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? 'Rozbalit menu' : 'Sbalit menu'}
            title={collapsed ? 'Rozbalit menu' : 'Sbalit menu'}
            className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            onClick={toggleCollapsed}
          >
            {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
          </Button>
        </div>
        {!collapsed && <FirmSwitcher />}
        {isManager && (
          <div className={cn('pb-3', collapsed ? 'px-2.5' : 'px-4')}>
            <Link
              to={NEW_MEASUREMENT.to}
              params={{ slug }}
              title={collapsed ? NEW_MEASUREMENT.label : undefined}
              className={cn(
                'flex h-10 items-center justify-center gap-2 rounded-xl bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground shadow-sm transition hover:brightness-105 active:scale-[0.98]',
                collapsed && 'size-11',
              )}
            >
              <RulerIcon className="size-4" />
              {!collapsed && NEW_MEASUREMENT.label}
            </Link>
          </div>
        )}
        <nav className={cn('flex-1 overflow-y-auto py-2', collapsed ? 'px-2.5' : 'px-3')}>
          <SideNav items={main} slug={slug} compact={collapsed} />
          {firm.length > 0 && (
            <>
              {collapsed ? (
                <div className="mx-2 my-3 border-t border-sidebar-border" />
              ) : (
                <p className="mt-6 mb-1.5 px-3 text-[11px] font-semibold tracking-[0.12em] text-sidebar-foreground/45 uppercase">Firma</p>
              )}
              <SideNav items={firm} slug={slug} compact={collapsed} />
            </>
          )}
          <div className={cn('my-3 border-t border-sidebar-border', collapsed ? 'mx-2' : 'mx-3')} />
          <SideNav items={extra} slug={slug} compact={collapsed} />
        </nav>
        <UserMenu compact={collapsed} />
      </aside>

      <MobileHeader />

      <main className="pb-tabbar min-w-0 flex-1 px-4 pt-4 lg:px-8 lg:pt-7 lg:pb-10 print:p-0">
        {account.visiting && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-warning/50 bg-warning/12 px-3 py-2 text-sm print:hidden">
            <ShieldIcon className="size-4 shrink-0" />
            <span className="flex-1">Jste ve firmě jako správce aplikace s právy vlastníka; členové vás v seznamu uživatelů nevidí.</span>
            <Link to="/admin" className="font-medium underline">
              Zpět na správu
            </Link>
          </div>
        )}
        {!isManager && !workerAllowed(path, slug) ? (
          <p className="text-sm text-muted-foreground">Tato stránka je jen pro vlastníka a kancelář. Parťák má k dispozici Přehled a Zakázky.</p>
        ) : (
          children
        )}
      </main>

      <TabBar main={main} more={[...main.slice(isManager ? 4 : 2), ...firm, NAV.account, ...extra]} newsBadge={news.unread} />
    </div>
  )
}

function SideNav({ items, slug, compact }: { items: NavItem[]; slug: string; compact?: boolean }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((it) => (
        <li key={it.to}>
          <Link
            to={it.to}
            params={{ slug }}
            activeOptions={{ exact: it.exact }}
            title={compact ? it.label : undefined}
            className={cn(
              'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
              'data-[status=active]:bg-sidebar-accent data-[status=active]:font-medium data-[status=active]:text-sidebar-foreground',
              compact && 'justify-center px-0',
            )}
          >
            <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-sidebar-primary opacity-0 group-data-[status=active]:opacity-100" />
            <it.icon className="size-[18px] shrink-0 group-data-[status=active]:text-sidebar-primary" />
            {compact ? (
              !!it.badge && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-sidebar-primary" />
            ) : (
              <>
                <span className="flex-1 truncate">{it.label}</span>
                {!!it.badge && (
                  <span className="rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold text-sidebar-primary-foreground">{it.badge}</span>
                )}
              </>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Horní lišta na telefonu: značka, firma (přepínač) a odkaz na účet. */
function MobileHeader() {
  const { slug } = useFirm()
  const me = useQuery(meQuery).data
  return (
    <header className="sticky top-0 z-30 bg-sidebar pt-[env(safe-area-inset-top)] text-sidebar-foreground shadow-sm lg:hidden print:hidden">
      <div className="flex h-14 items-center gap-2 px-3">
        <Link to="/a/$slug" params={{ slug }} aria-label="Přehled">
          <LogoMark className="size-8" />
        </Link>
        <FirmSwitcher variant="header" />
        <Link
          to="/a/$slug/account"
          params={{ slug }}
          aria-label="Můj účet"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold"
        >
          {initials(me?.name || me?.email)}
        </Link>
      </div>
    </header>
  )
}

/** Spodní lišta na telefonu se středovým tlačítkem Nové zaměření a panelem Více. */
function TabBar({ main, more, newsBadge }: { main: NavItem[]; more: NavItem[]; newsBadge: number }) {
  const { slug, isManager } = useFirm()
  const [open, setOpen] = useState(false)
  const path = useRouterState({ select: (s) => s.location.pathname })
  // položky z „Více“ podsvítí záložku Více
  const moreActive = more.some((it) => path.startsWith(it.to.replace('$slug', slug)))
  const tabs = isManager ? main.slice(0, 4) : main.slice(0, 2)
  const tab = (it: NavItem) => (
    <Link
      key={it.to}
      to={it.to}
      params={{ slug }}
      activeOptions={{ exact: it.exact }}
      className="group flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground data-[status=active]:font-semibold data-[status=active]:text-foreground"
    >
      <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-data-[status=active]:bg-primary/12 group-data-[status=active]:text-primary">
        <it.icon className="size-5" />
      </span>
      {it.label}
    </Link>
  )
  return (
    <nav
      aria-label="Hlavní menu"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_-8px_oklch(0_0_0/0.15)] backdrop-blur lg:hidden print:hidden"
    >
      <div className={cn('mx-auto grid h-16 max-w-xl items-stretch', isManager ? 'grid-cols-6' : 'grid-cols-3')}>
        {tabs.slice(0, 2).map(tab)}
        {isManager && (
          <Link
            to={NEW_MEASUREMENT.to}
            params={{ slug }}
            aria-label={NEW_MEASUREMENT.label}
            className="flex flex-col items-center justify-end gap-0.5 pb-1.5 text-[11px] font-semibold text-primary"
          >
            <span className="-mt-5 flex size-13 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition active:scale-95">
              <PlusIcon className="size-6" strokeWidth={2.5} />
            </span>
            {NEW_MEASUREMENT.short}
          </Link>
        )}
        {isManager && tabs.slice(2).map(tab)}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn('group relative flex flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground', moreActive && 'font-semibold text-foreground')}
        >
          <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-primary/12 text-primary')}>
            <EllipsisIcon className="size-5" />
          </span>
          Více
          {newsBadge > 0 && <span className="absolute top-2 right-[calc(50%-14px)] size-2 rounded-full bg-primary" />}
        </button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetTitle className="sr-only">Více</SheetTitle>
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-muted-foreground/25" />
          <div className="grid grid-cols-3 gap-2 p-4">
            {more.map((it) => (
              <Link
                key={it.to}
                to={it.to}
                params={{ slug }}
                onClick={() => setOpen(false)}
                className="relative flex flex-col items-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-xs font-medium shadow-xs active:bg-muted data-[status=active]:border-primary/50 data-[status=active]:bg-primary/8"
              >
                <it.icon className="size-5 text-primary" />
                {it.label}
                {!!it.badge && (
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{it.badge}</span>
                )}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-3 border-t px-4 pt-4 pb-5">
            <ThemeSegmented />
            <AccountActions onDone={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}

/** Instalace aplikace a odhlášení (panel Více na telefonu). */
function AccountActions({ onDone }: { onDone: () => void }) {
  const installApp = useInstallAction()
  const logout = useLogout()
  return (
    <div className="flex gap-2">
      {installApp.available && (
        <Button variant="outline" className="h-10 flex-1" onClick={installApp.run}>
          <DownloadIcon /> Nainstalovat
        </Button>
      )}
      <Button
        variant="outline"
        className="h-10 flex-1 text-destructive"
        onClick={() => {
          onDone()
          logout.mutate()
        }}
      >
        <LogOutIcon /> Odhlásit se
      </Button>
      {installApp.dialog}
    </div>
  )
}

function useLogout() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/auth/logout')),
    onSettled: () => {
      qc.clear()
      qc.setQueryData(['me'], null)
      void navigate({ to: '/login' })
    },
  })
}

function initials(name: string | undefined) {
  return (name || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Přepínač firem (uživatel může být ve více firmách), pozvánky, správa aplikace a založení další firmy. */
function FirmSwitcher({ variant = 'sidebar' }: { variant?: 'sidebar' | 'header' }) {
  const { account } = useFirm()
  const me = useQuery(meQuery).data
  const navigate = useNavigate()
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: (name: string) => unwrap(api.POST('/api/accounts', { body: { name } })),
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: ['me'] })
      void navigate({ to: '/a/$slug', params: { slug: a.slug } })
    },
  })
  const header = variant === 'header'
  return (
    <div className={header ? 'min-w-0 flex-1' : 'px-4 pb-4'}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex w-full items-center gap-2 text-left text-sm',
            header ? 'rounded-lg px-1.5 py-1 active:bg-sidebar-accent' : 'rounded-xl bg-sidebar-accent/70 px-3 py-2 hover:bg-sidebar-accent',
          )}
        >
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate font-semibold', header && 'font-heading text-base leading-tight')}>{account.name}</span>
            {!header && <span className="block truncate text-xs text-sidebar-foreground/55">{roleLabel(account.role)}</span>}
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Firmy</DropdownMenuLabel>
            {me?.accounts.map((a) => (
              <DropdownMenuItem key={a.slug} onClick={() => void navigate({ to: '/a/$slug', params: { slug: a.slug } })}>
                <span className="flex-1 truncate">{a.name}</span>
                {a.slug === account.slug && <CheckIcon className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {!!me?.invitations.length && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void navigate({ to: '/invitations' })}>
                <span className="flex-1 truncate">Pozvánky do firem</span>
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">{me.invitations.length}</span>
              </DropdownMenuItem>
            </>
          )}
          {me?.superadmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void navigate({ to: '/admin' })}>
                <ShieldIcon className="size-4" /> Správa aplikace
              </DropdownMenuItem>
            </>
          )}
          {(me?.superadmin || me?.accounts.some((a) => a.role === 'owner')) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  const name = window.prompt('Název nové firmy')
                  if (name?.trim()) create.mutate(name.trim())
                }}
              >
                <PlusIcon className="size-4" /> Nová firma
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Uživatel dole v panelu na počítači: motiv, účet, instalace, odhlášení. */
function UserMenu({ compact }: { compact?: boolean }) {
  const me = useQuery(meQuery).data
  const { slug, account } = useFirm()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useThemeChoice()
  const installApp = useInstallAction()
  const logout = useLogout()
  return (
    <div className={cn('border-t border-sidebar-border', compact ? 'p-2' : 'p-3')}>
      <DropdownMenu>
        <DropdownMenuTrigger
          title={compact ? me?.name || me?.email : undefined}
          className={cn('flex w-full items-center gap-2.5 rounded-lg py-1.5 text-left hover:bg-sidebar-accent', compact ? 'justify-center px-0' : 'px-2')}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
            {initials(me?.name || me?.email)}
          </span>
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me?.name || me?.email}</span>
              <span className="block truncate text-xs text-sidebar-foreground/55">{roleLabel(account.role)}</span>
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
            {resolvedTheme === 'dark' ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            {resolvedTheme === 'dark' ? 'Světlý režim' : 'Tmavý režim'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void navigate({ to: '/a/$slug/account', params: { slug } })}>
            <KeyRoundIcon className="size-4" /> Můj účet
          </DropdownMenuItem>
          {installApp.available && (
            <DropdownMenuItem onClick={installApp.run}>
              <DownloadIcon className="size-4" /> Nainstalovat aplikaci
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => logout.mutate()} className="text-destructive">
            <LogOutIcon className="size-4" /> Odhlásit se
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {installApp.dialog}
    </div>
  )
}
