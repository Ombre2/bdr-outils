import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination, paginate } from '@/components/Pagination'
import { AccountDialog } from '@/features/accounts/AccountDialog'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { MultiSelectFilter } from '@/components/MultiSelectFilter'
import { countryLabel } from '@/lib/geo'
import { normalizeText } from '@/lib/text'
import { useListFilters } from '@/components/useListFilters'
import { RdvDialog } from '@/features/calls/RdvDialog'
import { rdvDateOf, useRdvCalls } from '@/features/calls/useRdvCalls'
import { formatDateTime } from '@/lib/time'
import type { Call } from '@/types/models'

// RDV affiché pour un compte : le contact, la date et l'appel qui l'a enregistré
interface RdvItem {
  at: Date
  call: Call
  contactName: string
}

// Couleur du RDV affiché : vert pour un RDV à venir, gris atténué pour un RDV terminé
function rdvClass(rdv: { at: Date } | undefined, now: number): string {
  if (!rdv) return 'text-muted-foreground'
  return rdv.at.getTime() >= now ? 'font-medium text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground/70'
}

// Libellé du compteur de contacts, affiché au survol
function contactLabel(count: number): string {
  if (count === 0) return 'Aucun contact ajouté'
  return count === 1 ? '1 contact ajouté' : `${count} contacts ajoutés`
}

