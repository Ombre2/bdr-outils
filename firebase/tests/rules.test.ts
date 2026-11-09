import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { Timestamp, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const RULES = readFileSync(path.resolve(here, '../firestore.rules'), 'utf8')

// Identités de test. La liste blanche est indexée par email en minuscules.
const ADMIN = { uid: 'uid-admin', email: 'johny.andriarilalao@spoonconsulting.com' }
const BDR_A = { uid: 'uid-bdr-a', email: 'bdr.a@example.com' }
const BDR_B = { uid: 'uid-bdr-b', email: 'bdr.b@example.com' }

// Token Google valide : fournisseur google.com + adresse vérifiée
const googleClaims = (email: string, overrides: Record<string, unknown> = {}) => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
  ...overrides,
})

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'bdr-outils-test',
    firestore: { rules: RULES },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  // Seed : admin + deux BDR autorisés (ID = email), un contact appartenant à BDR_A
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'allowedUsers', ADMIN.email), { role: 'admin' })
    await setDoc(doc(db, 'allowedUsers', BDR_A.email), { role: 'bdr' })
    await setDoc(doc(db, 'allowedUsers', BDR_B.email), { role: 'bdr' })
    await setDoc(doc(db, 'contacts', 'c1'), {
      ownerId: BDR_A.uid,
      accountId: 'a1',
      firstName: 'Awa',
      lastName: 'Koné',
      status: 'Cold',
      statusChangedAt: Timestamp.now(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  })
})

function ctxFor(user: { uid: string; email: string }, claims?: Record<string, unknown>) {
  return env.authenticatedContext(user.uid, claims ?? googleClaims(user.email)).firestore()
}

const validAccount = (ownerId: string) => ({
  ownerId,
  name: 'Acme Corp',
  website: 'https://acme.example',
  industry: 'Logiciel',
  headcount: '11-50',
  source: null,
  description: null,
  country: 'CI',
  city: 'Abidjan',
  timezone: 'Africa/Abidjan',
  searchName: 'acme corp',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

describe('Accès global : Google vérifié + liste blanche', () => {
  it('refuse la lecture sans authentification', async () => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'accounts', 'a1')))
  })

  it('refuse une adresse Google non vérifiée', async () => {
    const db = ctxFor(BDR_A, googleClaims(BDR_A.email, { email_verified: false }))
    await assertFails(getDoc(doc(db, 'contacts', 'c1')))
  })

  it('refuse une connexion par mot de passe (seul Google est accepté)', async () => {
    const db = ctxFor(BDR_A, googleClaims(BDR_A.email, { firebase: { sign_in_provider: 'password' } }))
    await assertFails(getDoc(doc(db, 'contacts', 'c1')))
  })

  it('refuse un compte Google absent de la liste blanche', async () => {
    const intrus = { uid: 'uid-intrus', email: 'intrus@example.com' }
    await assertFails(getDoc(doc(ctxFor(intrus), 'contacts', 'c1')))
  })

  it('accepte un email avec majuscules (comparaison en minuscules)', async () => {
    const db = ctxFor({ uid: BDR_A.uid, email: 'BDR.A@Example.com' })
    await assertSucceeds(getDoc(doc(db, 'contacts', 'c1')))
  })

  it('refuse à un utilisateur autorisé de modifier allowedUsers', async () => {
    const db = ctxFor(BDR_A)
    await assertFails(setDoc(doc(db, 'allowedUsers', BDR_A.email), { role: 'admin' }))
    await assertFails(setDoc(doc(db, 'allowedUsers', 'nouveau@example.com'), { role: 'bdr' }))
  })

  it("refuse de lire l'entrée de liste blanche d'un autre", async () => {
    await assertSucceeds(getDoc(doc(ctxFor(BDR_A), 'allowedUsers', BDR_A.email)))
    await assertFails(getDoc(doc(ctxFor(BDR_A), 'allowedUsers', BDR_B.email)))
  })

  it('refuse toute collection non listée (deny-by-default)', async () => {
    const db = ctxFor(BDR_A)
    await assertFails(setDoc(doc(db, 'secrets', 'x'), { value: 1 }))
    await assertFails(getDoc(doc(db, 'secrets', 'x')))
  })
})

describe('Propriété des données (ownerId)', () => {
  it('un BDR lit ses propres contacts', async () => {
    await assertSucceeds(getDoc(doc(ctxFor(BDR_A), 'contacts', 'c1')))
  })

  it("un autre BDR ne lit PAS le contact d'un collègue", async () => {
    await assertFails(getDoc(doc(ctxFor(BDR_B), 'contacts', 'c1')))
  })

  it("un BDR ne peut pas créer une fiche au nom d'un autre", async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_B), 'accounts', 'a2'), validAccount(BDR_A.uid)))
  })

  it("un BDR ne peut pas changer ownerId d'une fiche existante", async () => {
    const db = ctxFor(BDR_A)
    await assertFails(updateDoc(doc(db, 'contacts', 'c1'), { ownerId: BDR_B.uid, updatedAt: serverTimestamp() }))
  })
})

