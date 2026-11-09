import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MultiSelectFilter } from '@/components/MultiSelectFilter'
import { Pagination, paginate } from '@/components/Pagination'
import { useAuth } from '@/features/auth/AuthProvider'
import { ContactDialog } from '@/features/contacts/ContactDialog'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { callHref, formatPhone, phoneDigits } from '@/lib/phone'
import { localTimeLabel } from '@/lib/time'
import { normalizeText } from '@/lib/text'
import { countryLabel } from '@/lib/geo'
import { CONTACT_STATUSES } from '@/types/models'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ContactsPage() {
  const { contacts, accountById, phones, phonesOf, loading, teamView, ownerEmail, owners: teamOwners } = useDirectory()
  const { user } = useAuth()
  const navigate = useNavigate()
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

  // Numéros : à partir de 3 chiffres saisis, on retient les contacts dont un numéro correspond
  const phoneMatchIds = useMemo(() => {
    const digits = phoneDigits(filter)
    if (digits.length < 3) return null
    return new Set(phones.filter((p) => phoneDigits(p.number).includes(digits)).map((p) => p.contactId))
  }, [phones, filter])

  const rows = useMemo(() => {
    const q = normalizeText(filter)
    return contacts.filter((c) => {
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
  }, [contacts, filter, statuses, countries, sources, industries, owners, phoneMatchIds, accountById])

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
  const filtersActive = Boolean(filter || statuses.length || countries.length || sources.length || industries.length || owners.length)

  function resetFilters() {
    setFilter('')
    setStatuses([])
    setCountries([])
    setSources([])
    setIndustries([])
    setOwners([])
    setPage(1)
  }

  const pg = paginate(rows, page, pageSize)

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
              <TableHead>Nom</TableHead>
              <TableHead>Compte</TableHead>
              <TableHead>Poste</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Heure locale</TableHead>
              {teamView && <TableHead>Propriétaire</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.items.map((c) => {
              const primary = phonesOf(c.id).find((p) => p.isPrimary) ?? phonesOf(c.id)[0]
              const tel = primary ? callHref(primary.number) : null
              const accountName = accountById(c.accountId)?.name ?? c.accountName
              return (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/contacts/${c.id}`)}>
                  <TableCell className="font-medium">
                    {c.firstName} {c.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{accountName ?? '—'}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-muted-foreground">{c.title ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {tel && primary ? (
                      <a href={tel} onClick={stop} className="tabular-nums underline-offset-2 hover:underline">
                        {formatPhone(primary.number)}
                      </a>
                    ) : (
                      '—'
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

      <ContactDialog
        open={creating}
        onOpenChange={setCreating}
        ownerId={user?.uid ?? ''}
        onSaved={(id) => navigate(`/contacts/${id}`)}
      />
    </section>
  )
}
