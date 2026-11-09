// Convertit un export de contacts (CSV, n'importe quel format) vers le format d'import de l'application.
//
// Usage :
//   node scripts/convert-contacts.mjs --profile scripts/profiles/linkedin-contacts.json \
//        --input "C:\chemin\fichier.csv" --output "C:\chemin\pret-a-importer.csv" \
//        --report "C:\chemin\rapport-rejets.csv" [--default-country MG]
//
// Le profil dit quelle colonne du fichier correspond à quel champ de l'application (voir docs/PROMPT-CONVERSION.md).
// Aucune donnée n'est envoyée ailleurs : tout se fait sur votre machine.

import fs from 'node:fs'
import Papa from 'papaparse'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

// ---------------------------------------------------------------- arguments
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, value, i, all) => {
    if (value.startsWith('--')) acc.push([value.slice(2), all[i + 1]])
    return acc
  }, []),
)
if (!args.profile || !args.input) {
  console.error('Usage : node scripts/convert-contacts.mjs --profile <profil.json> --input <fichier.csv> [--output ...] [--report ...] [--default-country MG]')
  process.exit(1)
}
const profile = JSON.parse(fs.readFileSync(args.profile, 'utf8'))
const defaultCountry = (args['default-country'] ?? 'MG').toUpperCase()
const outputPath = args.output ?? args.input.replace(/\.csv$/i, '') + '-pret-a-importer.csv'
const reportPath = args.report ?? args.input.replace(/\.csv$/i, '') + '-rejets.csv'

// ---------------------------------------------------------------- pays (même liste que l'application, src/lib/geo.ts)
const COUNTRIES = [
  ['MG', 'Madagascar'], ['CI', "Côte d'Ivoire"], ['SN', 'Sénégal'], ['CM', 'Cameroun'], ['BF', 'Burkina Faso'],
  ['ML', 'Mali'], ['BJ', 'Bénin'], ['TG', 'Togo'], ['GN', 'Guinée'], ['GA', 'Gabon'], ['MU', 'Maurice'],
  ['RE', 'La Réunion'], ['MA', 'Maroc'], ['TN', 'Tunisie'], ['DZ', 'Algérie'], ['FR', 'France'], ['BE', 'Belgique'],
  ['CH', 'Suisse'], ['LU', 'Luxembourg'], ['DE', 'Allemagne'], ['GB', 'Royaume-Uni'], ['CA', 'Canada'],
  ['US', 'États-Unis'], ['GH', 'Ghana'], ['ZA', 'Afrique du Sud'], ['MT', 'Malte'], ['NL', 'Pays-Bas'],
]
const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
function countryCode(value) {
  const v = (value ?? '').trim()
  if (!v) return null
  if (/^[A-Za-z]{2}$/.test(v) && COUNTRIES.some(([c]) => c === v.toUpperCase())) return v.toUpperCase()
  const n = normalize(v)
  return COUNTRIES.find(([, name]) => normalize(name) === n)?.[0] ?? null
}
const countryName = (code) => COUNTRIES.find(([c]) => c === code)?.[1] ?? ''

// ---------------------------------------------------------------- téléphones (même logique que src/lib/phone.ts)
function normalizePhone(raw, country) {
  let v = raw.trim().replace(/[\s\-.()]/g, '')
  if (!v) return null
  if (v.startsWith('00')) v = '+' + v.slice(2)
  let p = parsePhoneNumberFromString(v, country || undefined)
  if ((!p || !p.isValid()) && /^\d+$/.test(v)) p = parsePhoneNumberFromString('+' + v)
  return p && p.isValid() ? p.number : null
}
// Plusieurs numéros dans une cellule : séparateurs « - », « | », « ; », « , », « : », « / » ou retour à la ligne
const splitCell = (value) =>
  (value ?? '').split(/\s+[-|]\s+|[;,|\n\r/:]+/).map((v) => v.trim()).filter(Boolean)
const splitEmails = (value) => (value ?? '').split(/[\s;,|\n\r/:]+/).map((v) => v.trim()).filter(Boolean)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---------------------------------------------------------------- lecture
const text = fs.readFileSync(args.input, 'utf8').replace(/^\uFEFF/, '')
const parsed = Papa.parse(text, { header: true, skipEmptyLines: 'greedy' })
if (parsed.errors.length > 0 && parsed.data.length === 0) {
  console.error('Lecture impossible :', parsed.errors[0].message)
  process.exit(1)
}
const col = (row, name) => (name ? (row[name] ?? '').toString().trim() : '')
const f = profile.fields ?? {}

