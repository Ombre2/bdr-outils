import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { db } from '@/services/firebase'
import type { Account, Cadence, Contact, ContactEmail, Phone } from '@/types/models'

interface DirectoryValue {
  accounts: Account[]
  contacts: Contact[]
  phones: Phone[]
  emails: ContactEmail[]
  cadences: Cadence[]
  loading: boolean
  refresh: () => Promise<void>
  phonesOf: (contactId: string) => Phone[]
  emailsOf: (contactId: string) => ContactEmail[]
  accountById: (id: string | null) => Account | undefined
  cadenceById: (id: string | null | undefined) => Cadence | undefined
}

const DirectoryContext = createContext<DirectoryValue | null>(null)

/**
 * Charge une fois les données du BDR connecté (comptes, contacts, numéros).
 * Tri et filtrage côté client : pas d'index composite supplémentaire, recherche instantanée.
 */
export function DirectoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const uid = user?.uid
  const [accounts, setAccounts] = useState<Account[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [phones, setPhones] = useState<Phone[]>([])
  const [emails, setEmails] = useState<ContactEmail[]>([])
  const [cadences, setCadences] = useState<Cadence[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!uid) return
    setLoading(true)
    // Chaque lecture est indépendante : une seule en échec n'empêche pas les autres de s'afficher
    const reads = {
      accounts: getDocs(query(collection(db, 'accounts'), where('ownerId', '==', uid))),
      contacts: getDocs(query(collection(db, 'contacts'), where('ownerId', '==', uid))),
      phones: getDocs(query(collectionGroup(db, 'phones'), where('ownerId', '==', uid))),
      emails: getDocs(query(collectionGroup(db, 'emails'), where('ownerId', '==', uid))),
      cadences: getDocs(query(collection(db, 'cadences'), where('ownerId', '==', uid))),
    }
    const entries = Object.entries(reads) as [keyof typeof reads, Promise<unknown>][]
    const results = await Promise.allSettled(entries.map(([, p]) => p))

    const failed: string[] = []
    const data: Record<string, { docs: { id: string; ref: { parent: { parent: { id: string } | null } }; data: () => object }[] }> = {}
    results.forEach((res, i) => {
      const name = entries[i][0]
      if (res.status === 'fulfilled') {
        data[name] = res.value as never
      } else {
        failed.push(name)
        console.error(`Lecture « ${name} » en échec :`, res.reason)
      }
    })

    const docsOf = <T,>(name: string, map: (d: { id: string; ref: { parent: { parent: { id: string } | null } }; data: () => object }) => T): T[] =>
      data[name] ? data[name].docs.map(map) : []

    if (data.accounts) {
      setAccounts(
        docsOf<Account>('accounts', (d) => ({ id: d.id, ...(d.data() as Omit<Account, 'id'>) })).sort((a, b) =>
          a.name.localeCompare(b.name, 'fr'),
        ),
      )
    }
    if (data.contacts) {
      setContacts(
        docsOf<Contact>('contacts', (d) => ({ id: d.id, ...(d.data() as Omit<Contact, 'id'>) })).sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr'),
        ),
      )
    }
    if (data.phones) {
      setPhones(
        docsOf<Phone>('phones', (d) => ({
          id: d.id,
          // Le numéro est dans contacts/{contactId}/phones/{id}
          contactId: d.ref.parent.parent?.id ?? '',
          ...(d.data() as Omit<Phone, 'id' | 'contactId'>),
        })),
      )
    }
    if (data.emails) {
      setEmails(
        docsOf<ContactEmail>('emails', (d) => ({
          id: d.id,
          contactId: d.ref.parent.parent?.id ?? '',
          ...(d.data() as Omit<ContactEmail, 'id' | 'contactId'>),
        })).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
      )
    }

    if (data.cadences) {
      setCadences(
        docsOf<Cadence>('cadences', (d) => ({ id: d.id, ...(d.data() as Omit<Cadence, 'id'>) })).sort((a, b) =>
          a.name.localeCompare(b.name, 'fr'),
        ),
      )
    }

    if (failed.length > 0) {
      toast.error(`Chargement incomplet (${failed.join(', ')}). Ouvrez la console (F12) pour le détail.`)
    }
    setLoading(false)
  }, [uid])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<DirectoryValue>(() => {
    const phonesByContact = new Map<string, Phone[]>()
    for (const p of phones) {
      const list = phonesByContact.get(p.contactId) ?? []
      list.push(p)
      phonesByContact.set(p.contactId, list)
    }
    const emailsByContact = new Map<string, ContactEmail[]>()
    for (const e of emails) {
      const list = emailsByContact.get(e.contactId) ?? []
      list.push(e)
      emailsByContact.set(e.contactId, list)
    }
    const accountIndex = new Map(accounts.map((a) => [a.id, a]))
    const cadenceIndex = new Map(cadences.map((c) => [c.id, c]))
    return {
      accounts,
      contacts,
      phones,
      emails,
      cadences,
      cadenceById: (id) => (id ? cadenceIndex.get(id) : undefined),
      loading,
      refresh,
      phonesOf: (contactId) =>
        (phonesByContact.get(contactId) ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
      emailsOf: (contactId) => emailsByContact.get(contactId) ?? [],
      accountById: (id) => (id ? accountIndex.get(id) : undefined),
    }
  }, [accounts, contacts, phones, emails, cadences, loading, refresh])

  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>
}

export function useDirectory(): DirectoryValue {
  const ctx = useContext(DirectoryContext)
  if (!ctx) throw new Error('useDirectory doit être utilisé dans DirectoryProvider')
  return ctx
}
