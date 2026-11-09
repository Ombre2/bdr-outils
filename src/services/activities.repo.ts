import { Timestamp, addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, where } from 'firebase/firestore'
import { cleanText } from '@/lib/text'
import { db } from '@/services/firebase'
import { ACTIVITY_TYPES, type Activity, type ActivityType, type Contact } from '@/types/models'

export class ActivityInputError extends Error {}

export interface ActivityInput {
  type: ActivityType
  occurredAt: Date
  notes: string
}

/** Journalise une autre action (email, message LinkedIn…) sur un contact. */
export async function createActivity(ownerId: string, contact: Contact, input: ActivityInput): Promise<void> {
  if (!ACTIVITY_TYPES.includes(input.type)) throw new ActivityInputError('Type d’action invalide.')
  if (input.occurredAt.getTime() > Date.now() + 60_000) throw new ActivityInputError('La date ne peut pas être dans le futur.')
  await addDoc(collection(db, 'activities'), {
    ownerId,
    contactId: contact.id,
    accountId: contact.accountId,
    type: input.type,
    occurredAt: Timestamp.fromDate(input.occurredAt),
    notes: cleanText(input.notes, 2000),
    createdAt: serverTimestamp(),
  })
}

/** Actions d'un contact, du plus récent au plus ancien (tri fait ici). */
export async function listActivities(ownerId: string, contactId: string): Promise<Activity[]> {
  const snap = await getDocs(
    query(collection(db, 'activities'), where('ownerId', '==', ownerId), where('contactId', '==', contactId)),
  )
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Activity, 'id'>) }))
    .sort((a, b) => b.occurredAt.toMillis() - a.occurredAt.toMillis())
}

export async function deleteActivity(activityId: string): Promise<void> {
  await deleteDoc(doc(db, 'activities', activityId))
}
