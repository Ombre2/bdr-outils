import { Fragment, useEffect, useState } from 'react'
import { BarChart3, Building2, CalendarCheck, CalendarClock, FileSpreadsheet, History, LogOut, Menu, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Repeat, Search, Sun, UserRound, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import { NavLink, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { Omnisearch } from '@/features/search/Omnisearch'
import { cn } from '@/lib/utils'

// Menu par groupes, dans l'ordre d'usage : ce qu'on fait chaque jour, le travail de prospection, puis les outils
const NAV_GROUPS = [
  {
    title: 'Aujourd’hui',
    items: [
      { to: '/today', label: 'Ma Journée', icon: CalendarCheck },
      { to: '/meetings', label: 'Rendez-vous', icon: CalendarClock },
    ],
  },
  {
    title: 'Prospection',
    items: [
      { to: '/calls', label: 'Historique', icon: History },
      { to: '/contacts', label: 'Contacts', icon: UserRound },
      { to: '/accounts', label: 'Comptes', icon: Building2 },
      { to: '/cadences', label: 'Cadences', icon: Repeat },
    ],
  },
  {
    title: 'Outils',
    items: [
      { to: '/dashboard', label: 'Tableau de bord', icon: BarChart3 },
      { to: '/import-export', label: 'Import / Export', icon: FileSpreadsheet },
    ],
  },
]

// Cycle du thème : Système (défaut, suit l'ordinateur) → Clair → Sombre → Système
const THEME_CYCLE = {
  system: { next: 'light', icon: Monitor, label: 'Thème : système' },
  light: { next: 'dark', icon: Sun, label: 'Thème : clair' },
  dark: { next: 'system', icon: Moon, label: 'Thème : sombre' },
} as const

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse?: () => void // absent dans le tiroir du téléphone
  onNavigate?: () => void // ferme le tiroir après un clic
}

function Sidebar({ collapsed, onToggleCollapse, onNavigate }: SidebarProps) {
  const { logout, user } = useAuth()
  const { theme, setTheme } = useTheme()
  const currentTheme = THEME_CYCLE[(theme as keyof typeof THEME_CYCLE) ?? 'system'] ?? THEME_CYCLE.system
  const toggleLabel = collapsed ? 'Déplier le menu' : 'Replier le menu'

  function navLinkClass({ isActive }: { isActive: boolean }) {
    return cn(
      'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      isActive && 'bg-accent font-medium text-foreground',
      collapsed && 'justify-center px-0',
    )
  }

  return (
    <>
      <div className={cn('flex h-14 items-center gap-2 px-3 font-semibold tracking-tight', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <span className="flex items-center gap-2 px-1">
            <Sun className="size-4 text-primary" aria-hidden />
            BDR Outils
          </span>
        )}
        {onToggleCollapse && (
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} aria-label={toggleLabel} title={toggleLabel}>
            {collapsed ? <PanelLeftOpen className="size-4" aria-hidden /> : <PanelLeftClose className="size-4" aria-hidden />}
          </Button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Navigation principale">
        {NAV_GROUPS.map(({ title, items }, index) => (
          <Fragment key={title}>
            {collapsed ? (
              index > 0 && <div className="my-2 border-t border-border" aria-hidden />
            ) : (
              <p className={cn('px-2.5 pb-1 text-xs text-muted-foreground', index > 0 ? 'mt-4' : 'mt-1')}>{title}</p>
            )}
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={navLinkClass} title={label} aria-label={collapsed ? label : undefined} onClick={onNavigate}>
                <Icon className="size-4" aria-hidden />
                {!collapsed && label}
              </NavLink>
            ))}
          </Fragment>
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
    </>
  )
}

export function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false) // tiroir du menu, sur téléphone uniquement
  const [collapsed, setCollapsed] = useState(false) // menu replié : icônes seules, plus de place pour le contenu

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

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-border transition-[width] duration-200 md:flex',
          collapsed ? 'w-14' : 'w-56',
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-pointer bg-black/40"
            onClick={() => setMenuOpen(false)}
            aria-label="Fermer le menu"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-border bg-background shadow-lg">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2"
              onClick={() => setMenuOpen(false)}
              aria-label="Fermer le menu"
            >
              <X className="size-4" aria-hidden />
            </Button>
            <Sidebar collapsed={false} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4 md:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu">
            <Menu className="size-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full max-w-md justify-between text-muted-foreground"
            onClick={() => setSearchOpen(true)}
          >
            <span className="flex items-center gap-2">
              <Search className="size-4" aria-hidden />
              <span className="sm:hidden">Rechercher</span>
              <span className="hidden sm:inline">Rechercher un contact ou un compte</span>
            </span>
            <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-mono text-[11px] sm:inline-block">Ctrl K</kbd>
          </Button>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6 md:py-5">
          <Outlet />
        </main>
      </div>

      <Omnisearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
