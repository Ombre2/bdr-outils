import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { PhoneCall, Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MultiSelectFilter } from '@/components/MultiSelectFilter'
import { Pagination, paginate } from '@/components/Pagination'
import { useAuth } from '@/features/auth/AuthProvider'
import { ContactDialog } from '@/features/contacts/ContactDialog'
import { LogCallDialog } from '@/features/calls/LogCallDialog'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { callHref, formatPhone, phoneDigits } from '@/lib/phone'
import { formatDateTime, localTimeLabel } from '@/lib/time'
import { listRdvCallsForOwner } from '@/services/calls.repo'
import { normalizeText } from '@/lib/text'
import { countryLabel } from '@/lib/geo'
import { CONTACT_STATUSES, type Contact } from '@/types/models'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ContactsPage() {
  const { contacts, accountById, phones, phonesOf, loading, refresh, teamView, ownerEmail, owners: teamOwners } = useDirectory()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [logFor, setLogFor] = useState<Contact | null>(null) // appel rapide, sans ouvrir la fiche
  const [rdvByContact, setRdvByContact] = useState<Map<string, Date>>(new Map()) // dernier RDV pris par contact
  const [rdvReloadKey, setRdvReloadKey] = useState(0)
  const [accountSort, setAccountSort] = useState<'asc' | 'desc'>('asc')
  const [hideUpcoming, setHideUpcoming] = useState(false) // masque les contacts avec un RDV encore à venir
  const [filter, setFilter] = useState('')
  // Filtres à choix multiples : liste vide = pas de filtre
  const [statuses, setStatuses] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  // Vue admin uniquement : filtre par BDR propriétaire
  const [owners, setOwners] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)

  // Une seule horloge pour toute la liste (au lieu d'un timer par ligne)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Dernier RDV pris par contact (vue personnelle seulement : la vue admin ne charge pas les appels de l'équipe)
  useEffect(() => {
    if (!user || teamView) return
    let cancelled = false
    listRdvCallsForOwner(user.uid)
      .then((calls) => {
        if (cancelled) return
        const latest = new Map<string, Date>()
        for (const call of calls) {
          const when = (call.meetingAt ?? call.calledAt).toDate()
          const previous = latest.get(call.contactId)
          if (!previous || when > previous) latest.set(call.contactId, when)
        }
        setRdvByContact(latest)
      })
      .catch(() => !cancelled && setRdvByContact(new Map()))
    return () => {
      cancelled = true
    }
  }, [user, teamView, rdvReloadKey])

  // Numéros : à partir de 3 chiffres saisis, on retient les contacts dont un numéro correspond
  const phoneMatchIds = useMemo(() => {
    const digits = phoneDigits(filter)
    if (digits.length < 3) return null
    return new Set(phones.filter((p) => phoneDigits(p.number).includes(digits)).map((p) => p.contactId))
  }, [phones, filter])

  // Compte d'un contact, identifié par son nom (les doublons de compte issus d'imports ont des identifiants différents)
  const accountKeyOf = useCallback(
    (c: Contact) => normalizeText(accountById(c.accountId)?.name ?? c.accountName ?? ''),
    [accountById],
  )

  // Comptes ayant au moins un RDV encore à venir (tous leurs contacts sont alors masqués si le filtre est actif)
  const accountsWithUpcomingRdv = useMemo(() => {
    const keys = new Set<string>()
    for (const c of contacts) {
      const rdv = rdvByContact.get(c.id)
      const key = normalizeText(accountById(c.accountId)?.name ?? c.accountName ?? '')
      if (key && rdv && rdv.getTime() >= now.getTime()) keys.add(key)
    }
    return keys
  }, [contacts, rdvByContact, now, accountById])

  const rows = useMemo(() => {
    const q = normalizeText(filter)
    return contacts.filter((c) => {
      if (hideUpcoming) {
        const rdv = rdvByContact.get(c.id)
        if (rdv && rdv.getTime() >= now.getTime()) return false // le contact a un RDV à venir
        const key = accountKeyOf(c)
        if (key && accountsWithUpcomingRdv.has(key)) return false // un collègue du même compte a un RDV à venir
      }
      if (statuses.length > 0 && !statuses.includes(c.status)) return false
      if (countries.length > 0 && !(c.country && countries.includes(c.country))) return false
      if (sources.length > 0 && !(c.source && sources.includes(c.source))) return false
      if (owners.length > 0 && !owners.includes(c.ownerId)) return false
      // L'industrie vient du compte rattaché au contact
      if (industries.length > 0) {
        const industry = accountById(c.accountId)?.industry
        if (!(industry && industries.includes(industry))) return false
      }
      if (!q && !phoneMatchIds) return true
      const haystack = normalizeText(
        [c.firstName, c.lastName, c.title ?? '', c.email ?? '', c.accountName ?? ''].join(' '),
      )
      return (q !== '' && haystack.includes(q)) || (phoneMatchIds?.has(c.id) ?? false)
    })
  }, [contacts, filter, statuses, countries, sources, industries, owners, phoneMatchIds, accountById, hideUpcoming, rdvByContact, now, accountsWithUpcomingRdv, accountKeyOf])

  // Tri par compte : les contacts d'un même compte se suivent. Sans compte : en bas de liste.
  const sortedRows = useMemo(() => {
    const dir = accountSort === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const accountA = accountById(a.accountId)?.name ?? a.accountName ?? ''
      const accountB = accountById(b.accountId)?.name ?? b.accountName ?? ''
      if (!accountA !== !accountB) return accountA ? -1 : 1
      return (
        accountA.localeCompare(accountB, 'fr') * dir ||
        a.lastName.localeCompare(b.lastName, 'fr') ||
        a.firstName.localeCompare(b.firstName, 'fr')
      )
    })
  }, [rows, accountById, accountSort])

  const ownerOptions = useMemo(() => teamOwners.map((o) => ({ value: o.id, label: o.label })), [teamOwners])

  // Options proposées : uniquement les valeurs présentes dans les contacts
  const countryOptions = useMemo(
    () =>
      [...new Set(contacts.map((c) => c.country).filter((v): v is string => !!v))].sort((a, b) =>
        countryLabel(a).localeCompare(countryLabel(b), 'fr'),
      ),
    [contacts],
  )
  const sourceOptions = useMemo(
    () => [...new Set(contacts.map((c) => c.source).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'fr')),
    [contacts],
  )
  const industryOptions = useMemo(
    () =>
      [...new Set(contacts.map((c) => accountById(c.accountId)?.industry).filter((v): v is string => !!v))].sort(
        (a, b) => a.localeCompare(b, 'fr'),
      ),
    [contacts, accountById],
  )
  const filtersActive = Boolean(filter || statuses.length || countries.length || sources.length || industries.length || owners.length || hideUpcoming)

  function resetFilters() {
    setFilter('')
    setStatuses([])
    setCountries([])
    setSources([])
    setIndustries([])
    setOwners([])
    setHideUpcoming(false)
    setPage(1)
  }

  const pg = paginate(sortedRows, page, pageSize)

  function stop(e: MouseEvent) {
    // Les liens d'appel/mailto: ne doivent pas ouvrir la fiche
    e.stopPropagation()
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} sur {contacts.length} contact(s)
          </p>
        </div>
        {!teamView && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Nouveau contact
          </Button>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Filtrer par nom, poste, email, numéro, compte…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(1)
          }}
          className="max-w-sm"
          aria-label="Filtrer les contacts"
        />
        <MultiSelectFilter
          label="Statut"
          className="w-44"
          options={CONTACT_STATUSES.map((s) => ({ value: s, label: s }))}
          selected={statuses}
          onChange={(v) => {
            setStatuses(v)
            setPage(1)
          }}
        />
        <MultiSelectFilter
          label="Pays"
          className="w-44"
          options={countryOptions.map((c) => ({ value: c, label: countryLabel(c) }))}
          selected={countries}
          onChange={(v) => {
            setCountries(v)
            setPage(1)
          }}
        />
        <MultiSelectFilter
          label="Source"
          className="w-56"
          options={sourceOptions.map((s) => ({ value: s, label: s.length > 40 ? `${s.slice(0, 40)}…` : s }))}
          selected={sources}
          onChange={(v) => {
            setSources(v)
            setPage(1)
          }}
        />
        {teamView && (
          <MultiSelectFilter
            label="Propriétaire"
            className="w-56"
            options={ownerOptions}
            selected={owners}
            onChange={(v) => {
              setOwners(v)
              setPage(1)
            }}
          />
        )}
        <MultiSelectFilter
          label="Industrie"
          className="w-56"
          options={industryOptions.map((i) => ({ value: i, label: i }))}
          selected={industries}
          onChange={(v) => {
            setIndustries(v)
            setPage(1)
          }}
        />
        {!teamView && (
          <Button
            variant={hideUpcoming ? 'default' : 'outline'}
            size="sm"
            aria-pressed={hideUpcoming}
            onClick={() => {
              setHideUpcoming((v) => !v)
              setPage(1)
            }}
          >
            {hideUpcoming ? 'Comptes avec RDV masqués' : 'Masquer les comptes avec RDV à venir'}
          </Button>
        )}
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Réinitialiser
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Contact</TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => setAccountSort((s) => (s === 'asc' ? 'desc' : 'asc'))}
                  className="inline-flex cursor-pointer items-center gap-1 font-medium hover:text-foreground"
                  aria-label="Trier par compte"
                >
                  Compte {accountSort === 'asc' ? '↑' : '↓'}
                </button>
              </TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Téléphones</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Heure locale</TableHead>
              {!teamView && <TableHead className="w-24 text-right">Appel</TableHead>}
              {teamView && <TableHead>Propriétaire</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.items.map((c) => {
              const contactPhones = [...phonesOf(c.id)].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
              const accountName = accountById(c.accountId)?.name ?? c.accountName
              return (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                  <TableCell className="max-w-[260px]">
                    <p className="font-medium">
                      {c.firstName} {c.lastName}
                    </p>
                    {c.title && <p className="truncate text-xs text-muted-foreground">{c.title}</p>}
                    {rdvByContact.has(c.id) && (
                      <Badge className="mt-1 font-normal" title="Un RDV a déjà été pris avec ce contact">
                        RDV déjà pris · {formatDateTime(rdvByContact.get(c.id)!)}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{accountName ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {contactPhones.length === 0 ? (
                      '—'
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {contactPhones.map((p) => {
                          const href = callHref(p.number)
                          return href ? (
                            <a
                              key={p.id}
                              href={href}
                              onClick={stop}
                              title={`Appeler ${p.label.toLowerCase()}`}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs tabular-nums hover:bg-accent"
                            >
                              <PhoneCall className="size-3" aria-hidden />
                              {formatPhone(p.number)}
                              {p.isPrimary && <span className="text-muted-foreground">· principal</span>}
                            </a>
                          ) : (
                            <span key={p.id} className="text-xs tabular-nums">
                              {formatPhone(p.number)}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.email && EMAIL_RE.test(c.email) ? (
                      <a href={`mailto:${c.email}`} onClick={stop} className="underline-offset-2 hover:underline">
                        {c.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {localTimeLabel(c.timezone, now) ?? '—'}
                  </TableCell>
                  {!teamView && (
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          stop(e)
                          setLogFor(c)
                        }}
                      >
                        Logger
                      </Button>
                    </TableCell>
                  )}
                  {teamView && <TableCell className="text-muted-foreground">{ownerEmail(c.ownerId) ?? '—'}</TableCell>}
                </TableRow>
              )
            })}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={teamView ? 8 : 7} className="py-8 text-center text-muted-foreground">
                  Aucun contact. Créez-en un ou importez vos fichiers (étape F).
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination
        page={pg.page}
        pageCount={pg.pageCount}
        from={pg.from}
        to={pg.to}
        total={pg.total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setPage(1)
        }}
      />

      {logFor && (
        <LogCallDialog
          open={!!logFor}
          onOpenChange={(open) => !open && setLogFor(null)}
          contact={logFor}
          phones={phonesOf(logFor.id)}
          onLogged={() => {
            setRdvReloadKey((k) => k + 1)
            void refresh()
          }}
        />
      )}

      <ContactDialog
        open={creating}
        onOpenChange={setCreating}
        ownerId={user?.uid ?? ''}
        onSaved={(id) => navigate(`/contacts/${id}`)}
      />
    </section>
  )
}