export function AccountsPage() {
  const { accounts, contacts, loading, refresh, teamView, ownerEmail } = useDirectory()
  const [rdvReloadKey, setRdvReloadKey] = useState(0)
  const rdvCalls = useRdvCalls(rdvReloadKey)
  const [openRdv, setOpenRdv] = useState<RdvItem | null>(null) // RDV dont le détail est ouvert
  const [now] = useState(() => Date.now()) // heure d'ouverture de la page : sépare RDV à venir et passés
  const { user } = useAuth()
  const navigate = useNavigate()
  // Filtres dans l'URL : ils restent actifs au retour depuis une fiche
  const { text, list, flag, update, href } = useListFilters()
  const filter = text('q')
  const sansRdv = flag('sans_rdv') // n'affiche que les comptes sans RDV à venir
  const setSansRdv = (v: boolean) => update({ sans_rdv: v ? '1' : null })
  // Filtre à choix multiples : liste vide = pas de filtre
  const countries = list('pays')
  const setFilter = (v: string) => update({ q: v })
  const setCountries = (v: string[]) => update({ pays: v })
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const uid = user?.uid ?? ''

  const contactCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of contacts) {
      if (c.accountId) map.set(c.accountId, (map.get(c.accountId) ?? 0) + 1)
    }
    return map
  }, [contacts])

  // RDV affiché par compte : le prochain RDV à venir, sinon le plus récent passé
  const rdvByAccount = useMemo(() => {
    const grouped = new Map<string, RdvItem[]>()
    for (const c of contacts) {
      const call = rdvCalls.get(c.id)
      if (!c.accountId || !call) continue
      grouped.set(c.accountId, [
        ...(grouped.get(c.accountId) ?? []),
        { at: rdvDateOf(call), call, contactName: `${c.firstName} ${c.lastName}` },
      ])
    }
    const picked = new Map<string, RdvItem>()
    for (const [accountId, items] of grouped) {
      const upcoming = items.filter((i) => i.at.getTime() >= now).sort((a, b) => a.at.getTime() - b.at.getTime())
      const past = items.filter((i) => i.at.getTime() < now).sort((a, b) => b.at.getTime() - a.at.getTime())
      const best = upcoming[0] ?? past[0]
      if (best) picked.set(accountId, best)
    }
    return picked
  }, [contacts, rdvCalls, now])

  // Comptes ayant au moins un RDV encore à venir (le RDV affiché est alors le prochain)
  const accountsWithUpcomingRdv = useMemo(
    () => new Set([...rdvByAccount].filter(([, rdv]) => rdv.at.getTime() >= now).map(([id]) => id)),
    [rdvByAccount, now],
  )

  // Pays présents dans les comptes, triés par nom
  const countryOptions = useMemo(
    () =>
      [...new Set(accounts.map((a) => a.country).filter((v): v is string => !!v))].sort((a, b) =>
        countryLabel(a).localeCompare(countryLabel(b), 'fr'),
      ),
    [accounts],
  )

  const rows = useMemo(() => {
    const q = normalizeText(filter)
    return accounts.filter((a) => {
      if (countries.length > 0 && !(a.country && countries.includes(a.country))) return false
      if (sansRdv && accountsWithUpcomingRdv.has(a.id)) return false
      return !q || a.searchName.includes(q) || normalizeText(a.industry ?? '').includes(q)
    })
  }, [accounts, filter, countries, sansRdv, accountsWithUpcomingRdv])

  const filtersActive = Boolean(filter || countries.length || sansRdv)

  const pg = paginate(rows, page, pageSize)

  // Cellule Rendez-vous : le RDV ouvre son détail ; une fois passé, bouton pour le compte rendu
  function renderRdv(rdv: RdvItem | undefined) {
    if (!rdv) return '—'
    const done = rdv.at.getTime() < now
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="cursor-pointer text-left hover:underline"
          onClick={(e) => {
            e.stopPropagation()
            setOpenRdv(rdv)
          }}
        >
          {rdv.contactName} · {formatDateTime(rdv.at)}
        </button>
        {done && <span className="text-xs">· terminé</span>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation()
            setOpenRdv(rdv)
          }}
        >
          {rdv.call.compteRendu ? 'Voir le CR' : done ? 'Faire le CR' : 'Préparer le CR'}
        </Button>
      </span>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Comptes</h1>
          <p className="text-sm text-muted-foreground">{accounts.length} compte(s)</p>
        </div>
        {!teamView && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Nouveau compte
          </Button>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Filtrer par nom ou industrie…"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setPage(1)
          }}
          className="max-w-sm"
          aria-label="Filtrer les comptes"
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
        <Button
          variant={sansRdv ? 'default' : 'outline'}
          size="sm"
          aria-pressed={sansRdv}
          onClick={() => {
            setSansRdv(!sansRdv)
            setPage(1)
          }}
        >
          {sansRdv ? 'Comptes sans RDV à venir' : 'Afficher seulement sans RDV à venir'}
        </Button>
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              update({ q: null, pays: null, sans_rdv: null })
              setPage(1)
            }}
          >
            Réinitialiser
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Entreprise</TableHead>
              {!teamView && <TableHead>Rendez-vous</TableHead>}
              {teamView && <TableHead>Propriétaire</TableHead>}
              <TableHead className="hidden md:table-cell">Pays</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.items.map((a) => (
              <TableRow
                key={a.id}
                className="cursor-pointer"
                onClick={() => navigate(`/accounts/${a.id}`, { state: { from: href } })}
              >
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {a.name}
                    <span
                      className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal tabular-nums text-muted-foreground"
                      title={contactLabel(contactCount.get(a.id) ?? 0)}
                      aria-label={contactLabel(contactCount.get(a.id) ?? 0)}
                    >
                      {contactCount.get(a.id) ?? 0}
                    </span>
                  </span>
                </TableCell>
                {!teamView && (
                  <TableCell className={rdvClass(rdvByAccount.get(a.id), now)}>
                    {renderRdv(rdvByAccount.get(a.id))}
                  </TableCell>
                )}
                {teamView && <TableCell className="text-muted-foreground">{ownerEmail(a.ownerId) ?? '—'}</TableCell>}
                <TableCell className="hidden md:table-cell">{countryLabel(a.country)}</TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  Aucun compte. Créez-en un pour commencer.
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

      {openRdv && (
        <RdvDialog
          open
          onOpenChange={(open) => !open && setOpenRdv(null)}
          call={openRdv.call}
          contactName={openRdv.contactName}
          done={openRdv.at.getTime() < now}
          onSaved={() => setRdvReloadKey((k) => k + 1)}
        />
      )}

      <AccountDialog
        open={creating}
        onOpenChange={setCreating}
        ownerId={uid ?? ''}
        onSaved={(id) => {
          void refresh()
          navigate(`/accounts/${id}`)
        }}
      />
    </section>
  )
}
