import Papa from 'papaparse'
import { neutralizeFormula } from '@/lib/text'
import { formatDateTime } from '@/lib/time'
import { formatPhone } from '@/lib/phone'
import { outcomeLabel, type Account, type Call, type Contact, type Phone } from '@/types/models'

type Cell = string | number | null | undefined

/**
 * CSV avec BOM. Chaque cellule texte est neutralisée contre l'injection de formules (=, +, -, @).
 * Séparateur « ; » par défaut : format du modèle d'import, relu par l'écran d'import.
 */
export function toCsv(headers: string[], rows: Cell[][], delimiter = ';'): string {
  const safe = rows.map((row) =>
    row.map((cell) => (typeof cell === 'string' ? neutralizeFormula(cell) : cell ?? '')),
  )
  const body = Papa.unparse({ fields: headers, data: safe }, { delimiter, newline: '\r\n', quotes: true })
  return `\uFEFF${body}`
}

/**
 * Fichier d'export pour Excel : tabulations + UTF-16LE.
 * Excel l'ouvre en colonnes quelle que soit la langue de Windows (« ; » ou « , » selon le pays),
 * avec les accents et les notes sur plusieurs lignes.
 */
function toExportCsv(headers: string[], rows: Cell[][]): string {
  return toCsv(headers, rows, '\t')
}

/** Encode le texte en UTF-16LE (le BOM U+FEFF en tête du texte devient FF FE). */
export function utf16le(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(text.length * 2))
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes[i * 2] = code & 0xff
    bytes[i * 2 + 1] = code >> 8
  }
  return bytes
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

/** Date d'un champ Timestamp, vide si absente. */
function dateCell(ts: { toDate(): Date } | null | undefined): string {
  return ts ? formatDateTime(ts.toDate()) : ''
}

/**
 * Numéro lisible et gardé en texte par Excel : « +261 34 11 611 76 » (sans espaces, Excel l'affiche en 2.61E+11).
 * Numéro non reconnu et uniquement en chiffres : apostrophe pour forcer le texte.
 */
function phoneCell(number: string): string {
  const formatted = formatPhone(number)
  return /^\+?\d+$/.test(formatted) ? `'${formatted}` : formatted
}

/** Données liées aux contacts, fournies par l'écran (annuaire, appels chargés). */
export interface ContactsCsvLookups {
  phonesOf: (contactId: string) => Phone[]
  emailsOf: (contactId: string) => { address: string; isPrimary: boolean }[]
  accountById: (accountId: string | null) => Account | undefined
  cadenceName?: (cadenceId: string | null | undefined) => string | undefined
  /** Vue admin seulement : ajoute la colonne « Propriétaire ». */
  ownerEmail?: (ownerId: string) => string | null
  /** Tous les appels du contact, du plus récent au plus ancien (voir `groupCallsByContact`). */
  callsOf?: (contactId: string) => Call[]
  lastRdv?: (contactId: string) => Date | undefined
}

/** Appels regroupés par contact, du plus récent au plus ancien. */
export function groupCallsByContact(calls: Call[]): Map<string, Call[]> {
  const map = new Map<string, Call[]>()
  for (const call of calls) map.set(call.contactId, [...(map.get(call.contactId) ?? []), call])
  for (const list of map.values()) list.sort((a, b) => b.calledAt.toMillis() - a.calledAt.toMillis())
  return map
}

// Limite d'une cellule Excel : 32 767 caractères
const MAX_CELL = 32_000

/**
 * Notes d'appel : chaque « - » (puce) passe à la ligne.
 * « point 1 - point 2 » → « point 1\n- point 2 ». Un tiret sans espaces (« Jean-Pierre ») ne bouge pas.
 */
export function notesCell(notes: string | null | undefined): string {
  return (notes ?? '').trim().replace(/\r\n?/g, '\n').replace(/\s+-\s+/g, '\n- ')
}

