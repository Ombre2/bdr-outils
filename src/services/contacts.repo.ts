import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore'
import { parsePhone } from '@/lib/phone'
import { cleanText, safeLinkedinUrl } from '@/lib/text'
import { countryByCode } from '@/lib/geo'
import { db } from '@/services/firebase'
import { addStatusChangeToBatch, checkStatusReason, listStatusChanges } from '@/services/status-history.repo'
import {
  CONTACT_STATUSES,
  MAX_EMAILS_PER_CONTACT,
  MAX_PHONES_PER_CONTACT,
  PHONE_LABELS,
  type Contact,
  type ContactEmail,
  type ContactStatus,
  type Phone,
  type PhoneLabel,
} from '@/types/models'

export interface PhoneInput {
  id?: string // présent pour un numéro existant
  number: string // saisie libre, normalisée en E.164
  label: PhoneLabel
  isPrimary: boolean
}

export interface ContactInput {
  firstName: string
  lastName: string
  title: string
  emails: string[] // le premier est l'email principal
  linkedinUrl: string | null
  description: string
  source: string | null
  accountId: string | null
  accountName: string | null
  status: ContactStatus
  statusReason?: string | null // motif du changement de statut (historique)
  country: string | null
  city: string
  timezone: string | null
  phones: PhoneInput[]
}

export class DataError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Valide les emails : format, doublons retirés, max 5. Le premier devient le principal. */
export function prepareEmails(inputs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of inputs) {
    const value = cleanText(raw, 254)?.toLowerCase()
    if (!value) continue
    if (!EMAIL_RE.test(value)) throw new DataError(`Email invalide : ${raw}`)
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  if (result.length > MAX_EMAILS_PER_CONTACT) {
    throw new DataError(`Maximum ${MAX_EMAILS_PER_CONTACT} emails par contact.`)
  }
  return result
}

/** Valide et normalise les numéros : E.164, max 5, doublons retirés, un seul principal. */
function preparePhones(inputs: PhoneInput[], defaultCountry: string | null) {
  const seen = new Set<string>()
  const result: { id?: string; number: string; label: PhoneLabel; isPrimary: boolean }[] = []

  for (const input of inputs) {
    if (!input.number.trim()) continue
    const parsed = parsePhone(input.number, defaultCountry ?? undefined)
    if (!parsed) throw new DataError(`Numéro invalide : ${input.number}`)
    if (seen.has(parsed.e164)) continue
    seen.add(parsed.e164)
    result.push({
      id: input.id,
      number: parsed.e164,
      label: PHONE_LABELS.includes(input.label) ? input.label : 'Autre',
      isPrimary: false,
    })
  }

  if (result.length > MAX_PHONES_PER_CONTACT) {
    throw new DataError(`Maximum ${MAX_PHONES_PER_CONTACT} numéros par contact.`)
  }
  if (result.length > 0) {
    // Le principal demandé, sinon le premier de la liste
    const requested = inputs.find((i) => i.isPrimary && i.number.trim())
    const primaryNumber = requested ? parsePhone(requested.number, defaultCountry ?? undefined)?.e164 : undefined
    const primaryIndex = Math.max(0, result.findIndex((r) => r.number === primaryNumber))
    result.forEach((r, i) => (r.isPrimary = i === primaryIndex))
  }
  return result
}

/** Champs du contact hors téléphones et emails (l'email principal est ajouté par l'appelant). */
function toContactPayload(input: ContactInput) {
  const firstName = cleanText(input.firstName, 80)
  const lastName = cleanText(input.lastName, 80)
  if (!firstName || !lastName) throw new DataError('Le prénom et le nom sont obligatoires.')

  if (!CONTACT_STATUSES.includes(input.status)) throw new DataError('Statut invalide.')

  return {
    accountId: input.accountId,
    accountName: cleanText(input.accountName, 120),
    firstName,
    lastName,
    title: cleanText(input.title, 120),
    linkedinUrl: safeLinkedinUrl(input.linkedinUrl),
    description: cleanText(input.description, 2000),
    source: cleanText(input.source, 120),
    status: input.status,
    country: input.country && countryByCode(input.country) ? input.country : null,
    city: cleanText(input.city, 80),
    timezone: input.timezone && input.timezone.length <= 40 ? input.timezone : null,
  }
}

/**
 * Création : le contact est écrit d'abord, puis ses numéros et emails.
 * Les règles vérifient le propriétaire du contact parent, qui doit donc exister.
 */
