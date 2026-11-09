import Papa from 'papaparse'
import { neutralizeFormula } from '@/lib/text'
import { formatDateTime } from '@/lib/time'
import type { Account, Call, Contact, Phone } from '@/types/models'

type Cell = string | number | null | undefined

/**
 * CSV prêt pour Excel (France) : séparateur « ; », BOM UTF-8 pour les accents.
 * Chaque cellule texte est neutralisée contre l'injection de formules (=, +, -, @).
 */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const safe = rows.map((row) =>
    row.map((cell) => (typeof cell === 'string' ? neutralizeFormula(cell) : cell ?? '')),
  )
  const body = Papa.unparse({ fields: headers, data: safe }, { delimiter: ';', newline: '\r\n', quotes: true })
  return `﻿${body}`
}

/** En-têtes du modèle d'import, dans l'ordre. Les exemples utilisent des données fictives. */
export const IMPORT_TEMPLATE_HEADERS = [
  'Prénom',
  'Nom',
  'Poste',
  'Email',
  'Téléphone',
  'Mobile',
  'Entreprise',
  'Site web',
  'Industrie',
  'Headcount',
  'Pays entreprise',
  'Ville entreprise',
  'Source',
  'Statut',
  'Pays',
  'Ville',
]

const IMPORT_TEMPLATE_ROWS: Cell[][] = [
  [
    'Awa', 'Koné', 'DRH', 'awa.kone@exemple.com ; awa.perso@exemple.com', '+261 34 12 345 67 : +261 32 52 82 013', '',
    'Acme Exemple', 'https://acme-exemple.com', 'Logiciel', '11-50', 'Madagascar', 'Antananarivo', 'Salon 2026', 'Cold', 'Madagascar', 'Antananarivo',
  ],
  [
    'Jean', 'Rakoto', 'Directeur achats', 'jean.rakoto@beta-exemple.mg', '034 12 345 67', '',
    'Beta Exemple', 'beta-exemple.mg', 'Distribution', '201-500', 'Madagascar', 'Antananarivo', '', 'En cours', 'Madagascar', 'Antananarivo',
  ],
  [
    'Sara', 'Diop', '', 'sara.diop@gamma-exemple.sn', '', '+261 32 52 82 013',
    'Gamma Exemple', '', '', '', 'Madagascar', '', 'Liste LinkedIn', 'Qualifié', 'Sénégal', 'Dakar',
  ],
]

/** Modèle de fichier d'import : même format que celui attendu par l'écran de correspondance. */
export function importTemplateCsv(): string {
  return toCsv(IMPORT_TEMPLATE_HEADERS, IMPORT_TEMPLATE_ROWS)
}

export function contactsCsv(
  contacts: Contact[],
  phonesOf: (contactId: string) => Phone[],
  accountName: (accountId: string | null) => string | undefined,
  emailsOf: (contactId: string) => { address: string; isPrimary: boolean }[],
): string {
  const headers = [
    'Prénom',
    'Nom',
    'Poste',
    'Email principal',
    'Autres emails',
    'Téléphone principal',
    'Autres téléphones',
    'Entreprise',
    'Statut',
    'Pays',
    'Ville',
    'Fuseau horaire',
    'Description',
    'Dernier appel',
    'Prochain rappel',
    'Profil LinkedIn',
  ]
  const rows: Cell[][] = contacts.map((c) => {
    const phones = phonesOf(c.id)
    const primary = phones.find((p) => p.isPrimary) ?? phones[0]
    const others = phones.filter((p) => p !== primary).map((p) => p.number)
    const mails = emailsOf(c.id)
    const mainMail = mails.find((m) => m.isPrimary)?.address ?? mails[0]?.address ?? c.email ?? ''
    const otherMails = mails.map((m) => m.address).filter((a) => a !== mainMail)
    return [
      c.firstName,
      c.lastName,
      c.title,
      mainMail,
      otherMails.join(' ; '),
      primary?.number ?? '',
      others.join(' ; '),
      accountName(c.accountId) ?? c.accountName ?? '',
      c.status,
      c.country,
      c.city,
      c.timezone,
      c.description,
      c.lastCallAt ? formatDateTime(c.lastCallAt.toDate()) : '',
      c.nextReminderAt ? formatDateTime(c.nextReminderAt.toDate()) : '',
      c.linkedinUrl ?? '',
    ]
  })
  return toCsv(headers, rows)
}

export function accountsCsv(accounts: Account[], contactCount: (accountId: string) => number): string {
  const headers = ['Entreprise', 'Site web', 'Industrie', 'Headcount', 'Pays', 'Ville', 'Fuseau horaire', 'Description', 'Nombre de contacts']
  const rows: Cell[][] = accounts.map((a) => [
    a.name,
    a.website,
    a.industry,
    a.headcount,
    a.country,
    a.city,
    a.timezone,
    a.description,
    contactCount(a.id),
  ])
  return toCsv(headers, rows)
}

export function callsCsv(
  calls: Call[],
  contactName: (contactId: string) => string,
  accountName: (accountId: string | null) => string | undefined,
): string {
  const headers = ['Date', 'Contact', 'Entreprise', 'Numéro composé', 'Résultat', 'Notes', 'Prochain rappel']
  const rows: Cell[][] = calls.map((c) => [
    formatDateTime(c.calledAt.toDate()),
    contactName(c.contactId),
    accountName(c.accountId) ?? '',
    c.calledPhone,
    c.outcome,
    c.notes,
    c.nextReminderAt ? formatDateTime(c.nextReminderAt.toDate()) : '',
  ])
  return toCsv(headers, rows)
}
