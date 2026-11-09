import { CONTACT_STATUSES, type ContactStatus, type PhoneLabel } from '@/types/models'
import { allTimezones, COUNTRIES, countryByCode } from '@/lib/geo'
import { parsePhone } from '@/lib/phone'
import { cleanText, normalizeText, safeHttpsUrl, safeLinkedinUrl } from '@/lib/text'

export const MAX_IMPORT_ROWS = 2000
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** Champs du contact, dans l'ordre d'affichage du mapping. */
export const CONTACT_FIELDS = [
  'fullName',
  'firstName',
  'lastName',
  'title',
  'linkedinUrl',
  'status',
  'source',
  'country',
  'city',
  'timezone',
  'description',
] as const

/** Champs du compte (entreprise). */
export const ACCOUNT_FIELDS = [
  'accountName',
  'website',
  'industry',
  'headcount',
  'accountCountry',
  'accountCity',
  'accountDescription',
] as const

export type ContactField = (typeof CONTACT_FIELDS)[number]
export type AccountField = (typeof ACCOUNT_FIELDS)[number]
export type MappingField = ContactField | AccountField

export const FIELD_LABELS: Record<MappingField | 'phones' | 'emails', string> = {
  fullName: 'Nom complet (découpé : 1er mot = prénom)',
  firstName: 'Prénom',
  lastName: 'Nom',
  title: 'Poste',
  linkedinUrl: 'Profil LinkedIn',
  status: 'Statut',
  source: 'Source',
  country: 'Pays (personne)',
  city: 'Ville (personne)',
  timezone: 'Fuseau horaire',
  description: 'Description (personne)',
  accountName: 'Entreprise (nom du compte)',
  website: 'Site web',
  industry: 'Industrie',
  headcount: 'Headcount (ex. 11-50)',
  accountCountry: 'Pays (entreprise)',
  accountCity: 'Ville (entreprise)',
  accountDescription: 'Description (entreprise)',
  phones: 'Téléphones (une ou plusieurs colonnes)',
  emails: 'Emails (une ou plusieurs colonnes)',
}

/** Correspondance : champs de l'application et colonnes du fichier. */
export interface Mapping {
  fields: Partial<Record<MappingField, string>> // champ de l'app -> en-tête du CSV
  phones: string[] // en-têtes des colonnes de téléphone
  emails: string[] // en-têtes des colonnes d'email
}

export const EMPTY_MAPPING: Mapping = { fields: {}, phones: [], emails: [] }

/** Nom obligatoire : soit un nom complet, soit prénom ET nom. */
export function isMappingValid(mapping: Mapping): boolean {
  return Boolean(mapping.fields.fullName || (mapping.fields.firstName && mapping.fields.lastName))
}

/** Avertissements affichés avant l'import (ne bloquent pas). */
export function mappingWarnings(mapping: Mapping): string[] {
  const warnings: string[] = []
  if (!mapping.fields.accountName) warnings.push('Aucune colonne Entreprise : les contacts seront créés sans compte.')
  if (mapping.phones.length === 0) {
    warnings.push('Aucune colonne Téléphone : toutes les lignes seront rejetées (un numéro est obligatoire).')
  }
  return warnings
}

// Reconnaissance automatique des en-têtes, après normalisation (minuscules, sans accents, _ et - remplacés par des espaces)
const HEADER_RULES: { target: MappingField; re: RegExp }[] = [
  { target: 'fullName', re: /^(name|nom complet|full name|nom et prenom|nom prenom)$/ },
  { target: 'firstName', re: /^(prenom|first name|given name)$/ },
  { target: 'lastName', re: /^(nom|last name|family name|surname)$/ },
  { target: 'title', re: /^(title|poste|titre|job title|fonction)$/ },
  { target: 'linkedinUrl', re: /^(linkedin|linkedin profile|linkedin url|profil linkedin|profile url)$/ },
  { target: 'status', re: /^(status|statut)$/ },
  { target: 'source', re: /^(source|favorite agent|agent)$/ },
  { target: 'accountName', re: /^(company|entreprise|societe|organisation|organization|compte)$/ },
  { target: 'website', re: /^(website|site|site web|url)$/ },
  { target: 'industry', re: /^(industry|industrie|secteur)$/ },
  { target: 'headcount', re: /^(headcount|effectif|employees|taille)$/ },
  // « Pays » et « Ville » de la personne : pilotent le fuseau horaire du contact
  { target: 'country', re: /^(country|pays|pays personne)$/ },
  { target: 'city', re: /^(city|ville|ville personne)$/ },
  { target: 'accountCountry', re: /^(pays entreprise|company country)$/ },
  { target: 'accountCity', re: /^(ville entreprise|company city)$/ },
  { target: 'description', re: /^(description|notes?|commentaire)$/ },
]
const EMAIL_HEADER = /^(e ?mail|mail|courriel)( ?\d+)?$/
const PHONE_HEADER = /(phone|tel|telephone|mobile|portable|gsm)/

