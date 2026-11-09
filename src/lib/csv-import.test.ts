import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_MAPPING,
  detectMapping,
  isMappingValid,
  mappingWarnings,
  mergeAccounts,
  planImport,
  splitFullName,
  type Mapping,
} from '@/lib/csv-import'
import { neutralizeFormula } from '@/lib/text'
import { importTemplateCsv, toCsv } from '@/lib/csv-export'

// Mapping saisi à la main (comme dans l'écran de l'application)
const mapping: Mapping = {
  fields: {
    firstName: 'Prénom',
    lastName: 'Nom',
    status: 'Statut',
    source: 'Source',
    country: 'Pays',
    accountName: 'Entreprise',
    website: 'Site',
    headcount: 'Headcount',
    accountCountry: 'Pays entreprise',
  },
  phones: ['Téléphone', 'Mobile'],
  emails: ['Email'],
}

const opts = {
  mapping,
  defaultCountry: 'MG',
  existingEmails: new Set<string>(),
  existingPhones: new Set<string>(),
  existingAccountKeys: new Set<string>(),
}

const base = { Prénom: 'Awa', Nom: 'Koné', Téléphone: '', Mobile: '', Email: '', Entreprise: 'Entreprise Test' }

describe('correspondance', () => {
  it('exige un nom (complet ou prénom + nom)', () => {
    expect(isMappingValid(EMPTY_MAPPING)).toBe(false)
    expect(isMappingValid({ fields: { firstName: 'A' }, phones: [], emails: [] })).toBe(false)
    expect(isMappingValid({ fields: { firstName: 'A', lastName: 'B' }, phones: [], emails: [] })).toBe(true)
    expect(isMappingValid({ fields: { fullName: 'Nom' }, phones: [], emails: [] })).toBe(true)
  })

  it('détecte automatiquement le format de votre fichier', () => {
    const headers = [
      'name', 'phone', 'email', 'email2', 'title', 'company', 'address', 'city',
      'state', 'zip', 'country', 'industry', 'website', 'favorite_agent',
    ]
    const m = detectMapping(headers)
    expect(m.fields.fullName).toBe('name')
    expect(m.fields.firstName).toBeUndefined()
    expect(m.fields.title).toBe('title')
    expect(m.fields.accountName).toBe('company')
    expect(m.fields.city).toBe('city')
    expect(m.fields.country).toBe('country')
    expect(m.fields.industry).toBe('industry')
    expect(m.fields.website).toBe('website')
    expect(m.fields.source).toBe('favorite_agent')
    expect(m.phones).toEqual(['phone'])
    expect(m.emails).toEqual(['email', 'email2'])
    expect(isMappingValid(m)).toBe(true)
  })

  it('détecte le modèle d\'import', () => {
    const m = detectMapping([
      'Prénom', 'Nom', 'Poste', 'Email', 'Téléphone', 'Mobile', 'Entreprise', 'Site web', 'Industrie',
      'Headcount', 'Pays entreprise', 'Ville entreprise', 'Source', 'Statut',
    ])
    expect(m.fields.firstName).toBe('Prénom')
    expect(m.fields.lastName).toBe('Nom')
    expect(m.fields.accountCountry).toBe('Pays entreprise')
    expect(m.phones).toEqual(['Téléphone', 'Mobile'])
    expect(m.emails).toEqual(['Email'])
  })

  it('signale un contact sans colonne entreprise', () => {
    const warnings = mappingWarnings(detectMapping(['name', 'phone']))
    expect(warnings.join(' ')).toContain('sans compte')
  })

  it('découpe un nom complet : premier mot = prénom', () => {
    expect(splitFullName('Manitra Andriamitondra')).toEqual({ firstName: 'Manitra', lastName: 'Andriamitondra' })
    expect(splitFullName('Jean Paul Durand')).toEqual({ firstName: 'Jean', lastName: 'Paul Durand' })
  })

  it('rejette un nom complet d\'un seul mot', () => {
    const m: Mapping = { fields: { fullName: 'name' }, phones: ['phone'], emails: [] }
    const [row] = planImport([{ name: 'Awa', phone: '+2250700000040' }], { ...opts, mapping: m })
    expect(row.status).toBe('error')
  })

  it('utilise un nom complet à la place des colonnes prénom et nom', () => {
    const m: Mapping = { fields: { fullName: 'name', accountName: 'company' }, phones: ['phone'], emails: ['email'] }
    const [row] = planImport([{ name: 'Manitra Andriamitondra', phone: '+2250700000041', email: 'm@exemple.com', company: 'Acme' }], { ...opts, mapping: m })
    expect(row.status).toBe('ready')
    expect(row.contact?.firstName).toBe('Manitra')
    expect(row.contact?.lastName).toBe('Andriamitondra')
    expect(row.contact?.account?.name).toBe('Acme')
  })
})

