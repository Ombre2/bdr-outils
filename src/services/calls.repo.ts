import {
  Timestamp,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { cleanText } from '@/lib/text'
import { db } from '@/services/firebase'
import { addStatusChangeToBatch, checkStatusReason } from '@/services/status-history.repo'
import { CALL_OUTCOMES, CONTACT_STATUSES, type Call, type CallOutcome, type Contact, type ContactStatus } from '@/types/models'

export interface CallInput {
  outcome: CallOutcome
  calledPhone: string | null
  notes: string
  nextReminderAt: Date | null
  status: ContactStatus // statut du contact après l'appel (inchangé si identique)
  statusReason?: string | null // motif, demandé si le statut change vers Disqualifié / Ne plus contacter
  calledAt?: Date // date de l'appel choisie ; par défaut, maintenant
}

export class CallInputError extends Error {}

/**
 * Enregistre un appel ET met à jour le contact (prochain rappel, dernier appel, statut)
 * dans un seul batch : soit tout est écrit, soit rien.
 */
export async function logCall(ownerId: string, contact: Contact, input: CallInput): Promise<void> {
  if (!input.outcome) throw new CallInputError('Choisissez un résultat.')
  if (!CONTACT_STATUSES.includes(input.status)) throw new CallInputError('Statut invalide.')

  const calledAt = input.calledAt ?? new Date()
  if (calledAt.getTime() > Date.now() + 60_000) throw new CallInputError('La date de l’appel ne peut pas être dans le futur.')
  const notes = cleanText(input.notes, 5000)
  const batch = writeBatch(db)

  const callRef = doc(collection(db, 'calls'))
  batch.set(callRef, {
    ownerId,
    contactId: contact.id,
    accountId: contact.accountId,
    calledAt: Timestamp.fromDate(calledAt),
    calledPhone: input.calledPhone,
    outcome: input.outcome,
    notes,
    nextReminderAt: input.nextReminderAt ? Timestamp.fromDate(input.nextReminderAt) : null,
    createdAt: serverTimestamp(),
  })

  const statusChanged = input.status !== contact.status
  batch.update(doc(db, 'contacts', contact.id), {
    nextReminderAt: input.nextReminderAt ? Timestamp.fromDate(input.nextReminderAt) : null,
    lastCallAt: Timestamp.fromDate(calledAt),
    ...(statusChanged ? { status: input.status, statusChangedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  })
  if (statusChanged) {
    addStatusChangeToBatch(batch, ownerId, contact.id, contact.status, input.status, checkStatusReason(input.status, input.statusReason))
  }

  await batch.commit()
}

export interface CallCorrection {
  outcome: CallOutcome
  calledPhone: string | null
  notes: string
  calledAt: Date
}

/** Corrige un appel déjà enregistré (résultat, numéro, date, notes). Le rappel et le statut ne changent pas. */
export async function updateCall(callId: string, input: CallCorrection): Promise<void> {
  if (!CALL_OUTCOMES.includes(input.outcome)) throw new CallInputError('Choisissez un résultat.')
  if (input.calledAt.getTime() > Date.now() + 60_000) throw new CallInputError('La date de l’appel ne peut pas être dans le futur.')
  await updateDoc(doc(db, 'calls', callId), {
    outcome: input.outcome,
    calledPhone: input.calledPhone,
    notes: cleanText(input.notes, 5000),
    calledAt: Timestamp.fromDate(input.calledAt),
    editedAt: serverTimestamp(),
  })
}

function fromSnapshot(d: { id: string; data: () => unknown }): Call {
  return { id: d.id, ...(d.data() as Omit<Call, 'id'>) }
}

/** Historique d'un contact, du plus récent au plus ancien. Filtré sur ownerId (règles). */
export async function listCallsForContact(ownerId: string, contactId: string): Promise<Call[]> {
  const snap = await getDocs(
    query(
      collection(db, 'calls'),
      where('ownerId', '==', ownerId),
      where('contactId', '==', contactId),
      orderBy('calledAt', 'desc'),
    ),
  )
  return snap.docs.map(fromSnapshot)
}

/** Historique d'un compte (tous ses contacts). */
export async function listCallsForAccount(ownerId: string, accountId: string): Promise<Call[]> {
  const snap = await getDocs(
    query(
      collection(db, 'calls'),
      where('ownerId', '==', ownerId),
      where('accountId', '==', accountId),
      orderBy('calledAt', 'desc'),
    ),
  )
  return snap.docs.map(fromSnapshot)
}

/** Appels d'une période (bornes incluses). Même index que listCallsSince. */
export async function listCallsBetween(ownerId: string, start: Date, end: Date): Promise<Call[]> {
  const snap = await getDocs(
    query(
      collection(db, 'calls'),
      where('ownerId', '==', ownerId),
      where('calledAt', '>=', Timestamp.fromDate(start)),
      where('calledAt', '<=', Timestamp.fromDate(end)),
      orderBy('calledAt', 'desc'),
    ),
  )
  return snap.docs.map(fromSnapshot)
}

/** Appels de toute l'équipe sur une période. Réservé à l'admin (lecture seule, règles : rôle admin). */
export async function listTeamCallsBetween(start: Date, end: Date): Promise<Call[]> {
  const snap = await getDocs(
    query(
      collection(db, 'calls'),
      where('calledAt', '>=', Timestamp.fromDate(start)),
      where('calledAt', '<=', Timestamp.fromDate(end)),
      orderBy('calledAt', 'desc'),
    ),
  )
  return snap.docs.map(fromSnapshot)
}

/** Appels depuis une date (ex. début de la journée), pour les compteurs de Ma Journée. */
export async function listCallsSince(ownerId: string, since: Date): Promise<Call[]> {
  const snap = await getDocs(
    query(
      collection(db, 'calls'),
      where('ownerId', '==', ownerId),
      where('calledAt', '>=', Timestamp.fromDate(since)),
      orderBy('calledAt', 'desc'),
    ),
  )
  return snap.docs.map(fromSnapshot)
}
