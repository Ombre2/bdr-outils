import { GoogleAuthProvider, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/services/firebase'

const provider = new GoogleAuthProvider()
// Toujours proposer le choix du compte (évite de rester sur un mauvais compte partagé)
provider.setCustomParameters({ prompt: 'select_account' })

/** Connexion via Google. La 2FA est gérée par Google sur le compte. */
export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, provider)
}

/** Vrai si la session est un compte Google dont l'adresse est vérifiée. */
export async function hasVerifiedGoogleSession(user: User): Promise<boolean> {
  const result = await user.getIdTokenResult()
  const firebaseClaims = result.claims.firebase as { sign_in_provider?: string } | undefined
  return firebaseClaims?.sign_in_provider === 'google.com' && result.claims.email_verified === true
}

/** Vrai si l'email figure dans la liste blanche (ID du document = email en minuscules). */
export async function isAllowlisted(email: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'allowedUsers', email.trim().toLowerCase()))
    return snap.exists()
  } catch {
    // Les règles refusent la lecture hors liste blanche : on traite comme non autorisé
    return false
  }
}

export async function logout(): Promise<void> {
  await signOut(auth)
}
