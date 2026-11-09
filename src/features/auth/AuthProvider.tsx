import { onAuthStateChanged, type User } from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { auth } from '@/services/firebase'
import { hasVerifiedGoogleSession, isAllowlisted, logout as doLogout } from '@/services/auth.service'

export type AuthStatus =
  | 'loading'
  | 'signed-out'
  | 'authorized' // compte Google vérifié + présent dans la liste blanche

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Déconnexion automatique après inactivité (données sensibles)
const IDLE_LIMIT_MS = 15 * 60 * 1000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'mousemove', 'scroll'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let cancelled = false

    const unsubscribe = onAuthStateChanged(auth, async (current) => {
      if (cancelled) return

      if (!current) {
        setUser(null)
        setStatus('signed-out')
        return
      }

      const verified = await hasVerifiedGoogleSession(current)
      const allowed = verified && current.email != null && (await isAllowlisted(current.email))

      if (allowed) {
        setUser(current)
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

  const value = useMemo(() => ({ status, user, logout }), [status, user, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook exporté avec le provider : le fast-refresh peut signaler un avertissement, sans impact fonctionnel.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
