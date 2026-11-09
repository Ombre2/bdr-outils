import { useEffect, useState } from 'react'
import { BarChart3, Building2, CalendarCheck, CalendarClock, FileSpreadsheet, LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Repeat, Search, Sun, UserRound } from 'lucide-react'
import { useTheme } from 'next-themes'
import { NavLink, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { Omnisearch } from '@/features/search/Omnisearch'
import { cn } from '@/lib/utils'

// Menu dans l'ordre d'usage : ce qu'on fait chaque jour en haut, les outils de suivi et de données en bas
const NAV_DAILY = [
  { to: '/today', label: 'Ma Journée', icon: CalendarCheck },
  { to: '/meetings', label: 'Rendez-vous', icon: CalendarClock },
  { to: '/contacts', label: 'Contacts', icon: UserRound },
  { to: '/accounts', label: 'Comptes', icon: Building2 },
  { to: '/cadences', label: 'Cadences', icon: Repeat },
]

const NAV_TOOLS = [
  { to: '/dashboard', label: 'Tableau de bord', icon: BarChart3 },
  { to: '/import-export', label: 'Import / Export', icon: FileSpreadsheet },
]

// Cycle du thème : Système (défaut, suit l'ordinateur) → Clair → Sombre → Système
const THEME_CYCLE = {
  system: { next: 'light', icon: Monitor, label: 'Thème : système' },
  light: { next: 'dark', icon: Sun, label: 'Thème : clair' },
  dark: { next: 'system', icon: Moon, label: 'Thème : sombre' },
} as const

export function AppShell() {
  const { logout, user } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false) // menu replié : icônes seules, plus de place pour le contenu
  const { theme, setTheme } = useTheme()
  const currentTheme = THEME_CYCLE[(theme as keyof typeof THEME_CYCLE) ?? 'system'] ?? THEME_CYCLE.system

  // Ctrl+K / Cmd+K : recherche accessible partout
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const toggleLabel = collapsed ? 'Déplier le menu' : 'Replier le menu'

  function navLinkClass({ isActive }: { isActive: boolean }) {
    return cn(
      'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      isActive && 'bg-accent font-medium text-foreground',
      collapsed && 'justify-center px-0',
    )
  }

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <aside className={cn('flex shrink-0 flex-col border-r border-border transition-[width] duration-200', collapsed ? 'w-14' : 'w-56')}>
        <div className={cn('flex h-14 items-center gap-2 px-3 font-semibold tracking-tight', collapsed ? 'justify-center' : 'justify-between')}>
          {!collapsed && (
            <span className="flex items-center gap-2 px-1">
              <Sun className="size-4 text-primary" aria-hidden />
              BDR Outils
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={() => setCollapsed((c) => !c)} aria-label={toggleLabel} title={toggleLabel}>
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Navigation principale">
          {NAV_DAILY.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass} title={label} aria-label={collapsed ? label : undefined}>
              <Icon className="size-4" aria-hidden />
              {!collapsed && label}
            </NavLink>
          ))}

          {collapsed ? (
            <div className="my-2 border-t border-border" aria-hidden />
          ) : (
            <p className="mt-4 px-2.5 pb-1 text-xs text-muted-foreground">Outils</p>
          )}
          {NAV_TOOLS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass} title={label} aria-label={collapsed ? label : undefined}>
              <Icon className="size-4" aria-hidden />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-2">
          {!collapsed && <p className="truncate px-2.5 pb-2 text-xs text-muted-foreground">{user?.email}</p>}
          <Button
            variant="ghost"
            size="sm"
            className={cn('mb-0.5 w-full', collapsed ? 'justify-center px-0' : 'justify-start')}
            onClick={() => setTheme(currentTheme.next)}
            title={currentTheme.label}
            aria-label={currentTheme.label}
          >
            <currentTheme.icon className="size-4" aria-hidden />
            {!collapsed && currentTheme.label}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn('w-full', collapsed ? 'justify-center px-0' : 'justify-start')}
            onClick={() => void logout()}
            title="Se déconnecter"
            aria-label="Se déconnecter"
          >
            <LogOut className="size-4" aria-hidden />
            {!collapsed && 'Se déconnecter'}
          </Button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-6">
          <Button
            variant="outline"
            size="sm"
            className="w-full max-w-md justify-between text-muted-foreground"
            onClick={() => setSearchOpen(true)}
          >
            <span className="flex items-center gap-2">
              <Search className="size-4" aria-hidden />
              Rechercher un contact ou un compte
            </span>
            <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px]">Ctrl K</kbd>
          </Button>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <Outlet />
        </main>
      </div>

      <Omnisearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
