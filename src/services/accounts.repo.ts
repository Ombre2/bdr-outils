import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { cleanText, normalizeText, safeHttpsUrl } from '@/lib/text'
import { countryByCode } from '@/lib/geo'
import { db } from '@/services/firebase'

export interface AccountInput {
  name: string
  website: string
  industry: string
  headcount: string | null
  description: string
  country: string | null
  city: string
  timezone: string | null
  source?: string | null // renseigné à la création seulement
}

export class AccountHasContactsError extends Error {
  constructor() {
    super('Ce compte contient encore des contacts. Supprimez-les ou changez leur compte d\'abord.')
  }
}

/** Toute donnée entrante est nettoyée ici, avant écriture. Les règles valident ensuite côté serveur. */
function toPayload(input: AccountInput) {
  const name = cleanText(input.name, 120)
  if (!name) throw new Error('Le nom du compte est obligatoire.')

  const country = input.country && countryByCode(input.country) ? input.country : null
  const timezone = input.timezone && input.timezone.length <= 40 ? input.timezone : null

  return {
    name,
    website: safeHttpsUrl(input.website),
    industry: cleanText(input.industry, 100),
    headcount: cleanText(input.headcount, 40),
    description: cleanText(input.description, 2000),
    country,
    city: cleanText(input.city, 80),
    timezone,
    searchName: normalizeText(name).slice(0, 120),
  }
}

export async function createAccount(ownerId: string, input: AccountInput): Promise<string> {
  const ref = await addDoc(collection(db, 'accounts'), {
    ownerId,
    ...toPayload(input),
    source: cleanText(input.source ?? null, 120),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateAccount(accountId: string, input: AccountInput): Promise<void> {
  await updateDoc(doc(db, 'accounts', accountId), {
    ...toPayload(input),
    updatedAt: serverTimestamp(),
  })
}

/** Supprime un compte seulement s'il n'a plus de contacts (évite les contacts orphelins). */
export async function deleteAccount(ownerId: string, accountId: string): Promise<void> {
  const linked = await getDocs(
    query(collection(db, 'contacts'), where('ownerId', '==', ownerId), where('accountId', '==', accountId)),
  )
  if (!linked.empty) throw new AccountHasContactsError()
  await deleteDoc(doc(db, 'accounts', accountId))
}
