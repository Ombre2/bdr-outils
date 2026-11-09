# CLAUDE.md — Règles de développement « BDR Outils »

Ce fichier est lu automatiquement par Claude Code. Il fixe les règles à respecter pour toute modification du projet, y compris par un développeur ou un assistant qui rejoint le projet.

Écrit pour : développeurs et assistants IA qui touchent au code. L'interface et les messages utilisateur sont en **français**.

## 1. Contexte

- Application web de suivi de prospection (BDR) : comptes, contacts (plusieurs téléphones et emails), appels, activités, cadences, tableau de bord, import / export CSV.
- Utilisateurs : une équipe restreinte de BDR, connexion Google. Le propriétaire des données est l'utilisateur connecté (`ownerId`).
- L'utilisateur final est **non technique**. Les réponses et comptes rendus doivent être courts, en français, sans jargon inutile.

## 2. Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4 + composants shadcn/ui (dans `src/components/ui/`)
- Icônes : lucide-react. Notifications : sonner. Routage : react-router. Formulaires : react-hook-form + zod
- Firebase : Auth (Google), Firestore, Hosting. Offre Spark.
- Tests : vitest (unitaires), @firebase/rules-unit-testing (règles Firestore)

## 3. Commandes

| Action | Commande |
|---|---|
| Développement | `npm run dev` |
| Vérification des types | `npm run typecheck` |
| Tests unitaires | `npm test` |
| Tests des règles Firestore | `npm run test:rules` (nécessite le JDK 21 et l'émulateur Firestore) |
| Lint | `npm run lint` |
| Build | `npm run build` |

Avant de dire qu'une modification est terminée : `typecheck`, `test` et `build` doivent passer. Si une règle Firestore change : `test:rules` doit passer aussi.

## 4. Organisation du code

- `src/features/<domaine>/` : pages et dialogues par domaine (contacts, calls, accounts, cadences, today, dashboard, import-export, auth, search).
- `src/services/*.repo.ts` : **seul endroit** qui parle à Firestore. Les composants n'importent jamais `firebase/firestore` directement.
- `src/lib/` : logique pure (calculs, formats, parsing). Chaque logique non triviale a un test `*.test.ts` à côté.
- `src/types/models.ts` : types et listes de valeurs autorisées (`CALL_OUTCOMES`, `STATUSES`, `CADENCE_CHANNELS`, etc.). Une valeur ajoutée ici doit être ajoutée aussi dans `firebase/firestore.rules`.
- `src/features/directory/DirectoryProvider.tsx` : chargement central des données (contacts, comptes, cadences). Passer par lui plutôt que de recharger à la main.
- `firebase/` : règles Firestore, index, tests de règles (`firebase/tests/`).

## 5. Modèle de données

- Les téléphones, emails et l'historique de statut sont des **sous-collections** : `contacts/{id}/phones`, `contacts/{id}/emails`, `contacts/{id}/statusHistory`. Ne pas les remettre dans le document contact.
- Le document `contacts` garde des champs simples (`status`, `cadenceId`, `cadenceStep`…).
- Les `activities`, `cadences` et `calls` sont des collections de premier niveau avec `ownerId`.
- Toute requête multi-documents filtre sur `ownerId == user.uid`, sauf pour l'admin (voir section 6).
- Les dates sont stockées avec `serverTimestamp()` pour `createdAt` / `updatedAt`. Les dates saisies par l'utilisateur (date d'appel, date d'activité) sont refusées si elles sont dans le futur.
- **Pas de batch sur les sous-collections** pour la modification de téléphones : les règles actuelles refusent ce cas en production. Écrire document par document (`updateDoc`).

## 6. Sécurité (non négociable)

- **Firestore est la seule source de vérité.** Pas de cache local persistant ni de stockage navigateur pour des données métier (`memoryLocalCache` uniquement).
- Toute nouvelle collection ou nouveau champ doit avoir une règle dans `firebase/firestore.rules`, avec un test dans `firebase/tests/rules.test.ts`.
- Règles : tout est refusé par défaut. Accès réservé aux utilisateurs connectés, Google vérifié et présents dans la liste autorisée. Les données sont accessibles à leur propriétaire.
- Rôle admin (`allowedUsers/{email}.role == 'admin'`, défini dans la console seulement) : **lecture seule** sur les données de toute l'équipe, pour consultation et tableau de bord. Aucune écriture ni suppression pour l'admin : les règles le refusent et l'interface masque les boutons d'écriture (`teamView` dans `DirectoryProvider`).
- Annuaire `users/{uid}` : chaque BDR écrit uniquement sa propre entrée (email), l'admin la lit pour afficher le propriétaire. Un BDR ne lit que la sienne.
- L'historique (`statusHistory`) n'est pas modifiable : création et suppression seulement.
- Ne jamais écrire de secret, de token ou de clé d'API dans le code ou dans ce fichier. Ne jamais utiliser `firebase login:ci`.

## 7. Actions qui demandent une confirmation explicite

Claude Code et les développeurs doivent **demander avant** :

- **Déployer** (Firebase Hosting ou règles) : seulement si l'utilisateur dit « déploie » ou « deploy » clairement pour ce changement précis.
- **Supprimer des données** (contacts, comptes, appels, historiques, cadences, doublons) : seulement après une confirmation explicite. Regarder d'abord ce qui sera supprimé et le montrer.
- **Écraser** des données importées ou modifier en masse.
- **Committer ou pousser** : seulement si demandé.

Pour le déploiement des règles, depuis la racine du projet (là où se trouve `firebase.json`) :

```
node node_modules/firebase-tools/lib/bin/firebase.js deploy --only firestore:rules --project bdr-outils < /dev/null
```

## 8. Règles de code

- **TypeScript strict.** Pas de `any`. Les types viennent de `src/types/models.ts`.
- Pas de `console.log` laissé dans le code.
- Erreurs : les services lèvent des erreurs typées (`*InputError`, `DataError`). Les composants les attrapent et affichent un `toast.error` en français, lisible par un non-technicien. Ne jamais afficher un message technique brut à l'utilisateur.
- Chargement : afficher un état de chargement (texte ou `Loader2`) pendant toute action asynchrone, et désactiver le bouton pendant l'action.
- Boutons cliquables : `cursor-pointer` (le composant `Button` le gère, vérifier pour les éléments custom).
- Textes d'interface : français, avec les espaces insécables avant `:`, `?`, `!` et guillemets français « » quand cela suit la typographie existante.
- Pas de nouvelle dépendance sans accord. Utiliser ce qui est déjà installé.
- Pas de code mort, pas de fichier commenté laissé en place.
- Commentaires : en français, seulement si le « pourquoi » n'est pas évident.

## 9. Interface

- Menu : les éléments du quotidien en haut (Ma Journée, Contacts, Comptes, Cadences), les outils en bas (Tableau de bord, Import / Export). Voir `AppShell.tsx`.
- La fiche contact (`ContactDetailPage.tsx`) est l'écran central : éviter d'ajouter des modales quand une action peut tenir dans la carte.
- Vérifier le rendu dans le navigateur (`npm run dev`) pour tout changement visuel. Dire clairement ce qui n'a pas été testé.

## 10. Données importées

- Le module d'import passe par `src/lib/csv-import.ts` et `src/services/import.service.ts`. Toute évolution doit garder la validation des lignes.
- Des doublons issus des imports précédents existent encore. Ne pas les nettoyer sans confirmation (voir section 7).
- Un contrôle de doublons à l'import (ex. URL LinkedIn) est prévu mais pas encore en place.

## 11. Avant de livrer une modification

1. `npm run typecheck`, `npm test` et `npm run build` passent.
2. Si les règles ou les types de données ont changé : `npm run test:rules` passe.
3. Les textes visibles sont en français et les messages d'erreur sont compréhensibles.
4. La liste des fichiers modifiés et ce qui reste à tester dans le navigateur est donnée à l'utilisateur.
5. Aucun déploiement, aucune suppression et aucun commit n'ont été faits sans accord.
