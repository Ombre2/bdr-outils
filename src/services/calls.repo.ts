import {
  Timestamp,
  arrayUnion,
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
import { richTextLength, sanitizeRichText } from '@/lib/rich-text'
import { db } from '@/services/firebase'
import { addStatusChangeToBatch, checkStatusReason } from '@/services/status-history.repo'
import { CALL_OUTCOMES, CONTACT_STATUSES, type Call, type CallOutcome, type Contact, type ContactStatus } from '@/types/models'

export interface CallInput {
  outcome: CallOutcome
  calledPhone: string | null
  notes: string
  nextReminderAt: Date | null
  meetingAt?: Date | null // date et heure du RDV, obligatoire si résultat « RDV pris »
  status: ContactStatus // statut du contact après l'appel (inchangé si identique)
  statusReason?: string | null // motif, demandé si le statut change vers Disqualifié / Ne plus contacter
  calledAt?: Date // date de l'appel choisie ; par défaut, maintenant
}

export class CallInputError extends Error {}

/** Un RDV pris doit avoir sa date et son heure. */
function checkMeetingAt(outcome: CallOutcome, meetingAt: Date | null | undefined): void {
  if (outcome === 'RDV pris' && !meetingAt) throw new CallInputError('Indiquez la date et l’heure du RDV.')
}

/**
 * Enregistre un appel ET met à jour le contact (prochain rappel, dernier appel, statut)
 * dans un seul batch : soit tout est écrit, soit rien.
 */
export async function logCall(ownerId: string, contact: Contact, input: CallInput): Promise<void> {
  if (!input.outcome) throw new CallInputError('Choisissez un résultat.')
  if (!CONTACT_STATUSES.includes(input.status)) throw new CallInputError('Statut invalide.')
  checkMeetingAt(input.outcome, input.meetingAt)

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
    meetingAt: input.meetingAt ? Timestamp.fromDate(input.meetingAt) : null,
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
  meetingAt: Date | null
}

/** Corrige un appel déjà enregistré (résultat, numéro, date, RDV, notes). Le rappel et le statut ne changent pas. */
export async function updateCall(callId: string, input: CallCorrection): Promise<void> {
  if (!CALL_OUTCOMES.includes(input.outcome)) throw new CallInputError('Choisissez un résultat.')
  checkMeetingAt(input.outcome, input.meetingAt)
  if (input.calledAt.getTime() > Date.now() + 60_000) throw new CallInputError('La date de l’appel ne peut pas être dans le futur.')
  await updateDoc(doc(db, 'calls', callId), {
    outcome: input.outcome,
    calledPhone: input.calledPhone,
    notes: cleanText(input.notes, 5000),
    calledAt: Timestamp.fromDate(input.calledAt),
    meetingAt: input.meetingAt ? Timestamp.fromDate(input.meetingAt) : null,
    editedAt: serverTimestamp(),
  })
}

/** Report d'un RDV : la date change, l'ancienne est gardée dans meetingHistory. Le reste de l'appel est conservé. */
export async function rescheduleMeeting(callId: string, meetingAt: Date, previousAt: Date): Promise<void> {
  if (Number.isNaN(meetingAt.getTime())) throw new CallInputError('Date du RDV invalide.')
  await updateDoc(doc(db, 'calls', callId), {
    meetingAt: Timestamp.fromDate(meetingAt),
    // Timestamp.now() car serverTimestamp() n'est pas accepté dans un tableau
    meetingHistory: arrayUnion({ previousAt: Timestamp.fromDate(previousAt), changedAt: Timestamp.now() }),
    editedAt: serverTimestamp(),
  })
}

/** Compte rendu d'un RDV, en texte riche (vide = compte rendu effacé). */
export async function saveCompteRendu(callId: string, html: string): Promise<void> {
  const compteRendu = sanitizeRichText(html)
  if (richTextLength(compteRendu) > 5000) throw new CallInputError('Le compte rendu ne peut pas dépasser 5000 caractères.')
  await updateDoc(doc(db, 'calls', callId), {
    compteRendu: richTextLength(compteRendu) > 0 ? compteRendu : null,
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

/** Tous les appels « RDV pris » du BDR, avec ou sans date de RDV. Filtre fait dans l'appli, donc pas d'index composite. */
export async function listRdvCallsForOwner(ownerId: string): Promise<Call[]> {
  const snap = await getDocs(
    query(collection(db, 'calls'), where('ownerId', '==', ownerId), where('outcome', '==', 'RDV pris')),
  )
  return snap.docs.map(fromSnapshot)
}

/** Rendez-vous à date connue (résultat « RDV pris » avec date et heure du RDV). */
export async function listMeetingsForOwner(ownerId: string): Promise<Call[]> {
  return (await listRdvCallsForOwner(ownerId)).filter((c) => !!c.meetingAt)
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
