import { useState } from 'react'
import { Navigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { signInWithGoogle } from '@/services/auth.service'

export function LoginPage() {
  const { status } = useAuth()
  const [busy, setBusy] = useState(false)

  if (status === 'authorized') return <Navigate to="/" replace />

  async function handleGoogle() {
    setBusy(true)
    try {
      await signInWithGoogle()
      // AuthProvider valide la liste blanche et prend le relais
    } catch (error) {
      // Fenêtre fermée par l'utilisateur : pas d'erreur à afficher
      if ((error as { code?: string }).code !== 'auth/popup-closed-by-user') {
        toast.error('Connexion impossible. Réessayez.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">BDR Outils</h1>
          <p className="text-sm text-muted-foreground">Connexion avec votre compte Google professionnel.</p>
        </header>
        <Button type="button" className="w-full" onClick={() => void handleGoogle()} disabled={busy}>
          Se connecter avec Google
        </Button>
      </div>
    </main>
  )
}