describe('Comptes', () => {
  it('crée un compte valide avec son propre ownerId', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'accounts', 'a2'), validAccount(BDR_A.uid)))
  })

  it('refuse un nom trop long', async () => {
    const bad = { ...validAccount(BDR_A.uid), name: 'x'.repeat(121) }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'accounts', 'a2'), bad))
  })

  it('refuse un champ inconnu (hasOnly)', async () => {
    const bad = { ...validAccount(BDR_A.uid), isAdmin: true }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'accounts', 'a2'), bad))
  })

  it('refuse un site web en http (non https)', async () => {
    const bad = { ...validAccount(BDR_A.uid), website: 'http://acme.example' }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'accounts', 'a2'), bad))
  })

  it('refuse un code pays invalide', async () => {
    const bad = { ...validAccount(BDR_A.uid), country: "Cote d'Ivoire" }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'accounts', 'a2'), bad))
  })
})

describe('Contacts', () => {
  const validContact = (ownerId: string) => ({
    ownerId,
    accountId: 'a1',
    accountName: 'Acme Corp',
    firstName: 'Awa',
    lastName: 'Koné',
    title: 'DRH',
    email: 'awa.kone@acme.example',
    description: null,
    source: null,
    status: 'Cold',
    country: 'CI',
    city: 'Abidjan',
    timezone: 'Africa/Abidjan',
    nextReminderAt: null,
    lastCallAt: null,
    statusChangedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  it('crée un contact valide', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c2'), validContact(BDR_A.uid)))
  })

  it('refuse un statut hors liste fermée', async () => {
    const bad = { ...validContact(BDR_A.uid), status: 'Chaud' }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c2'), bad))
  })

  it('refuse un email mal formé', async () => {
    const bad = { ...validContact(BDR_A.uid), email: 'pas un email' }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c2'), bad))
  })

  it('refuse un ancien champ phone unique (remplacé par la sous-collection)', async () => {
    const bad = { ...validContact(BDR_A.uid), phone: '+2250700000000' }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c2'), bad))
  })

  it('refuse un createdAt fourni par le client (horodatage serveur obligatoire)', async () => {
    const bad = { ...validContact(BDR_A.uid), createdAt: Timestamp.fromDate(new Date('2020-01-01')) }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c2'), bad))
  })

  it('un BDR peut supprimer son contact', async () => {
    await assertSucceeds(deleteDoc(doc(ctxFor(BDR_A), 'contacts', 'c1')))
  })

  it("un BDR ne peut pas supprimer le contact d'un autre", async () => {
    await assertFails(deleteDoc(doc(ctxFor(BDR_B), 'contacts', 'c1')))
  })
})

describe('Numéros de téléphone (sous-collection)', () => {
  const validPhone = (ownerId: string) => ({
    ownerId,
    number: '+2250700000000',
    label: 'Mobile',
    isPrimary: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  it('ajoute un numéro valide à son contact', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c1', 'phones', 'p1'), validPhone(BDR_A.uid)))
  })

  it('refuse un numéro non E.164 (espaces)', async () => {
    const bad = { ...validPhone(BDR_A.uid), number: '+225 07 00 00 00' }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c1', 'phones', 'p2'), bad))
  })

  it('refuse un numéro sans préfixe +', async () => {
    const bad = { ...validPhone(BDR_A.uid), number: '0700000000' }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c1', 'phones', 'p2'), bad))
  })

  it('refuse un libellé hors liste', async () => {
    const bad = { ...validPhone(BDR_A.uid), label: 'WhatsApp' }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c1', 'phones', 'p2'), bad))
  })

  it("refuse d'ajouter un numéro au contact d'un autre BDR", async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_B), 'contacts', 'c1', 'phones', 'p3'), validPhone(BDR_B.uid)))
  })
})