function headerKey(header: string): string {
  return normalizeText(header).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Pré-remplit la correspondance à partir des en-têtes du fichier.
 * Chaque colonne n'est utilisée qu'une fois ; les colonnes non reconnues sont ignorées.
 * Le résultat reste modifiable à la main.
 */
export function detectMapping(headers: string[]): Mapping {
  const used = new Set<string>()
  const mapping: Mapping = { fields: {}, phones: [], emails: [] }

  for (const rule of HEADER_RULES) {
    const match = headers.find((h) => !used.has(h) && rule.re.test(headerKey(h)))
    if (!match) continue
    // Un nom complet remplace prénom/nom séparés
    if (rule.target === 'fullName' && mapping.fields.firstName) continue
    if ((rule.target === 'firstName' || rule.target === 'lastName') && mapping.fields.fullName) continue
    mapping.fields[rule.target] = match
    used.add(match)
  }

  for (const h of headers) {
    if (used.has(h)) continue
    if (EMAIL_HEADER.test(headerKey(h))) {
      mapping.emails.push(h)
      used.add(h)
    } else if (PHONE_HEADER.test(headerKey(h))) {
      mapping.phones.push(h)
      used.add(h)
    }
  }
  return mapping
}

const STATUS_BY_NORMALIZED = new Map(CONTACT_STATUSES.map((s) => [normalizeText(s), s]))

const MAX_PER_CONTACT = 5
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Séparateurs acceptés dans une même cellule. Les espaces ne sont pas des séparateurs pour les numéros
// (« 034 12 345 67 » reste un seul numéro) ; pour les emails, aucun espace n'est possible.
const PHONE_SEPARATORS = /[:;,/|\n\r]+/
const EMAIL_SEPARATORS = /[\s:;,/|\n\r]+/

/** Découpe une cellule en valeurs non vides. */
export function splitCell(value: string, separators: RegExp): string[] {
  return value
    .split(separators)
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

function phoneLabelFromHeader(header: string): PhoneLabel {
  const h = normalizeText(header)
  if (/mobile|portable|gsm/.test(h)) return 'Mobile'
  if (/bureau|office|pro|travail/.test(h)) return 'Bureau'
  return 'Standard'
}

/** Pays saisi en code ISO ou en nom (français), insensible à la casse et aux accents. */
export function resolveCountry(value: string): string | null {
  const v = value.trim()
  if (/^[A-Za-z]{2}$/.test(v) && countryByCode(v.toUpperCase())) return v.toUpperCase()
  const n = normalizeText(v)
  return COUNTRIES.find((c) => normalizeText(c.name) === n)?.code ?? null
}

/** Nom complet : le premier mot est le prénom, le reste le nom. */
export function splitFullName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export type RowStatus = 'ready' | 'warning' | 'error' | 'duplicate'

export interface PlannedAccount {
  key: string // nom normalisé : clé de regroupement
  name: string
  website: string | null
  industry: string | null
  headcount: string | null
  country: string | null
  city: string | null
  description: string | null
}

export interface PlannedContact {
  firstName: string
  lastName: string
  title: string | null
  emails: string[] // le premier est l'email principal
  linkedinUrl: string | null
  description: string | null
  source: string | null
  status: ContactStatus
  country: string | null
  city: string | null
  timezone: string | null
  phones: { number: string; label: PhoneLabel; isPrimary: boolean }[]
  account: PlannedAccount | null
}

export interface PlannedRow {
  line: number // numéro de ligne dans le fichier (en-tête exclu : la première donnée est la ligne 2)
  status: RowStatus
  messages: string[]
  contact?: PlannedContact
}

export interface PlanOptions {
  mapping: Mapping
  defaultCountry: string | null // pays par défaut pour les numéros sans indicatif
  existingEmails: Set<string> // tous les emails déjà en base (minuscules)
  existingPhones: Set<string> // numéros E.164 déjà en base
  existingAccountKeys: Set<string> // noms normalisés des comptes déjà en base
}

export const EXISTING_ACCOUNT_MESSAGE = 'Compte déjà existant : ses informations ne sont pas modifiées, le contact y sera rattaché.'

/**
 * Nettoie et valide chaque ligne. Aucune donnée n'est écrite ici.
 * - error : nom manquant, ou aucun téléphone ni email valide
 * - warning : valeur corrigée ou retirée (détaillée dans messages)
 * - duplicate : contact déjà en base ou répété dans le fichier
 */
export function planImport(rows: Record<string, string>[], options: PlanOptions): PlannedRow[] {
  const { mapping, defaultCountry } = options
  const seenEmails = new Set<string>()
  const seenPhones = new Set<string>()
  const plan: PlannedRow[] = []

  rows.slice(0, MAX_IMPORT_ROWS).forEach((raw, index) => {
    const line = index + 2
    const messages: string[] = []
    const info: string[] = [] // remarques qui ne rendent pas la ligne « corrigée »
    const get = (field: MappingField): string => (mapping.fields[field] ? (raw[mapping.fields[field]!] ?? '') : '')

    // Nom : colonne « nom complet » découpée, ou prénom et nom séparés
    let firstName: string | null
    let lastName: string | null
    if (mapping.fields.fullName) {
      const split = splitFullName(get('fullName'))
      firstName = cleanText(split.firstName, 80)
      lastName = cleanText(split.lastName, 80)
      if (!firstName || !lastName) {
        plan.push({ line, status: 'error', messages: ['Nom complet d\'un seul mot : prénom et nom requis.'] })
        return
      }
    } else {
      firstName = cleanText(get('firstName'), 80)
      lastName = cleanText(get('lastName'), 80)
      if (!firstName || !lastName) {
        plan.push({ line, status: 'error', messages: ['Prénom ou nom manquant.'] })
        return
      }
    }

    // Pays de la personne : sert aussi de repli pour les numéros
    let country: string | null = null
    const rawCountry = get('country').trim()
    if (rawCountry) {
      country = resolveCountry(rawCountry)
      if (!country) messages.push(`Pays « ${rawCountry} » non reconnu : champ laissé vide.`)
    }
    const fallbackCountry = country ?? defaultCountry

    // Téléphones : une cellule peut contenir plusieurs numéros (séparés par : ; , / ou retour à la ligne)
    const phones: PlannedContact['phones'] = []
    for (const header of mapping.phones) {
      for (const value of splitCell(raw[header] ?? '', PHONE_SEPARATORS)) {
        const parsed = parsePhone(value, fallbackCountry ?? undefined)
        if (!parsed) {
          messages.push(`Numéro invalide ignoré : « ${value} ».`)
          continue
        }
        if (phones.some((p) => p.number === parsed.e164)) continue
        phones.push({ number: parsed.e164, label: phoneLabelFromHeader(header), isPrimary: false })
      }
    }
    if (phones.length > 0) phones[0].isPrimary = true
    if (phones.length > MAX_PER_CONTACT) {
      phones.length = MAX_PER_CONTACT
      messages.push(`Plus de ${MAX_PER_CONTACT} numéros : seuls les ${MAX_PER_CONTACT} premiers sont gardés.`)
    }

    // Emails : une ou plusieurs colonnes, plusieurs par cellule possibles, format vérifié, minuscules
    const emails: string[] = []
    for (const header of mapping.emails) {
      for (const value of splitCell(raw[header] ?? '', EMAIL_SEPARATORS)) {
        const address = value.toLowerCase()
        if (!EMAIL_RE.test(address) || address.length > 254) {
          messages.push(`Email invalide ignoré : « ${value} ».`)
          continue
        }
        if (!emails.includes(address)) emails.push(address)
      }
    }
    if (emails.length > MAX_PER_CONTACT) {
      emails.length = MAX_PER_CONTACT
      messages.push(`Plus de ${MAX_PER_CONTACT} emails : seuls les ${MAX_PER_CONTACT} premiers sont gardés.`)
    }

    // Règle : chaque contact doit avoir au moins un numéro de téléphone valide
    if (phones.length === 0) {
      plan.push({ line, status: 'error', messages: ['Aucun numéro de téléphone valide : contact non importé.'] })
      return
    }

    // Profil LinkedIn : seulement une URL linkedin.com valide, sinon ignorée avec un avertissement
    let linkedinUrl: string | null = null
    const rawLinkedin = get('linkedinUrl').trim()
    if (rawLinkedin) {
      linkedinUrl = safeLinkedinUrl(rawLinkedin)
      if (!linkedinUrl) messages.push(`Profil LinkedIn « ${rawLinkedin} » invalide : ignoré.`)
    }

    // Statut : casse et accents tolérés, sinon « Cold »
    let status: ContactStatus = 'Cold'
    const rawStatus = get('status').trim()
    if (rawStatus) {
      const matched = STATUS_BY_NORMALIZED.get(normalizeText(rawStatus))
      if (matched) status = matched
      else messages.push(`Statut « ${rawStatus} » inconnu : « Cold » appliqué.`)
    }

    // Fuseau : liste IANA, sinon fuseau du pays
    let timezone: string | null = null
    const rawTz = get('timezone').trim()
    if (rawTz) {
      if (allTimezones().includes(rawTz)) timezone = rawTz
      else messages.push(`Fuseau « ${rawTz} » inconnu : fuseau du pays appliqué.`)
    }
    if (!timezone && country) timezone = countryByCode(country)?.timezone ?? null

    // Compte (entreprise) : informations normalisées
    let account: PlannedAccount | null = null
    const accountName = cleanText(get('accountName'), 120)
    if (accountName) {
      const key = normalizeText(accountName)
      const rawWebsite = get('website').trim()
      const website = safeHttpsUrl(rawWebsite)
      if (rawWebsite && !website) messages.push(`Site web « ${rawWebsite} » invalide : ignoré.`)

      const rawAccountCountry = get('accountCountry').trim()
      let accountCountry: string | null = null
      if (rawAccountCountry) {
        accountCountry = resolveCountry(rawAccountCountry)
        if (!accountCountry) messages.push(`Pays de l'entreprise « ${rawAccountCountry} » non reconnu : champ laissé vide.`)
      }

      account = {
        key,
        name: accountName,
        website,
        industry: cleanText(get('industry'), 100),
        headcount: cleanText(get('headcount'), 40),
        // Sans pays d'entreprise, on reprend le pays de la personne (même entreprise, même pays dans la plupart des cas)
        country: accountCountry ?? country,
        city: cleanText(get('accountCity'), 80),
        description: cleanText(get('accountDescription'), 2000),
      }
      if (options.existingAccountKeys.has(key)) info.push(EXISTING_ACCOUNT_MESSAGE)
    } else if (mapping.fields.accountName) {
      messages.push('Entreprise vide : contact créé sans compte.')
    }

    // Doublon : un email OU un téléphone déjà connu (en base ou plus haut dans le fichier)
    const duplicateReasons: string[] = []
    if (emails.some((e) => seenEmails.has(e) || options.existingEmails.has(e))) duplicateReasons.push('email')
    if (phones.some((p) => seenPhones.has(p.number) || options.existingPhones.has(p.number))) duplicateReasons.push('téléphone')
    if (duplicateReasons.length > 0) {
      plan.push({ line, status: 'duplicate', messages: [`Doublon (${duplicateReasons.join(' et ')}) : ligne ignorée.`] })
      return
    }
    emails.forEach((e) => seenEmails.add(e))
    phones.forEach((p) => seenPhones.add(p.number))

    const contact: PlannedContact = {
      firstName,
      lastName,
      title: cleanText(get('title'), 120),
      linkedinUrl,
      emails,
      description: cleanText(get('description'), 2000),
      source: cleanText(get('source'), 120),
      status,
      country,
      city: cleanText(get('city'), 80),
      timezone,
      phones,
      account,
    }
    plan.push({
      line,
      status: messages.length > 0 ? 'warning' : 'ready',
      messages: [...messages, ...info],
      contact,
    })
  })

  if (rows.length > MAX_IMPORT_ROWS) {
    plan.push({ line: 0, status: 'error', messages: [`Fichier limité à ${MAX_IMPORT_ROWS} lignes : le reste est ignoré.`] })
  }
  return plan
}

/**
 * Un compte présent sur plusieurs lignes : on garde la première valeur non vide de chaque champ.
 * Les valeurs contradictoires ne sont pas fusionnées : la première l'emporte.
 */
export function mergeAccounts(rows: PlannedContact[]): Map<string, PlannedAccount> {
  const merged = new Map<string, PlannedAccount>()
  const fields = ['website', 'industry', 'headcount', 'country', 'city', 'description'] as const
  for (const row of rows) {
    const acc = row.account
    if (!acc) continue
    const current = merged.get(acc.key)
    if (!current) {
      merged.set(acc.key, { ...acc })
      continue
    }
    for (const f of fields) {
      if (!current[f] && acc[f]) current[f] = acc[f] as never
    }
  }
  return merged
}
