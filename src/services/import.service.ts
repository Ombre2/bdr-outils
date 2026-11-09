import { mergeAccounts, type PlannedContact } from '@/lib/csv-import'
import { countryByCode } from '@/lib/geo'
import { createAccount } from '@/services/accounts.repo'
import { createContactsBulk, type ContactInput } from '@/services/contacts.repo'

export interface ImportOptions {
  createMissingAccounts: boolean
  accountIdByKey: Map<string, string> // nom normalisé -> id des comptes existants
  onProgress?: (stage: string, done: number, total: number) => void
}

export interface ImportResult {
  contactsCreated: number
  contactsFailed: number
  phonesIncomplete: number
  subError: string | null // code d'erreur Firebase de l'écriture des numéros, s'il y en a une
  accountsCreated: number
  accountsLinked: number
}

/**
 * Importe les lignes validées.
 * 1. Les comptes absents sont créés (une fois par entreprise, avec ses informations du fichier).
 * 2. Les comptes existants ne sont jamais modifiés : les contacts y sont seulement rattachés.
 * 3. Les contacts sont écrits par lots.
 */
export async function runImport(
  ownerId: string,
  rows: PlannedContact[],
  options: ImportOptions,
): Promise<ImportResult> {
  const accountIds = new Map(options.accountIdByKey)
  const merged = mergeAccounts(rows)
  let accountsCreated = 0
  let accountsLinked = 0

  let accountIndex = 0
  for (const [key, acc] of merged) {
    accountIndex += 1
    options.onProgress?.('Comptes', accountIndex, merged.size)
    if (accountIds.has(key)) {
      accountsLinked += 1
      continue
    }
    if (!options.createMissingAccounts) continue

    const firstSource = rows.find((r) => r.account?.key === key)?.source ?? null
    const id = await createAccount(ownerId, {
      name: acc.name,
      website: acc.website ?? '',
      industry: acc.industry ?? '',
      headcount: acc.headcount,
      description: acc.description ?? '',
      country: acc.country,
      city: acc.city ?? '',
      timezone: acc.country ? countryByCode(acc.country)?.timezone ?? null : null,
      source: firstSource,
    })
    accountIds.set(key, id)
    accountsCreated += 1
  }

  const inputs: ContactInput[] = rows.map((row) => {
    const key = row.account?.key ?? null
    const accountId = key ? (accountIds.get(key) ?? null) : null
    return {
      firstName: row.firstName,
      lastName: row.lastName,
      title: row.title ?? '',
      emails: row.emails,
      linkedinUrl: row.linkedinUrl,
      description: row.description ?? '',
      source: row.source,
      accountId,
      accountName: accountId ? row.account!.name : null,
      status: row.status,
      country: row.country,
      city: row.city ?? '',
      timezone: row.timezone,
      phones: row.phones,
    }
  })

  const result = await createContactsBulk(ownerId, inputs, (done, total) =>
    options.onProgress?.('Contacts', done, total),
  )
  return {
    contactsCreated: result.created,
    contactsFailed: result.failed,
    phonesIncomplete: result.phonesIncomplete,
    subError: result.subError,
    accountsCreated,
    accountsLinked,
  }
}
