// Variables d'environnement publiques (config Firebase web). Aucun secret ici :
// la sécurité repose sur les Firestore Security Rules et App Check.
const read = (key: string): string | undefined => {
  const value = import.meta.env[key] as string | undefined
  return value && value.trim() !== '' ? value.trim() : undefined
}

const required = {
  apiKey: read('VITE_FIREBASE_API_KEY'),
  authDomain: read('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: read('VITE_FIREBASE_PROJECT_ID'),
  appId: read('VITE_FIREBASE_APP_ID'),
}

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key)

if (missing.length > 0) {
  // Échec explicite au démarrage plutôt qu'un comportement indéfini
  throw new Error(`Configuration Firebase incomplète : ${missing.join(', ')}`)
}

export const env = {
  firebase: {
    apiKey: required.apiKey as string,
    authDomain: required.authDomain as string,
    projectId: required.projectId as string,
    appId: required.appId as string,
  },
  // Optionnel en dev, obligatoire en production (App Check)
  appCheckSiteKey: read('VITE_APPCHECK_SITE_KEY'),
}
