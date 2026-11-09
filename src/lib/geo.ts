// Pays proposés dans l'application (ISO 3166-1 alpha-2) et fuseau par défaut.
// Les pays à plusieurs fuseaux (CA, US, CD…) demandent un choix manuel.
export interface CountryOption {
  code: string
  name: string
  timezone: string
}

export const COUNTRIES: CountryOption[] = [
  { code: 'MG', name: 'Madagascar', timezone: 'Indian/Antananarivo' },
  { code: 'CI', name: "Côte d'Ivoire", timezone: 'Africa/Abidjan' },
  { code: 'SN', name: 'Sénégal', timezone: 'Africa/Dakar' },
  { code: 'CM', name: 'Cameroun', timezone: 'Africa/Douala' },
  { code: 'BF', name: 'Burkina Faso', timezone: 'Africa/Ouagadougou' },
  { code: 'ML', name: 'Mali', timezone: 'Africa/Bamako' },
  { code: 'BJ', name: 'Bénin', timezone: 'Africa/Porto-Novo' },
  { code: 'TG', name: 'Togo', timezone: 'Africa/Lome' },
  { code: 'GN', name: 'Guinée', timezone: 'Africa/Conakry' },
  { code: 'GA', name: 'Gabon', timezone: 'Africa/Libreville' },
  { code: 'MU', name: 'Maurice', timezone: 'Indian/Mauritius' },
  { code: 'GH', name: 'Ghana', timezone: 'Africa/Accra' },
  { code: 'ZA', name: 'Afrique du Sud', timezone: 'Africa/Johannesburg' },
  { code: 'MT', name: 'Malte', timezone: 'Europe/Malta' },
  { code: 'NL', name: 'Pays-Bas', timezone: 'Europe/Amsterdam' },
  { code: 'RE', name: 'La Réunion', timezone: 'Indian/Reunion' },
  { code: 'MA', name: 'Maroc', timezone: 'Africa/Casablanca' },
  { code: 'TN', name: 'Tunisie', timezone: 'Africa/Tunis' },
  { code: 'DZ', name: 'Algérie', timezone: 'Africa/Algiers' },
  { code: 'FR', name: 'France', timezone: 'Europe/Paris' },
  { code: 'BE', name: 'Belgique', timezone: 'Europe/Brussels' },
  { code: 'CH', name: 'Suisse', timezone: 'Europe/Zurich' },
  { code: 'LU', name: 'Luxembourg', timezone: 'Europe/Luxembourg' },
  { code: 'DE', name: 'Allemagne', timezone: 'Europe/Berlin' },
  { code: 'GB', name: 'Royaume-Uni', timezone: 'Europe/London' },
  { code: 'CA', name: 'Canada', timezone: 'America/Toronto' },
  { code: 'US', name: 'États-Unis', timezone: 'America/New_York' },
]

export function countryByCode(code: string | null | undefined): CountryOption | undefined {
  return COUNTRIES.find((c) => c.code === code)
}

/** Libellé de pays (code ISO) : repli sur le code si inconnu. */
export function countryLabel(code: string | null | undefined): string {
  if (!code) return '—'
  return countryByCode(code)?.name ?? code
}

/** Liste complète des fuseaux IANA, pour les pays multi-fuseaux. */
export function allTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [...new Set(COUNTRIES.map((c) => c.timezone))]
  }
}
