# Prompt standard : convertir un fichier de contacts vers le format d'import

À utiliser chaque fois qu'un nouveau fichier arrive (export LinkedIn, CRM, Excel d'un salon…).
Le prompt ne demande pas de réécrire le fichier à la main : il demande un **profil de correspondance**,
puis l'outil `scripts/convert-contacts.mjs` applique les règles de façon identique à chaque fois.

---

## Le prompt (à copier)

> Tu prépares un fichier de contacts pour l'import dans l'application BDR Outils.
>
> **Étape 1 : analyse.** Lis les en-têtes du fichier et 5 lignes d'exemple. Pour chaque colonne, dis à quel champ
> de l'application elle correspond, ou « ignorée » si aucun champ ne convient. Signale les colonnes ambiguës
> (ex. « Address » : personne ou entreprise ?) et demande confirmation avant de continuer.
>
> **Champs de l'application** (une colonne par champ au maximum) :
> - `fullName` (nom complet, découpé : premier mot = prénom) **ou** `firstName` + `lastName`
> - `title` (poste), `accountName` (entreprise), `website`, `industry`, `headcount` (texte, ex. « 11-50 »)
> - `accountCountry`, `accountCity` (pays et ville de l'entreprise)
> - `country`, `city` (pays et ville de la personne : pilotent le fuseau horaire)
> - `description`, `source`, `status` (Cold, En cours, Qualifié, Disqualifié, Ne plus contacter)
> - `phones` : **toutes** les colonnes de numéros (une liste)
> - `emails` : **toutes** les colonnes d'emails (une liste)
>
> **Étape 2 : profil JSON.** Produis un fichier JSON au format suivant, sans rien inventer :
>
> ```json
> {
>   "name": "<nom du fichier>",
>   "fields": { "firstName": "<colonne>", "lastName": "<colonne>", "title": "<colonne>", "accountName": "<colonne>", "country": "<colonne>" },
>   "phones": ["<colonne>", "..."],
>   "emails": ["<colonne>", "..."],
>   "constants": { "source": "<origine du fichier>", "status": "Cold" },
>   "dedupe": ["<colonne identifiant unique, ex. URL de profil>"]
> }
> ```
>
> Les noms de colonnes doivent être copiés **exactement** tels qu'ils apparaissent dans le fichier.
>
> **Étape 3 : règles déjà gérées par l'outil** (ne pas les réécrire) :
> - numéros : espaces, tirets et points ignorés ; préfixe `00` remplacé par `+` ; indicatif sans `+` reconnu ;
>   plusieurs numéros dans une cellule séparés par `-`, `|`, `;`, `,`, `:`, `/` ou retour à la ligne ;
>   un numéro invalide est ignoré, pas le contact ;
> - un contact sans numéro valide est **rejeté** (règle de l'application) ;
> - doublons retirés (même identifiant, même numéro) ;
> - pays écrits en toutes lettres reconnus (« Côte d'Ivoire », « Sénégal »…) ; sinon champ vide et avertissement ;
> - emails : plusieurs par cellule possibles, invalides ignorés.
>
> **Étape 4 : commande** à lancer dans le dossier `bdr-outils` :
>
> ```powershell
> node scripts/convert-contacts.mjs --profile scripts/profiles/<profil>.json --input "<chemin du fichier>" --output "<fichier pret a importer>.csv" --report "<rapport rejets>.csv" --default-country <code pays par défaut>
> ```
>
> **Étape 5 : vérification.** Lis le résumé affiché (lignes lues, prêtes, rejetées, avertissements).
> Ouvre le rapport des rejets : si les raisons sont corrigeables dans le fichier source, corrige-le et relance.
> Ne modifie jamais le fichier prêt à importer à la main : corrige la source ou le profil, puis relance.

---

## Notes pour l'utilisateur

- **Un nouveau format** = un nouveau profil JSON dans `scripts/profiles/`. Le code de l'outil ne change pas.
- **Le fichier prêt à importer** utilise les mêmes en-têtes que le modèle (`Prénom`, `Nom`, `Téléphone`, `Email`…).
  Il est en point-virgule et en UTF-8, donc il s'ouvre dans Excel.
- **Données personnelles** : ces fichiers contiennent des données personnelles. Ne les envoyez pas à un outil externe
  et supprimez les copies inutiles après l'import.
- **Pays par défaut** (`--default-country`) : sert uniquement pour les numéros écrits sans indicatif
  quand le pays de la personne est inconnu. Pour Madagascar : `MG`.