describe('Appels (journal)', () => {
  const validCall = (ownerId: string) => ({
    ownerId,
    contactId: 'c1',
    accountId: 'a1',
    calledAt: Timestamp.now(),
    calledPhone: '+2250700000000',
    outcome: 'Argumenté',
    notes: 'Intéressée, démo jeudi.',
    nextReminderAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
    createdAt: serverTimestamp(),
  })

  it('logge un appel valide', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'calls', 'call1'), validCall(BDR_A.uid)))
  })

  it('accepte les résultats « Rappel demandé » et « Messagerie »', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'calls', 'call2'), { ...validCall(BDR_A.uid), outcome: 'Rappel demandé' }))
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'calls', 'call3'), { ...validCall(BDR_A.uid), outcome: 'Messagerie' }))
  })

  it('refuse un résultat hors liste', async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'calls', 'call4'), { ...validCall(BDR_A.uid), outcome: 'Intéressé' }))
  })

  it('refuse des notes de plus de 5000 caractères', async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'calls', 'call5'), { ...validCall(BDR_A.uid), notes: 'x'.repeat(5001) }))
  })

  it('corrige un appel (résultat, notes) avec la date de correction', async () => {
    const db = ctxFor(BDR_A)
    await assertSucceeds(setDoc(doc(db, 'calls', 'call6'), validCall(BDR_A.uid)))
    await assertSucceeds(updateDoc(doc(db, 'calls', 'call6'), { notes: 'modifié', outcome: 'RDV pris', editedAt: serverTimestamp() }))
  })

  it("refuse de changer le contact d'un appel corrigé", async () => {
    const db = ctxFor(BDR_A)
    await assertSucceeds(setDoc(doc(db, 'calls', 'call8'), validCall(BDR_A.uid)))
    await assertFails(updateDoc(doc(db, 'calls', 'call8'), { contactId: 'autre', editedAt: serverTimestamp() }))
  })

  it('refuse une correction sans date de correction', async () => {
    const db = ctxFor(BDR_A)
    await assertSucceeds(setDoc(doc(db, 'calls', 'call9'), validCall(BDR_A.uid)))
    await assertFails(updateDoc(doc(db, 'calls', 'call9'), { notes: 'modifié' }))
  })

  it('un autre BDR ne peut pas corriger un appel', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'calls', 'call10'), validCall(BDR_A.uid)))
    await assertFails(updateDoc(doc(ctxFor(BDR_B), 'calls', 'call10'), { notes: 'piraté', editedAt: serverTimestamp() }))
  })

  it("un BDR ne lit pas les appels d'un autre", async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'calls', 'call7'), validCall(BDR_A.uid)))
    await assertFails(getDoc(doc(ctxFor(BDR_B), 'calls', 'call7')))
  })
})

describe('Autres actions (email, LinkedIn…)', () => {
  const validActivity = (ownerId: string) => ({
    ownerId,
    contactId: 'c1',
    accountId: 'a1',
    type: 'Email envoyé',
    occurredAt: Timestamp.now(),
    notes: 'Présentation envoyée',
    createdAt: serverTimestamp(),
  })

  it('journalise une action sur son contact', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'activities', 'act1'), validActivity(BDR_A.uid)))
  })

  it('refuse un type hors liste', async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'activities', 'act2'), { ...validActivity(BDR_A.uid), type: 'Tweet' }))
  })

  it("refuse une action sur le contact d'un autre BDR", async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_B), 'activities', 'act3'), { ...validActivity(BDR_B.uid) }))
  })

  it('un BDR lit ses actions, pas celles des autres, et ne les modifie pas', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'activities', 'act4'), validActivity(BDR_A.uid)))
    await assertSucceeds(getDoc(doc(ctxFor(BDR_A), 'activities', 'act4')))
    await assertFails(getDoc(doc(ctxFor(BDR_B), 'activities', 'act4')))
    await assertFails(updateDoc(doc(ctxFor(BDR_A), 'activities', 'act4'), { notes: 'modifié' }))
  })
})

describe('Cadences et étapes du contact', () => {
  const validCadence = (ownerId: string, steps = 1) => ({
    ownerId,
    name: 'Séquence test',
    steps: Array.from({ length: steps }, (_, i) => ({ dayOffset: i * 2, channel: 'Appel', label: `Étape ${i + 1}` })),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const validContact = (ownerId: string) => ({
    ownerId,
    accountId: null,
    accountName: null,
    firstName: 'Kofi',
    lastName: 'Mensah',
    title: null,
    email: null,
    linkedinUrl: null,
    description: null,
    source: null,
    status: 'Cold',
    country: null,
    city: null,
    timezone: null,
    nextReminderAt: null,
    lastCallAt: null,
    statusChangedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  it('crée une cadence avec ses étapes', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'cadences', 'cad1'), validCadence(BDR_A.uid, 3)))
  })

  it('refuse une cadence sans étape ou avec plus de 20 étapes', async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'cadences', 'cad2'), validCadence(BDR_A.uid, 0)))
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'cadences', 'cad3'), validCadence(BDR_A.uid, 21)))
  })

  it("un BDR ne modifie pas la cadence d'un autre", async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'cadences', 'cad4'), validCadence(BDR_A.uid)))
    await assertFails(updateDoc(doc(ctxFor(BDR_B), 'cadences', 'cad4'), { name: 'Volé', updatedAt: serverTimestamp() }))
  })

  it('démarre une cadence sur un contact, puis fait avancer les étapes', async () => {
    const db = ctxFor(BDR_A)
    await assertSucceeds(setDoc(doc(db, 'contacts', 'c9'), validContact(BDR_A.uid)))
    await assertSucceeds(
      updateDoc(doc(db, 'contacts', 'c9'), { cadenceId: 'cad1', cadenceStartedAt: serverTimestamp(), cadenceStep: 0, updatedAt: serverTimestamp() }),
    )
    await assertSucceeds(updateDoc(doc(db, 'contacts', 'c9'), { cadenceStep: 1, updatedAt: serverTimestamp() }))
  })

  it("refuse un nombre d'étapes faites incohérent", async () => {
    const db = ctxFor(BDR_A)
    await assertSucceeds(setDoc(doc(db, 'contacts', 'c10'), validContact(BDR_A.uid)))
    await assertFails(updateDoc(doc(db, 'contacts', 'c10'), { cadenceStep: 25, updatedAt: serverTimestamp() }))
  })
})