export async function createContact(ownerId: string, input: ContactInput): Promise<string> {
  const payload = toContactPayload(input)
  const emails = prepareEmails(input.emails)
  const phones = preparePhones(input.phones, payload.country)
  if (phones.length === 0) throw new DataError('Au moins un numéro de téléphone est obligatoire.')

  const ref = doc(collection(db, 'contacts'))
  await setDoc(ref, {
    ownerId,
    ...payload,
    email: emails[0] ?? null,
    nextReminderAt: null,
    lastCallAt: null,
    statusChangedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  try {
    await writePhones(ownerId, ref, phones, [])
    await writeEmails(ownerId, ref, emails, [])
  } catch (error) {
    // Pas de contact à moitié écrit : on annule la création
    await deleteDoc(ref).catch(() => undefined)
    throw error
  }
  return ref.id
}

export async function updateContact(
  ownerId: string,
  contact: Contact,
  input: ContactInput,
  existingPhones: Phone[],
  existingEmails: ContactEmail[],
): Promise<void> {
  const payload = toContactPayload(input)
  const emails = prepareEmails(input.emails)
  const phones = preparePhones(input.phones, payload.country)
  if (phones.length === 0) throw new DataError('Au moins un numéro de téléphone est obligatoire.')
  const statusChanged = payload.status !== contact.status
  const reason = statusChanged ? checkStatusReasonOrThrow(payload.status, input.statusReason) : null
  const ref = doc(db, 'contacts', contact.id)

  const batch = writeBatch(db)
  batch.update(ref, {
    ...payload,
    email: emails[0] ?? null,
    // Ne change que si le statut change (règle : statusChangedAt == request.time)
    ...(statusChanged ? { statusChangedAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  })
  if (statusChanged) addStatusChangeToBatch(batch, ownerId, contact.id, contact.status, payload.status, reason)
  await batch.commit()

  await writePhones(ownerId, ref, phones, existingPhones)
  await writeEmails(ownerId, ref, emails, existingEmails)
}

const BULK_CHUNK = 50 // contacts par lot : progression fluide, et chaque lot reste sous la limite de 500 écritures

/**
 * Import en masse : contacts par lots, puis numéros et emails par lots
 * (les règles exigent que le contact existe). Non atomique entre lots.
 */
export async function createContactsBulk(
  ownerId: string,
  inputs: ContactInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ created: number; failed: number; phonesIncomplete: number; subError: string | null }> {
  let created = 0
  let failed = 0
  let phonesIncomplete = 0
  let subError: string | null = null

  for (let start = 0; start < inputs.length; start += BULK_CHUNK) {
    const slice = inputs.slice(start, start + BULK_CHUNK)
    const prepared = slice.map((input) => {
      const payload = toContactPayload(input)
      const emails = prepareEmails(input.emails)
      return {
        ref: doc(collection(db, 'contacts')),
        payload: { ...payload, email: emails[0] ?? null },
        phones: preparePhones(input.phones, payload.country),
        emails,
      }
    })

    try {
      const contactBatch = writeBatch(db)
      for (const { ref, payload } of prepared) {
        contactBatch.set(ref, {
          ownerId,
          ...payload,
          nextReminderAt: null,
          lastCallAt: null,
          statusChangedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }
      await contactBatch.commit()
    } catch {
      failed += slice.length
      onProgress?.(start + slice.length, inputs.length)
      continue
    }

    // Numéros et emails : sous-collections, par lots de SUB_BATCH écritures
    const subOps = prepared.flatMap(({ ref, phones, emails }) => [
      ...phones.map((p) => ({
        ref,
        sub: 'phones' as const,
        data: { ownerId, number: p.number, label: p.label, isPrimary: p.isPrimary },
      })),
      ...emails.map((address, i) => ({
        ref,
        sub: 'emails' as const,
        data: { ownerId, address, isPrimary: i === 0 },
      })),
    ])

    // Écriture document par document (par petits groupes en parallèle), et non en lot :
    // un lot échoue entièrement dès qu'une écriture est refusée, ce qui masquait l'erreur réelle.
    let subFailed = false
    const CONCURRENCY = 10
    for (let i = 0; i < subOps.length; i += CONCURRENCY) {
      const group = subOps.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        group.map((op) =>
          setDoc(doc(collection(op.ref, op.sub)), {
            ...op.data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ),
      )
      results.forEach((result, j) => {
        if (result.status === 'fulfilled') return
        subFailed = true
        subError ??= (result.reason as { code?: string })?.code ?? String(result.reason)
        console.error('Écriture refusée :', result.reason, 'Donnée :', group[j].sub, group[j].data)
      })
    }

    created += slice.length
    if (subFailed) phonesIncomplete += slice.length
    onProgress?.(start + slice.length, inputs.length)
  }

  return { created, failed, phonesIncomplete, subError }
}

function checkStatusReasonOrThrow(status: ContactStatus, reason: string | null | undefined): string | null {
  try {
    return checkStatusReason(status, reason)
  } catch (error) {
    throw new DataError(error instanceof Error ? error.message : 'Motif invalide.')
  }
}

/** Changement de statut rapide depuis la fiche (sans repasser par le formulaire). Écrit l'historique dans le même batch. */
export async function setContactStatus(contact: Contact, status: ContactStatus, reason?: string | null): Promise<void> {
  if (!CONTACT_STATUSES.includes(status)) throw new DataError('Statut invalide.')
  if (status === contact.status) return
  const cleanReason = checkStatusReasonOrThrow(status, reason)
  const batch = writeBatch(db)
  batch.update(doc(db, 'contacts', contact.id), {
    status,
    statusChangedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  addStatusChangeToBatch(batch, contact.ownerId, contact.id, contact.status, status, cleanReason)
  await batch.commit()
}

/**
 * Choisit le bon numéro d'un contact : il devient le principal, les autres ne le sont plus.
 * Écrit document par document (et non en lot) : les lots de sous-collections ont été refusés en production.
 */
export async function setPrimaryPhone(contactId: string, phones: Phone[], phoneId: string): Promise<void> {
  if (!phones.some((p) => p.id === phoneId)) throw new DataError('Numéro introuvable.')
  const changes = phones.filter((p) => p.isPrimary !== (p.id === phoneId))
  await Promise.all(
    changes.map((p) =>
      updateDoc(doc(db, 'contacts', contactId, 'phones', p.id), {
        isPrimary: p.id === phoneId,
        updatedAt: serverTimestamp(),
      }),
    ),
  )
}

/** Démarre une cadence pour le contact (ou l'arrête avec null). Le démarrage remet les étapes à zéro. */
export async function setContactCadence(contact: Contact, cadenceId: string | null): Promise<void> {
  await updateDoc(doc(db, 'contacts', contact.id), {
    cadenceId,
    cadenceStartedAt: cadenceId ? serverTimestamp() : null,
    cadenceStep: 0,
    updatedAt: serverTimestamp(),
  })
}

/** Marque l'étape en cours comme faite et passe à la suivante. */
export async function completeCadenceStep(contact: Contact, totalSteps: number): Promise<void> {
  const current = contact.cadenceStep ?? 0
  if (current >= totalSteps) return
  await updateDoc(doc(db, 'contacts', contact.id), {
    cadenceStep: current + 1,
    updatedAt: serverTimestamp(),
  })
}

/** Supprime le contact, ses numéros, ses emails et son historique de statut, sinon des données orphelines resteraient. */
export async function deleteContact(ownerId: string, contactId: string, phones: Phone[], emails: ContactEmail[]): Promise<void> {
  const history = await listStatusChanges(ownerId, contactId)
  const batch = writeBatch(db)
  phones.forEach((p) => batch.delete(doc(db, 'contacts', contactId, 'phones', p.id)))
  emails.forEach((e) => batch.delete(doc(db, 'contacts', contactId, 'emails', e.id)))
  history.forEach((h) => batch.delete(doc(db, 'contacts', contactId, 'statusHistory', h.id)))
  batch.delete(doc(db, 'contacts', contactId))
  await batch.commit()
}

/** Applique le diff des numéros dans un seul batch (ajout, mise à jour, suppression). */
async function writePhones(
  ownerId: string,
  contactRef: DocumentReference,
  desired: { id?: string; number: string; label: PhoneLabel; isPrimary: boolean }[],
  existing: Phone[],
): Promise<void> {
  const batch = writeBatch(db)
  const keptIds = new Set(desired.map((d) => d.id).filter(Boolean))

  existing
    .filter((p) => !keptIds.has(p.id))
    .forEach((p) => batch.delete(doc(contactRef, 'phones', p.id)))

  for (const phone of desired) {
    const data = { number: phone.number, label: phone.label, isPrimary: phone.isPrimary }
    if (phone.id && existing.some((p) => p.id === phone.id)) {
      batch.update(doc(contactRef, 'phones', phone.id), { ...data, updatedAt: serverTimestamp() })
    } else {
      batch.set(doc(collection(contactRef, 'phones')), {
        ownerId,
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
  }

  await batch.commit()
}

/** Emails : remplacement complet (suppression des anciens, création des nouveaux), en un seul batch. */
async function writeEmails(
  ownerId: string,
  contactRef: DocumentReference,
  addresses: string[],
  existing: ContactEmail[],
): Promise<void> {
  if (addresses.length === 0 && existing.length === 0) return
  const batch = writeBatch(db)
  existing.forEach((e) => batch.delete(doc(contactRef, 'emails', e.id)))
  addresses.forEach((address, i) => {
    batch.set(doc(collection(contactRef, 'emails')), {
      ownerId,
      address,
      isPrimary: i === 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  await batch.commit()
}
