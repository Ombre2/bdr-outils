import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { auth } from '@/services/firebase'
import {
  getAllowlistRole,
  hasVerifiedGoogleSession,
  logout as doLogout,
  saveUserDirectoryEntry,
} from '@/services/auth.service'

export type AuthStatus =
  | 'loading'
  | 'signed-out'
  | 'authorized' // compte Google vérifié + présent dans la liste blanche

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  /** Admin : lecture seule sur les données de toute l'équipe (rôle « admin » dans la liste blanche). */
  isAdmin: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Rôle admin par défaut : aucun droit d'écriture (les règles le refusent aussi)
const ADMIN_ROLE = 'admin'

// Déconnexion automatique après inactivité (données sensibles)
const IDLE_LIMIT_MS = 15 * 60 * 1000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'mousemove', 'scroll'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let cancelled = false

    const unsubscribe = onAuthStateChanged(auth, async (current) => {
      if (cancelled) return

      if (!current) {
        setUser(null)
        setIsAdmin(false)
        setStatus('signed-out')
        return
      }

      const verified = await hasVerifiedGoogleSession(current)
      const role = verified && current.email != null ? await getAllowlistRole(current.email) : null

      if (role !== null && current.email) {
        // Annuaire mis à jour à chaque connexion : l'admin y retrouve le nom du propriétaire
        try {
          await saveUserDirectoryEntry(current.uid, current.email)
        } catch {
          // Non bloquant : l'annuaire sera mis à jour à la prochaine connexion
        }
        setUser(current)
        setIsAdmin(role === ADMIN_ROLE)
        setStatus('authorized')
      } else {
        toast.error('Accès non autorisé pour ce compte.')
        await doLogout()
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const logout = useCallback(async () => {
    await doLogout()
  }, [])

  // Inactivité : déconnexion après 15 minutes sans interaction
  const timerRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (status !== 'authorized') return

    const arm = () => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        toast('Session fermée après inactivité.')
        void doLogout()
      }, IDLE_LIMIT_MS)
    }

    arm()
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, arm, { passive: true }))
    return () => {
      window.clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, arm))
    }
  }, [status])

  const value = useMemo(() => ({ status, user, isAdmin, logout }), [status, user, isAdmin, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook exporté avec le provider : le fast-refresh peut signaler un avertissement, sans impact fonctionnel.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