describe('planImport : fuseau horaire selon le pays de la personne', () => {
  const tzMapping: Mapping = { fields: { firstName: 'Prénom', lastName: 'Nom', country: 'Pays' }, phones: ['Téléphone'], emails: [] }

  it('Madagascar donne le fuseau de Madagascar, même avec un numéro français', () => {
    const [row] = planImport([{ Prénom: 'Awa', Nom: 'K', Pays: 'Madagascar', Téléphone: '+33 6 12 34 56 78' }], { ...opts, mapping: tzMapping })
    expect(row.contact?.country).toBe('MG')
    expect(row.contact?.timezone).toBe('Indian/Antananarivo')
  })

  it('sans pays d\'entreprise, le pays de la personne sert au compte', () => {
    const m: Mapping = { fields: { firstName: 'Prénom', lastName: 'Nom', country: 'Pays', accountName: 'Entreprise' }, phones: ['Téléphone'], emails: ['Email'] }
    const [row] = planImport([{ Prénom: 'Awa', Nom: 'K', Pays: 'Madagascar', Entreprise: 'Acme', Téléphone: '+2250700000060', Email: 'a@exemple.com' }], { ...opts, mapping: m })
    expect(row.contact?.account?.country).toBe('MG')
  })

  it('Côte d\'Ivoire donne le fuseau d\'Abidjan', () => {
    const [row] = planImport([{ Prénom: 'Awa', Nom: 'K', Pays: "Côte d'Ivoire", Téléphone: '+33 6 12 34 56 78' }], { ...opts, mapping: tzMapping })
    expect(row.contact?.timezone).toBe('Africa/Abidjan')
  })
})

describe('profil LinkedIn', () => {
  it('la colonne « LinkedIn Profile » est détectée automatiquement', () => {
    const m = detectMapping(['First Name', 'Last Name', 'LinkedIn Profile', 'Most Probable Phone Number'])
    expect(m.fields.linkedinUrl).toBe('LinkedIn Profile')
  })

  it('garde une URL LinkedIn valide et ignore une URL d\'un autre site', () => {
    const m: Mapping = { fields: { firstName: 'Prénom', lastName: 'Nom', linkedinUrl: 'LI' }, phones: ['Téléphone'], emails: [] }
    const [ok] = planImport([{ Prénom: 'A', Nom: 'B', LI: 'linkedin.com/in/a-b', Téléphone: '+2250700000070' }], { ...opts, mapping: m })
    expect(ok.contact?.linkedinUrl).toBe('https://linkedin.com/in/a-b')
    const [bad] = planImport([{ Prénom: 'A', Nom: 'B', LI: 'https://exemple.com/x', Téléphone: '+2250700000071' }], { ...opts, mapping: m })
    expect(bad.contact?.linkedinUrl).toBeNull()
    expect(bad.status).toBe('warning')
  })
})

