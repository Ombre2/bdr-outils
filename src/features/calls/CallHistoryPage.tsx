import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/FormSelect'
import { Input } from '@/components/ui/input'
import { Pagination, paginate } from '@/components/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { computeCallMetrics } from '@/lib/metrics'
import { formatPhone } from '@/lib/phone'
import { PERIOD_KEYS, PERIOD_LABELS, formatRangeLabel, periodRange, type PeriodKey } from '@/lib/period'
import { formatDateTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { listCallsBetween, listTeamCallsBetween } from '@/services/calls.repo'
import { outcomeLabel, type Call } from '@/types/models'

const DEFAULT_PERIOD: PeriodKey = 'today'

function isPeriodKey(value: string | null): value is PeriodKey {
  return PERIOD_KEYS.includes(value as PeriodKey)
}

/** Historique des appels, avec filtre de période. L'admin voit toute l'équipe ou un seul BDR (lecture seule). */
export function CallHistoryPage() {
  const { user } = useAuth()
  const { contacts, accountById, emailsOf, ownerEmail, teamView, owners, loading: directoryLoading } = useDirectory()
  // Filtres dans l'URL (?p=…&from=…&to=…&bdr=…) : pas de stockage local, lien partageable
  const [params, setParams] = useSearchParams()
  const periodParam = params.get('p')
  const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : DEFAULT_PERIOD
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const bdrParam = teamView ? (params.get('bdr') ?? '') : ''

  // « Une seule date » : renseigner « Du » suffit, « Au » reprend la même date
  const range = useMemo(
    () => periodRange(period, new Date(), period === 'custom' ? { from, to: to || from } : undefined),
    [period, from, to],
  )
  const startMs = range?.start.getTime() ?? null
  const endMs = range?.end.getTime() ?? null

  const [calls, setCalls] = useState<Call[] | null>(null)
  const [error, setError] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!user || startMs === null || endMs === null) return
    let cancelled = false
    setError(false)
    const start = new Date(startMs)
    const end = new Date(endMs)
    const load = teamView ? listTeamCallsBetween(start, end) : listCallsBetween(user.uid, start, end)
    load
      .then((list) => !cancelled && setCalls(list))
      .catch(() => {
        if (!cancelled) {
          setCalls(null)
          setError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [user, teamView, startMs, endMs, reloadKey])

  const shownCalls = useMemo(
    () => (calls && bdrParam ? calls.filter((c) => c.ownerId === bdrParam) : (calls ?? [])),
    [calls, bdrParam],
  )
  const metrics = useMemo(() => computeCallMetrics(shownCalls), [shownCalls])

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])

  function setParam(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params)
    mutate(next)
    setParams(next, { replace: true })
  }

  function setPeriod(key: PeriodKey) {
    setParam((next) => {
      next.set('p', key)
      if (key !== 'custom') {
        next.delete('from')
        next.delete('to')
      }
    })
  }

  function setCustom(field: 'from' | 'to', value: string) {
    setParam((next) => {
      next.set('p', 'custom')
      next.set(field, value)
    })
  }

  function setBdr(id: string) {
    setParam((next) => {
      if (id) next.set('bdr', id)
      else next.delete('bdr')
    })
  }

  const loading = calls === null && !error
  const pg = paginate(shownCalls, page, pageSize)

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Historique des appels</h1>
          <p className="text-sm text-muted-foreground">
            {range ? formatRangeLabel(range) : 'Choisissez des dates valides'}
            {calls && ` · ${metrics.total} appel${metrics.total > 1 ? 's' : ''} · ${metrics.rdv} RDV`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {teamView && (
            <FormSelect
              className="w-56"
              value={bdrParam}
              onValueChange={setBdr}
              options={owners.map((o) => ({ value: o.id, label: o.label }))}
              emptyLabel="Tous les BDR"
              ariaLabel="BDR"
            />
          )}
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Période">
            {PERIOD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                aria-pressed={period === key}
                className={cn(
                  'cursor-pointer rounded-sm px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
                  period === key && 'bg-accent font-medium text-foreground',
                )}
              >
                {PERIOD_LABELS[key]}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input type="date" aria-label="Du" value={from} onChange={(e) => setCustom('from', e.target.value)} className="w-40" />
              <span className="text-sm text-muted-foreground">au</span>
              <Input type="date" aria-label="Au" value={to} onChange={(e) => setCustom('to', e.target.value)} className="w-40" />
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="flex shrink-0 items-center justify-between rounded-md border border-border p-3 text-sm">
          <span className="text-muted-foreground">Chargement des appels impossible.</span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            Réessayer
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-40">Date de l’appel</TableHead>
              {teamView && <TableHead className="hidden lg:table-cell">BDR</TableHead>}
              <TableHead>Contact</TableHead>
              <TableHead className="hidden md:table-cell">Compte</TableHead>
              <TableHead>Résultat</TableHead>
              <TableHead className="hidden lg:table-cell">Rendez-vous</TableHead>
              <TableHead className="hidden md:table-cell">Notes de l’appel</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.items.map((call) => {
              const contact = contactById.get(call.contactId)
              const primaryEmail = contact ? emailsOf(contact.id)[0]?.address : null
              const accountName = accountById(call.accountId)?.name ?? contact?.accountName ?? '—'
              return (
                <TableRow key={call.id}>
                  <TableCell className="tabular-nums">{formatDateTime(call.calledAt.toDate())}</TableCell>
                  {teamView && (
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{ownerEmail(call.ownerId) ?? '—'}</TableCell>
                  )}
                  <TableCell>
                    {contact ? (
                      <>
                        <Link to={`/contacts/${contact.id}`} className="font-medium hover:underline">
                          {contact.firstName} {contact.lastName}
                        </Link>
                        {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
                        <p className="text-xs text-muted-foreground">
                          {call.calledPhone ? formatPhone(call.calledPhone) : '—'}
                          {primaryEmail && ` · ${primaryEmail}`}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{directoryLoading ? 'Chargement…' : 'Contact introuvable'}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">{accountName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {outcomeLabel(call.outcome)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden tabular-nums lg:table-cell">
                    {call.meetingAt ? (
                      <Badge className="font-normal">{formatDateTime(call.meetingAt.toDate())}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-xs md:table-cell">
                    <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{call.notes ?? ''}</p>
                  </TableCell>
                </TableRow>
              )
            })}
            {shownCalls.length === 0 && (
              <TableRow>
                <TableCell colSpan={teamView ? 7 : 6} className="py-10 text-center text-muted-foreground">
                  {error ? 'Historique indisponible pour le moment.' : loading ? 'Chargement…' : 'Aucun appel sur cette période.'}
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
    </section>
  )
}
