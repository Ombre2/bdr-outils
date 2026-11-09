# BDR Outils

Outil de suivi d'activité BDR : comptes, contacts, appels, rappels, dashboard, import/export CSV.
Accès réservé à un administrateur et aux BDR autorisés, avec second facteur TOTP obligatoire.

## Démarrage local

```bash
npm install
cp .env.example .env.local   # renseigner la config Firebase Web
npm run dev
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Typecheck + build de production |
| `npm run lint` | oxlint |
| `npm run test` | Tests unitaires (`src/`) |
| `npm run test:rules` | Tests des Firestore Security Rules sur l'émulateur (nécessite Java 21) |

## Firebase

Les fichiers sont dans `firebase/`. Le déploiement se fait depuis la racine :

```bash
npx firebase --config firebase/firebase.json deploy --only firestore:rules,firestore:indexes
npx firebase --config firebase/firebase.json deploy --only hosting
```

## Checklist de sécurité avant mise en production

Plan Spark : connexion Google uniquement. Le TOTP de Firebase (Identity Platform) n'est pas disponible sans plan Blaze.

- [ ] Fournisseur Google activé dans Authentication > Sign-in method
- [ ] Document `allowedUsers/{email en minuscules}` créé pour chaque personne autorisée (console uniquement)
- [ ] 2FA imposée sur les comptes Google des BDR (Google Workspace : admin.google.com > Sécurité > Authentification en deux étapes). Non vérifiable par les règles.
- [ ] App Check activé avec la clé `VITE_APPCHECK_SITE_KEY` (optionnel au début, obligatoire avant production)
- [ ] `npm run test:rules` vert
- [ ] Domaine Firebase Hosting en HTTPS uniquement, en-têtes vérifiés (`firebase/firebase.json`)

## Structure

- `src/app/` : routeur, garde d'accès (`RequireAuth`)
- `src/features/auth/` : connexion, enrôlement TOTP, contexte d'authentification
- `src/services/` : initialisation Firebase et services d'authentification (seul module qui touche Firebase)
- `src/lib/` : configuration et utilitaires
- `firebase/` : règles, index, configuration Hosting, tests de règles
