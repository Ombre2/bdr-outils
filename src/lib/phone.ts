import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

export interface ParsedPhone {
  e164: string
  country: CountryCode | undefined
}

/**
 * Normalise un numéro saisi en E.164.
 * Sans indicatif, le pays par défaut (code ISO) est utilisé.
 * Renvoie null si le numéro n'est pas valide.
 */
export function parsePhone(input: string, defaultCountry?: string): ParsedPhone | null {
  // Espaces, tirets, points et parenthèses sont ignorés : « +1 919-864-6942 » -> « +19198646942 »
  let value = input.trim().replace(/[\s\-.()]/g, '')
  if (!value) return null

  // Préfixe international « 00 » : équivalent de « + » (ex. 00225… -> +225…)
  if (value.startsWith('00')) value = `+${value.slice(2)}`

  const country = defaultCountry && /^[A-Z]{2}$/.test(defaultCountry) ? (defaultCountry as CountryCode) : undefined

  // 1) Numéro avec « + », ou numéro national du pays par défaut
  let parsed = parsePhoneNumberFromString(value, country)

  // 2) Indicatif écrit sans « + » (ex. 233 20 811 1165 = Ghana). Testé seulement si 1) échoue,
  //    donc un numéro national valide du pays par défaut n'est jamais réinterprété.
  if ((!parsed || !parsed.isValid()) && /^\d+$/.test(value)) {
    parsed = parsePhoneNumberFromString(`+${value}`)
  }

  if (!parsed || !parsed.isValid()) return null
  return { e164: parsed.number, country: parsed.country }
}

/**
 * Affichage lisible d'un numéro stocké en E.164 : « +233205294019 » -> « +233 20 529 4019 ».
 * Uniquement pour l'affichage : la base et le CSV gardent le format E.164.
 */
export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164)
  return parsed && parsed.isValid() ? parsed.formatInternational() : e164
}

/** Chiffres seuls, pour la recherche (espaces, tirets, + ignorés). */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/** Lien tel: sûr (E.164 uniquement, jamais de texte libre). */
export function telHref(e164: string): string | null {
  return /^\+[1-9][0-9]{6,14}$/.test(e164) ? `tel:${e164}` : null
}
