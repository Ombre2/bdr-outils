import type { Timestamp } from 'firebase/firestore'

export const CONTACT_STATUSES = ['Cold', 'En cours', 'Qualifié', 'Disqualifié', 'Ne plus contacter'] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

// Statuts qui demandent un motif (texte) à chaque changement
export const STATUSES_REQUIRING_REASON: readonly ContactStatus[] = ['Disqualifié', 'Ne plus contacter']

export const PHONE_LABELS =['Mobile', 'Bureau', 'Standard', 'Direct', 'Autre'] as const
export type PhoneLabel = (typeof PHONE_LABELS)[number]

export const CALL_OUTCOMES = [
  'NPR',
  'Messagerie',
  'Mauvais numéro',
  'Dead',
  'Not good Contact',
  'Nurturing',
  'R1',
  'No Show',
  'Argumenté',
  'Rappel demandé',
  'RDV pris',
  'Refus',
] as const
export type CallOutcome = (typeof CALL_OUTCOMES)[number]

// Autres actions que l'appel, journalisées sur un contact
export const ACTIVITY_TYPES = ['Email envoyé', 'Message LinkedIn', 'Demande de connexion LinkedIn', 'Autre'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

// Cadence : suite d'étapes (appel, email, LinkedIn) à dates relatives au démarrage
export const CADENCE_CHANNELS = ['Appel', 'Email', 'LinkedIn'] as const
export type CadenceChannel = (typeof CADENCE_CHANNELS)[number]
export const MAX_CADENCE_STEPS = 20

export const MAX_PHONES_PER_CONTACT = 5
export const MAX_EMAILS_PER_CONTACT = 5

export interface Account {
  id: string
  ownerId: string
  name: string
  website: string | null
  industry: string | null
  headcount: string | null // plage libre, ex. « 11-50 »
  source: string | null
  description: string | null
  country: string | null
  city: string | null
  timezone: string | null
  searchName: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Contact {
  id: string
  ownerId: string
  accountId: string | null
  accountName: string | null
  firstName: string
  lastName: string
  title: string | null
  email: string | null
  linkedinUrl: string | null
  description: string | null
  source: string | null
  status: ContactStatus
  cadenceId?: string | null // cadence en cours
  cadenceStartedAt?: Timestamp | null
  cadenceStep?: number // nombre d'étapes faites
  country: string | null
  city: string | null
  timezone: string | null
  nextReminderAt: Timestamp | null
  lastCallAt: Timestamp | null
  statusChangedAt: Timestamp
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Call {
  id: string
  ownerId: string
  contactId: string
  accountId: string | null
  calledAt: Timestamp
  calledPhone: string | null // E.164 du numéro réellement composé
  outcome: CallOutcome
  notes: string | null
  nextReminderAt: Timestamp | null
  meetingAt?: Timestamp | null // date et heure du RDV, obligatoire si résultat « RDV pris »
  createdAt: Timestamp
  editedAt?: Timestamp | null // dernière correction
}

export interface Activity {
  id: string
  ownerId: string
  contactId: string
  accountId: string | null
  type: ActivityType
  occurredAt: Timestamp
  notes: string | null
  createdAt: Timestamp
}

export interface CadenceStep {
  dayOffset: number // jours après le démarrage de la cadence
  channel: CadenceChannel
  label: string
}

export interface Cadence {
  id: string
  ownerId: string
  name: string
  steps: CadenceStep[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Un changement de statut d'un contact (journal, non modifiable). */
export interface StatusChange {
  id: string
  ownerId: string
  contactId: string
  fromStatus: ContactStatus | null
  toStatus: ContactStatus
  reason: string | null
  changedAt: Timestamp
  createdAt: Timestamp
}

export interface ContactEmail {
  id: string
  contactId: string
  ownerId: string
  address: string // minuscules
  isPrimary: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Phone {
  id: string
  contactId: string
  ownerId: string
  number: string // E.164
  label: PhoneLabel
  isPrimary: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}