/** Un appel par ligne dans la cellule : « 19/11/2026 16:33 · Argumenté · notes ». */
function callsHistoryCell(calls: Call[]): string {
  const text = calls
    .map((c) => [formatDateTime(c.calledAt.toDate()), outcomeLabel(c.outcome), notesCell(c.notes)].filter(Boolean).join(' · '))
    .join('\n')
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL)}\n… (historique tronqué)` : text
}

export function contactsCsv(contacts: Contact[], lookups: ContactsCsvLookups): string {
  const { phonesOf, emailsOf, accountById, cadenceName, ownerEmail, callsOf, lastRdv } = lookups
  // Colonnes de l'entreprise d'abord, puis celles du contact
  const headers = [
    'Entreprise',
    'Site web entreprise',
    'Industrie',
    'Headcount',
    'Pays entreprise',
    'Ville entreprise',
    'Prénom',
    'Nom',
    'Poste',
    'Email principal',
    'Autres emails',
    'Téléphone principal',
    'Autres téléphones',
    'Statut',
    'Source',
    'Pays',
    'Ville',
    'Fuseau horaire',
    'Description',
    'Profil LinkedIn',
    'Cadence',
    'Étapes cadence faites',
    'Nombre d\'appels',
    'Dernier appel',
    'Résultat dernier appel',
    'Notes dernier appel',
    'Appels',
    'Dernier RDV',
    'Prochain rappel',
    'Changement de statut',
    'Créé le',
    ...(ownerEmail ? ['Propriétaire'] : []),
  ]
  const rows: Cell[][] = contacts.map((c) => {
    const phones = phonesOf(c.id)
    const primary = phones.find((p) => p.isPrimary) ?? phones[0]
    const others = phones.filter((p) => p !== primary).map((p) => (p.label ? `${p.label} : ${phoneCell(p.number)}` : phoneCell(p.number)))
    const mails = emailsOf(c.id)
    const mainMail = mails.find((m) => m.isPrimary)?.address ?? mails[0]?.address ?? c.email ?? ''
    const otherMails = mails.map((m) => m.address).filter((a) => a !== mainMail)
    const account = accountById(c.accountId)
    const calls = callsOf?.(c.id) ?? []
    const call = calls[0]
    const rdv = lastRdv?.(c.id)
    return [
      account?.name ?? c.accountName ?? '',
      account?.website,
      account?.industry,
      account?.headcount,
      account?.country,
      account?.city,
      c.firstName,
      c.lastName,
      c.title,
      mainMail,
      otherMails.join(' ; '),
      primary ? phoneCell(primary.number) : '',
      others.join(' ; '),
      c.status,
      c.source,
      c.country,
      c.city,
      c.timezone,
      c.description,
      c.linkedinUrl,
      cadenceName?.(c.cadenceId) ?? '',
      c.cadenceId ? (c.cadenceStep ?? 0) : '',
      calls.length,
      // Sans appel chargé : la date gardée sur le contact
      call ? formatDateTime(call.calledAt.toDate()) : dateCell(c.lastCallAt),
      call ? outcomeLabel(call.outcome) : '',
      notesCell(call?.notes),
      callsHistoryCell(calls),
      rdv ? formatDateTime(rdv) : '',
      dateCell(c.nextReminderAt),
      dateCell(c.statusChangedAt),
      dateCell(c.createdAt),
      ...(ownerEmail ? [ownerEmail(c.ownerId) ?? ''] : []),
    ]
  })
  return toExportCsv(headers, rows)
}

/** Données liées aux comptes, fournies par l'écran. */
export interface AccountsCsvLookups {
  contactCount: (accountId: string) => number
  /** RDV affiché pour le compte : le prochain à venir, sinon le dernier passé. */
  rdvOf?: (accountId: string) => { at: Date; contactName: string } | undefined
  /** Vue admin seulement : ajoute la colonne « Propriétaire ». */
  ownerEmail?: (ownerId: string) => string | null
}

export function accountsCsv(accounts: Account[], lookups: AccountsCsvLookups): string {
  const { contactCount, rdvOf, ownerEmail } = lookups
  const headers = [
    'Entreprise',
    'Site web',
    'Industrie',
    'Headcount',
    'Source',
    'Pays',
    'Ville',
    'Fuseau horaire',
    'Description',
    'Nombre de contacts',
    'RDV',
    'Contact du RDV',
    'Créé le',
    ...(ownerEmail ? ['Propriétaire'] : []),
  ]
  const rows: Cell[][] = accounts.map((a) => {
    const rdv = rdvOf?.(a.id)
    return [
      a.name,
      a.website,
      a.industry,
      a.headcount,
      a.source,
      a.country,
      a.city,
      a.timezone,
      a.description,
      contactCount(a.id),
      rdv ? formatDateTime(rdv.at) : '',
      rdv?.contactName ?? '',
      dateCell(a.createdAt),
      ...(ownerEmail ? [ownerEmail(a.ownerId) ?? ''] : []),
    ]
  })
  return toExportCsv(headers, rows)
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
    c.calledPhone ? phoneCell(c.calledPhone) : '',
    c.outcome,
    notesCell(c.notes),
    c.nextReminderAt ? formatDateTime(c.nextReminderAt.toDate()) : '',
  ])
  return toExportCsv(headers, rows)
}
