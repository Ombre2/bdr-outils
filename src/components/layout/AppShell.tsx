import { useEffect, useState } from 'react'
import { BarChart3, Building2, CalendarCheck, FileSpreadsheet, LogOut, Repeat, Search, Sun, UserRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { Omnisearch } from '@/features/search/Omnisearch'
import { cn } from '@/lib/utils'

// Menu dans l'ordre d'usage : ce qu'on fait chaque jour en haut, les outils de suivi et de données en bas
const NAV_DAILY = [
  { to: '/today', label: 'Ma Journée', icon: CalendarCheck },
  { to: '/contacts', label: 'Contacts', icon: UserRound },
  { to: '/accounts', label: 'Comptes', icon: Building2 },
  { to: '/cadences', label: 'Cadences', icon: Repeat },
]

const NAV_TOOLS = [
  { to: '/dashboard', label: 'Tableau de bord', icon: BarChart3 },
  { to: '/import-export', label: 'Import / Export', icon: FileSpreadsheet },
]

export function AppShell() {
  const { logout, user } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)

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
      <aside className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex h-14 items-center gap-2 px-4 font-semibold tracking-tight">
          <Sun className="size-4 text-primary" aria-hidden />
          BDR Outils
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Navigation principale">
          {NAV_DAILY.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isActive && 'bg-accent font-medium text-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}

          <p className="mt-4 px-2.5 pb-1 text-xs text-muted-foreground">Outils</p>
          {NAV_TOOLS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isActive && 'bg-accent font-medium text-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-2">
          <p className="truncate px-2.5 pb-2 text-xs text-muted-foreground">{user?.email}</p>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => void logout()}>
            <LogOut className="size-4" aria-hidden />
            Se déconnecter
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