// ---------------------------------------------------------------- conversion
const OUT_HEADERS = [
  'Prénom', 'Nom', 'Poste', 'Email', 'Téléphone', 'Mobile', 'Entreprise', 'Site web', 'Industrie',
  'Headcount', 'Pays entreprise', 'Ville entreprise', 'Source', 'Statut', 'Pays', 'Ville',
]
const out = []
const rejects = []
const warnings = { paysInconnu: 0, numeroInvalide: 0, emailInvalide: 0 }
const seen = new Set()

parsed.data.forEach((row, index) => {
  const line = index + 2 // première ligne de données = ligne 2 du fichier
  const reject = (reason) => rejects.push({ ligne: line, raison: reason, ...pick(row) })

  // Nom
  let firstName, lastName
  if (f.fullName) {
    const parts = col(row, f.fullName).split(/\s+/).filter(Boolean)
    firstName = parts[0] ?? ''
    lastName = parts.slice(1).join(' ')
  } else {
    firstName = col(row, f.firstName)
    lastName = col(row, f.lastName)
  }
  if (!firstName || !lastName) return reject('Prénom ou nom manquant')

  // Pays de la personne (sert au fuseau horaire et au format des numéros)
  const rawCountry = col(row, f.country)
  let country = countryCode(rawCountry)
  if (rawCountry && !country) warnings.paysInconnu++
  const phoneCountry = country ?? defaultCountry

  // Téléphones : toutes les colonnes de téléphone, valides seulement, sans doublon
  const phones = []
  for (const header of profile.phones ?? []) {
    for (const raw of splitCell(row[header])) {
      const e164 = normalizePhone(raw, phoneCountry)
      if (!e164) {
        warnings.numeroInvalide++
        continue
      }
      if (!phones.includes(e164)) phones.push(e164)
    }
  }
  if (phones.length === 0) return reject('Aucun numéro de téléphone valide')

  // Emails : une ou plusieurs colonnes
  const emails = []
  for (const header of profile.emails ?? []) {
    for (const raw of splitEmails(row[header])) {
      const address = raw.toLowerCase()
      if (!EMAIL_RE.test(address)) {
        warnings.emailInvalide++
        continue
      }
      if (!emails.includes(address)) emails.push(address)
    }
  }

  // Doublons : même identifiant (ex. URL LinkedIn) ou même numéro déjà vu
  const keys = [...(profile.dedupe ?? []).map((h) => col(row, h)).filter(Boolean), ...phones]
  if (keys.some((k) => seen.has(k))) return reject('Doublon (même profil ou même numéro)')
  keys.forEach((k) => seen.add(k))

  const c = profile.constants ?? {}
  out.push([
    firstName,
    lastName,
    col(row, f.title),
    emails.join(' ; '),
    phones.join(' : '),
    '',
    col(row, f.accountName),
    col(row, f.website),
    col(row, f.industry),
    col(row, f.headcount),
    countryCode(col(row, f.accountCountry)) ? countryName(countryCode(col(row, f.accountCountry))) : '',
    col(row, f.accountCity),
    col(row, f.source) || c.source || '',
    c.status ?? 'Cold',
    country ? countryName(country) : '',
    col(row, f.city),
  ])
})

function pick(row) {
  const keep = [f.firstName, f.lastName, f.fullName, ...(profile.phones ?? [])].filter(Boolean)
  return Object.fromEntries(keep.map((k) => [k, row[k] ?? '']))
}

// ---------------------------------------------------------------- écriture
const csv = Papa.unparse({ fields: OUT_HEADERS, data: out }, { delimiter: ';', newline: '\r\n' })
fs.writeFileSync(outputPath, '\uFEFF' + csv, 'utf8')
if (rejects.length > 0) {
  const report = Papa.unparse(rejects, { delimiter: ';', newline: '\r\n' })
  fs.writeFileSync(reportPath, '\uFEFF' + report, 'utf8')
}

console.log(`Profil : ${profile.name ?? args.profile}`)
console.log(`Lignes lues : ${parsed.data.length}`)
console.log(`Prêtes à importer : ${out.length}  -> ${outputPath}`)
console.log(`Rejetées : ${rejects.length}${rejects.length ? '  -> ' + reportPath : ''}`)
console.log(`Avertissements : pays non reconnu ${warnings.paysInconnu}, numéros invalides ignorés ${warnings.numeroInvalide}, emails invalides ignorés ${warnings.emailInvalide}`)