describe('planImport : contact', () => {
  it('normalise un numéro local avec le pays par défaut', () => {
    const [row] = planImport([{ ...base, Téléphone: '34 12 345 67' }], opts)
    expect(row.status).toBe('ready')
    expect(row.contact?.phones[0].number).toBe('+261341234567')
    expect(row.contact?.phones[0].isPrimary).toBe(true)
  })

  it('rejette une ligne sans nom', () => {
    const [row] = planImport([{ ...base, Prénom: '', Téléphone: '+2250700000000' }], opts)
    expect(row.status).toBe('error')
  })

  it('rejette une ligne qui n\'a qu\'un email, sans numéro', () => {
    const [row] = planImport([{ ...base, Email: 'seul@exemple.com' }], opts)
    expect(row.status).toBe('error')
    expect(row.messages.join(' ')).toContain('numéro de téléphone')
  })

  it('rejette une ligne sans téléphone ni email valide', () => {
    const [row] = planImport([{ ...base, Téléphone: 'pas un numéro', Email: 'oups' }], opts)
    expect(row.status).toBe('error')
  })

  it('retire un numéro invalide sans rejeter le contact', () => {
    const [row] = planImport([{ ...base, Téléphone: '+2250700000000', Mobile: '12' }], opts)
    expect(row.status).toBe('warning')
    expect(row.contact?.phones).toHaveLength(1)
    expect(row.messages.join(' ')).toContain('Numéro invalide')
  })

  it('détecte les doublons dans le fichier et contre la base', () => {
    const plan = planImport(
      [
        { ...base, Téléphone: '+2250700000001' },
        { ...base, Prénom: 'C', Téléphone: '+2250700000001' },
        { ...base, Prénom: 'E', Téléphone: '+2250700000002' },
      ],
      { ...opts, existingPhones: new Set(['+2250700000002']) },
    )
    expect(plan.map((r) => r.status)).toEqual(['ready', 'duplicate', 'duplicate'])
  })

  it('normalise statut, pays de la personne et email', () => {
    const [row] = planImport(
      [{ ...base, Email: '  A.B@Exemple.COM ', Statut: 'qualifie', Pays: "côte d'ivoire", Téléphone: '+2250700000003' }],
      opts,
    )
    expect(row.contact?.emails).toEqual(['a.b@exemple.com'])
    expect(row.contact?.status).toBe('Qualifié')
    expect(row.contact?.country).toBe('CI')
    expect(row.contact?.timezone).toBe('Africa/Abidjan')
    expect(row.status).toBe('ready')
  })

  it('garde la source telle quelle', () => {
    const [row] = planImport([{ ...base, Source: 'Salon 2026', Téléphone: '+2250700000005' }], opts)
    expect(row.contact?.source).toBe('Salon 2026')
  })
})

describe('planImport : plusieurs numéros et emails dans une cellule', () => {
  it('sépare deux numéros écrits avec « : » dans une même cellule', () => {
    const [row] = planImport([{ ...base, Téléphone: '+261 34 12 345 67 : +261 32 528 20 13' }], opts)
    expect(row.contact?.phones.map((p) => p.number)).toEqual(['+261341234567', '+261325282013'])
    expect(row.contact?.phones[0].isPrimary).toBe(true)
    expect(row.contact?.phones[1].isPrimary).toBe(false)
  })

  it('sépare les numéros avec « ; », « , » et retour à la ligne', () => {
    const [row] = planImport([{ ...base, Téléphone: '+2250700000021;+2250700000022,\n+2250700000023' }], opts)
    expect(row.contact?.phones).toHaveLength(3)
  })

  it('garde un numéro à espaces interne au lieu de le couper', () => {
    const [row] = planImport([{ ...base, Téléphone: '034 12 345 67' }], opts)
    expect(row.contact?.phones).toHaveLength(1)
  })

  it('sépare plusieurs emails et garde le premier comme principal', () => {
    const [row] = planImport([{ ...base, Téléphone: '+2250700000050', Email: 'Awa@Exemple.com ; awa.perso@gmail.com' }], opts)
    expect(row.contact?.emails).toEqual(['awa@exemple.com', 'awa.perso@gmail.com'])
    expect(row.status).toBe('ready')
  })

  it('signale un email invalide dans une cellule et garde les autres', () => {
    const [row] = planImport([{ ...base, Téléphone: '+2250700000051', Email: 'ok@exemple.com ; pas-un-email' }], opts)
    expect(row.contact?.emails).toEqual(['ok@exemple.com'])
    expect(row.status).toBe('warning')
  })

  it('un email déjà en base rend la ligne doublon', () => {
    const [row] = planImport(
      [{ ...base, Email: 'connu@exemple.com', Téléphone: '+2250700000030' }],
      { ...opts, existingEmails: new Set(['connu@exemple.com']) },
    )
    expect(row.status).toBe('duplicate')
  })
})

