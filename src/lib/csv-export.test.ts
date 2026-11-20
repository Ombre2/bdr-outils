import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import { Timestamp } from 'firebase/firestore'
import { accountsCsv, contactsCsv, groupCallsByContact, notesCell, toCsv, utf16le } from '@/lib/csv-export'
import type { Account, Call, Contact, Phone } from '@/types/models'

const ts = Timestamp.fromDate(new Date(2026, 0, 15, 9, 30))

const account: Account = {
  id: 'a1',
  ownerId: 'u1',
  name: 'Acme Exemple',
  website: 'acme-exemple.com',
  industry: 'Logiciel',
  headcount: '11-50',
  source: 'Salon',
  description: null,
  country: 'MG',
  city: 'Antananarivo',
  timezone: 'Indian/Antananarivo',
  searchName: 'acme exemple',
  createdAt: ts,
  updatedAt: ts,
}

const contact: Contact = {
  id: 'c1',
  ownerId: 'u1',
  accountId: 'a1',
  accountName: 'Acme Exemple',
  firstName: 'Awa',
  lastName: 'Koné',
  title: '=DRH',
  email: null,
  linkedinUrl: null,
  description: null,
  source: 'Liste',
  status: 'Cold',
  country: 'MG',
  city: null,
  timezone: null,
  nextReminderAt: null,
  lastCallAt: null,
  statusChangedAt: ts,
  createdAt: ts,
  updatedAt: ts,
}

const phones: Phone[] = [
  { id: 'p1', contactId: 'c1', ownerId: 'u1', number: '+261340000001', label: 'Mobile', isPrimary: true, createdAt: ts, updatedAt: ts },
  { id: 'p2', contactId: 'c1', ownerId: 'u1', number: '+261340000002', label: 'Bureau', isPrimary: false, createdAt: ts, updatedAt: ts },
] as Phone[]

function parse(csv: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, delimiter: '\t', skipEmptyLines: true }).data
}

const baseLookups = {
  phonesOf: () => phones,
  emailsOf: () => [{ address: 'awa@exemple.com', isPrimary: true }],
  accountById: (id: string | null) => (id === 'a1' ? account : undefined),
}

describe('toCsv', () => {
  it('ajoute le BOM, utilise « ; » et neutralise les formules', () => {
    const csv = toCsv(['A', 'B'], [['=1+1', 'x']])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('";"')
    expect(csv).not.toContain('"=1+1"')
  })
})

describe('utf16le', () => {
  it('encode le BOM en FF FE et les accents sur deux octets', () => {
    expect([...utf16le('\uFEFFé')]).toEqual([0xff, 0xfe, 0xe9, 0x00])
  })
})

describe('exports Excel', () => {
  it('utilisent la tabulation comme séparateur (indépendant de la langue de Windows)', () => {
    const csv = accountsCsv([account], { contactCount: () => 0 })
    expect(csv.split('\r\n')[0]).toContain('"Entreprise"\t"Site web"')
  })
})

describe('contactsCsv', () => {
  it('joint les colonnes du compte et les téléphones avec libellé', () => {
    const [row] = parse(contactsCsv([contact], baseLookups))
    expect(row['Entreprise']).toBe('Acme Exemple')
    expect(Object.keys(row).slice(0, 7)).toEqual([
      'Entreprise', 'Site web entreprise', 'Industrie', 'Headcount', 'Pays entreprise', 'Ville entreprise', 'Prénom',
    ])
    expect(row['Industrie']).toBe('Logiciel')
    expect(row['Headcount']).toBe('11-50')
    // Format espacé : Excel le garde en texte (sinon 2.61E+11)
    expect(row['Téléphone principal']).toBe('+261 34 00 000 01')
    expect(row['Autres téléphones']).toBe('Bureau : +261 34 00 000 02')
    expect(row['Email principal']).toBe('awa@exemple.com')
    expect(row['Poste']).not.toMatch(/^=/)
    expect(row).not.toHaveProperty('Propriétaire')
  })

  it('laisse les colonnes du compte vides si le compte est introuvable', () => {
    const [row] = parse(contactsCsv([{ ...contact, accountId: null, accountName: 'Ancien nom' }], baseLookups))
    expect(row['Entreprise']).toBe('Ancien nom')
    expect(row['Industrie']).toBe('')
  })

  it('ajoute le propriétaire, le nombre d’appels et tout l’historique', () => {
    const older = { contactId: 'c1', calledAt: ts, outcome: 'Messagerie', notes: null } as Call
    const latest = {
      contactId: 'c1',
      calledAt: Timestamp.fromDate(new Date(2026, 0, 20, 14, 0)),
      outcome: 'NPR',
      notes: 'Rappeler lundi',
    } as Call
    const byContact = groupCallsByContact([older, latest])
    const [row] = parse(
      contactsCsv([contact], {
        ...baseLookups,
        ownerEmail: () => 'bdr@exemple.com',
        callsOf: (id) => byContact.get(id) ?? [],
        lastRdv: () => new Date(2026, 1, 1, 10, 0),
      }),
    )
    expect(row['Propriétaire']).toBe('bdr@exemple.com')
    expect(row["Nombre d'appels"]).toBe('2')
    expect(row['Résultat dernier appel']).toBe('Pas de réponse')
    expect(row['Notes dernier appel']).toBe('Rappeler lundi')
    expect(row['Appels'].split('\n')).toEqual([
      '20/01/2026 14:00 · Pas de réponse · Rappeler lundi',
      '15/01/2026 09:30 · Messagerie',
    ])
    expect(row['Dernier RDV']).not.toBe('')
  })

  it('met 0 appel quand le contact n’a jamais été appelé', () => {
    const [row] = parse(contactsCsv([contact], { ...baseLookups, callsOf: () => [] }))
    expect(row["Nombre d'appels"]).toBe('0')
    expect(row['Appels']).toBe('')
  })
})

describe('accountsCsv', () => {
  it('exporte les comptes avec nombre de contacts et RDV', () => {
    const [row] = parse(
      accountsCsv([account], {
        contactCount: () => 3,
        rdvOf: () => ({ at: new Date(2026, 1, 1, 10, 0), contactName: 'Awa Koné' }),
      }),
    )
    expect(row['Nombre de contacts']).toBe('3')
    expect(row['Source']).toBe('Salon')
    expect(row['Contact du RDV']).toBe('Awa Koné')
    expect(row).not.toHaveProperty('Propriétaire')
  })
})

describe('notesCell', () => {
  it('passe à la ligne à chaque puce « - »', () => {
    expect(notesCell('Intéressé - budget 2027 - rappeler en janvier')).toBe('Intéressé\n- budget 2027\n- rappeler en janvier')
    expect(notesCell('- point 1 - point 2')).toBe('- point 1\n- point 2')
    expect(notesCell('- point 1\r\n- point 2')).toBe('- point 1\n- point 2')
  })

  it('ne coupe pas les mots composés', () => {
    expect(notesCell('Jean-Pierre, e-mail envoyé')).toBe('Jean-Pierre, e-mail envoyé')
    expect(notesCell(null)).toBe('')
  })
})
