import { GoogleAuthProvider, signInWithPopup, signOut, type User } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
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

/**
 * Rôle d'un email dans la liste blanche (ID du document = email en minuscules).
 * Renvoie null si l'email n'est pas autorisé ; '' si le rôle n'est pas renseigné.
 */
export async function getAllowlistRole(email: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'allowedUsers', email.trim().toLowerCase()))
    if (!snap.exists()) return null
    const role: unknown = snap.data().role
    return typeof role === 'string' ? role : ''
  } catch {
    // Les règles refusent la lecture hors liste blanche : on traite comme non autorisé
    return null
  }
}

/** Annuaire : associe l'identifiant du compte à son email, pour afficher le propriétaire aux admins. */
export async function saveUserDirectoryEntry(uid: string, email: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { email: email.trim().toLowerCase(), updatedAt: serverTimestamp() })
}

export async function logout(): Promise<void> {
  await signOut(auth)
}