describe('planImport : compte (entreprise)', () => {
  it('garde la plage de headcount en texte', () => {
    const [row] = planImport([{ ...base, Entreprise: 'Acme', Headcount: '11-50', Téléphone: '+2250700000006' }], opts)
    expect(row.contact?.account?.headcount).toBe('11-50')
  })

  it('normalise le site en https et signale un site invalide', () => {
    const [ok] = planImport([{ ...base, Entreprise: 'Acme', Site: 'acme.example', Téléphone: '+2250700000007' }], opts)
    expect(ok.contact?.account?.website).toBe('https://acme.example/')

    const [bad] = planImport([{ ...base, Entreprise: 'Acme', Site: 'http://acme.example', Téléphone: '+2250700000008' }], opts)
    expect(bad.contact?.account?.website).toBeNull()
    expect(bad.status).toBe('warning')
  })

  it('compte déjà en base : rattaché sans alerte bloquante', () => {
    const [row] = planImport(
      [{ ...base, Entreprise: 'Acme Exemple', Téléphone: '+2250700000009' }],
      { ...opts, existingAccountKeys: new Set(['acme exemple']) },
    )
    expect(row.status).toBe('ready')
    expect(row.messages.join(' ')).toContain('ne sont pas modifiées')
  })

  it('une entreprise vide signale un contact sans compte', () => {
    const [row] = planImport([{ ...base, Entreprise: '', Téléphone: '+2250700000012' }], opts)
    expect(row.status).toBe('warning')
    expect(row.messages.join(' ')).toContain('sans compte')
  })

  it('regroupe les lignes d\'une même entreprise en prenant la première valeur non vide', () => {
    const plan = planImport(
      [
        { ...base, Entreprise: 'Acme', Headcount: '', Téléphone: '+2250700000010' },
        { ...base, Prénom: 'Paul', Entreprise: 'ACME', Headcount: '51-200', Téléphone: '+2250700000011' },
      ],
      opts,
    )
    const merged = mergeAccounts(plan.map((r) => r.contact!))
    expect(merged.size).toBe(1)
    expect(merged.get('acme')?.headcount).toBe('51-200')
  })
})

describe('modèle d\'import', () => {
  it('le fichier modèle s\'importe sans aucune ligne rejetée, avec détection automatique', () => {
    const text = importTemplateCsv().replace(/^﻿/, '')
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, delimiter: ';', skipEmptyLines: 'greedy' })
    const templateMapping = detectMapping(parsed.meta.fields ?? [])
    const plan = planImport(parsed.data, { ...opts, mapping: templateMapping })
    expect(plan).toHaveLength(3)
    expect(plan.every((r) => r.status !== 'error')).toBe(true)
    expect(plan[0].contact?.emails).toEqual(['awa.kone@exemple.com', 'awa.perso@exemple.com'])
    expect(plan[0].contact?.phones).toHaveLength(2)
  })
})

describe('injection de formules', () => {
  it('neutralise les cellules qui commencent par = + - @', () => {
    expect(neutralizeFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`)
    expect(neutralizeFormula('+33 6')).toBe('+33 6') // numéro de téléphone : pas une formule
    expect(neutralizeFormula('+SUM(1)')).toBe(`'+SUM(1)`)
    expect(neutralizeFormula('Awa')).toBe('Awa')
  })

  it('CSV : BOM UTF-8, séparateur point-virgule et cellules neutralisées', () => {
    const csv = toCsv(['Nom'], [['@evil'], ['Awa']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain(`"'@evil"`)
    expect(csv).toContain('"Awa"')
  })
})
