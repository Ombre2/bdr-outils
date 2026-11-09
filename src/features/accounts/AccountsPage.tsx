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

export function AccountsPage() {
  const { accounts, contacts, loading, refresh } = useDirectory()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  // Filtre à choix multiples : liste vide = pas de filtre
  const [countries, setCountries] = useState<string[]>([])
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
      return !q || a.searchName.includes(q) || normalizeText(a.industry ?? '').includes(q)
    })
  }, [accounts, filter, countries])

  const filtersActive = Boolean(filter || countries.length)

  const pg = paginate(rows, page, pageSize)

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Comptes</h1>
          <p className="text-sm text-muted-foreground">{accounts.length} compte(s)</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          Nouveau compte
        </Button>
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
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilter('')
              setCountries([])
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
              <TableHead>Industrie</TableHead>
              <TableHead>Pays</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead className="text-right">Headcount</TableHead>
              <TableHead className="text-right">Contacts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.items.map((a) => (
              <TableRow
                key={a.id}
                className="cursor-pointer"
                onClick={() => navigate(`/accounts/${a.id}`)}
              >
                <TableCell className="font-medium">{a.name}</TableCell>
                <TableCell className="text-muted-foreground">{a.industry ?? '—'}</TableCell>
                <TableCell>{countryLabel(a.country)}</TableCell>
                <TableCell>{a.city ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{a.headcount ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{contactCount.get(a.id) ?? 0}</TableCell>
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
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
