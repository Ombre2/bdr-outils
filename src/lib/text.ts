/** Minuscules, sans accents, espaces normalisés : base de la recherche et du tri. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Nettoie une saisie texte : trim, suppression des caractères de contrôle, longueur max. */
export function cleanText(value: string | undefined | null, max: number): string | null {
  if (value == null) return null
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.slice(0, max)
}

/** Champ CSV / export : neutralise l'injection de formules (=, +, -, @, tab, CR). */
// Neutralise les débuts de formules : =, @, tabulation, retour à la ligne, et + ou -
// (Excel lit « - Ils… » comme une formule). Un numéro « +261 34… » ou « -5 » reste intact.
export function neutralizeFormula(value: string): string {
  if (/^[=@\t\r\n]/.test(value)) return `'${value}`
  if (/^[+-]/.test(value) && !/^[+-][\d\s().-]*$/.test(value)) return `'${value}`
  return value
}

/** Profil LinkedIn : accepté seulement vers linkedin.com, en https. Renvoie l'URL normalisée ou null. */
export function safeLinkedinUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme.replace(/^http:\/\//i, 'https://'))
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || !(host === 'linkedin.com' || host.endsWith('.linkedin.com'))) return null
    return url.toString().slice(0, 300)
  } catch {
    return null
  }
}

/** Lien web : https uniquement, sinon null. */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
