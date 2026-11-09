import { initializeApp } from 'firebase/app'
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check'
import { browserSessionPersistence, getAuth, setPersistence } from 'firebase/auth'
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore'
import { env } from '@/lib/env'

const app = initializeApp(env.firebase)

if (env.appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth = getAuth(app)

// Session limitée à l'onglet : fermer l'onglet déconnecte. Aucune persistance longue durée.
await setPersistence(auth, browserSessionPersistence)

// Cache mémoire uniquement : aucune donnée métier n'est persistée localement (IndexedDB désactivé).
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
})
