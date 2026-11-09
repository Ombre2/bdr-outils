import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'

/** Verrou global : rien n'est rendu tant que la session n'est pas autorisée (Google vérifié + liste blanche). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    )
  }
  if (status !== 'authorized') return <Navigate to="/login" replace />

  return <>{children}</>
}
