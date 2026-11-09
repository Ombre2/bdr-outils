import { collection, doc, getDocs, query, serverTimestamp, where, type WriteBatch } from 'firebase/firestore'
import { cleanText } from '@/lib/text'
import { db } from '@/services/firebase'
import { STATUSES_REQUIRING_REASON, type ContactStatus, type StatusChange } from '@/types/models'

export class StatusReasonError extends Error {}

/** Motif obligatoire pour certains statuts. Renvoie le motif nettoyé (ou null). */
export function checkStatusReason(status: ContactStatus, reason: string | null | undefined): string | null {
  const cleaned = cleanText(reason ?? null, 500)
  if (STATUSES_REQUIRING_REASON.includes(status) && !cleaned) {
    throw new StatusReasonError(`Indiquez le motif pour le statut « ${status} ».`)
  }
  return cleaned
}

/** Ajoute une ligne d'historique de statut au batch donné (écrit avec le changement de statut). */
export function addStatusChangeToBatch(
  batch: WriteBatch,
  ownerId: string,
  contactId: string,
  fromStatus: ContactStatus | null,
  toStatus: ContactStatus,
  reason: string | null,
): void {
  batch.set(doc(collection(db, 'contacts', contactId, 'statusHistory')), {
    ownerId,
    fromStatus,
    toStatus,
    reason,
    changedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  })
}

/** Historique des statuts d'un contact, du plus récent au plus ancien (tri fait ici, pas en base). */
export async function listStatusChanges(ownerId: string, contactId: string): Promise<StatusChange[]> {
  const snap = await getDocs(
    query(collection(db, 'contacts', contactId, 'statusHistory'), where('ownerId', '==', ownerId)),
  )
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StatusChange, 'id'>) }))
  return items.sort((a, b) => (b.changedAt?.toMillis() ?? Date.now()) - (a.changedAt?.toMillis() ?? Date.now()))
}