describe('Emails multiples (sous-collection)', () => {
  const validEmail = (ownerId: string) => ({
    ownerId,
    address: 'awa.kone@acme.example',
    isPrimary: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  it('ajoute un email valide à son contact', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c1', 'emails', 'e1'), validEmail(BDR_A.uid)))
  })

  it('refuse une adresse mal formée', async () => {
    const bad = { ...validEmail(BDR_A.uid), address: 'pas-un-email' }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c1', 'emails', 'e2'), bad))
  })

  it('refuse un champ inconnu', async () => {
    const bad = { ...validEmail(BDR_A.uid), label: 'pro' }
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c1', 'emails', 'e3'), bad))
  })

  it("refuse d'ajouter un email au contact d'un autre BDR", async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_B), 'contacts', 'c1', 'emails', 'e4'), validEmail(BDR_B.uid)))
  })

  it('refuse la modification directe d\'un email (remplacement en bloc uniquement)', async () => {
    const db = ctxFor(BDR_A)
    await assertSucceeds(setDoc(doc(db, 'contacts', 'c1', 'emails', 'e5'), validEmail(BDR_A.uid)))
    await assertFails(updateDoc(doc(db, 'contacts', 'c1', 'emails', 'e5'), { address: 'autre@exemple.com' }))
  })

  it("un BDR ne lit pas les emails d'un collègue (groupe de collections)", async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'contacts', 'c1', 'emails', 'e6'), validEmail(BDR_A.uid)))
    await assertFails(getDoc(doc(ctxFor(BDR_B), 'contacts', 'c1', 'emails', 'e6')))
  })
})

describe('Profil LinkedIn sur le contact', () => {
  const contactWith = (linkedinUrl: unknown) => ({
    ownerId: BDR_A.uid,
    accountId: null,
    accountName: null,
    firstName: 'Awa',
    lastName: 'Koné',
    title: null,
    email: null,
    linkedinUrl,
    description: null,
    source: null,
    status: 'Cold',
    country: null,
    city: null,
    timezone: null,
    nextReminderAt: null,
    lastCallAt: null,
    statusChangedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  it('accepte une URL linkedin.com en https', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'contacts', 'lk1'), contactWith('https://www.linkedin.com/in/awa-kone')))
  })

  it('accepte un contact sans profil LinkedIn', async () => {
    await assertSucceeds(setDoc(doc(ctxFor(BDR_A), 'contacts', 'lk2'), contactWith(null)))
  })

  it('refuse une URL vers un autre site', async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'lk3'), contactWith('https://exemple.com/in/awa')))
  })

  it('refuse une URL en http', async () => {
    await assertFails(setDoc(doc(ctxFor(BDR_A), 'contacts', 'lk4'), contactWith('http://www.linkedin.com/in/awa')))
  })
})

describe('Import en lots : contact puis numéros dans un second lot', () => {
  it('accepte le lot de numéros après le lot de contacts (même séquence que l\'import)', async () => {
    const db = ctxFor(BDR_A)
    const ref = doc(collection(db, 'contacts'))
    const contactBatch = writeBatch(db)
    contactBatch.set(ref, {
      ownerId: BDR_A.uid,
      accountId: null,
      accountName: null,
      firstName: 'Daniel',
      lastName: 'Mensah-Nuamah',
      title: 'IT MANAGER',
      email: null,
      linkedinUrl: null,
      description: null,
      source: 'LinkedIn',
      status: 'Cold',
      country: 'GH',
      city: null,
      timezone: 'Africa/Accra',
      nextReminderAt: null,
      lastCallAt: null,
      statusChangedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await assertSucceeds(contactBatch.commit())

    const phoneBatch = writeBatch(db)
    phoneBatch.set(doc(collection(ref, 'phones')), {
      ownerId: BDR_A.uid,
      number: '+233208111165',
      label: 'Standard',
      isPrimary: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await assertSucceeds(phoneBatch.commit())
  })
})
