import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { computeCallMetrics, formatPercent } from '@/lib/metrics'
import { PERIOD_KEYS, PERIOD_LABELS, formatRangeLabel, periodRange, type PeriodKey } from '@/lib/period'
import { cn } from '@/lib/utils'
import { listCallsBetween } from '@/services/calls.repo'
import { CALL_OUTCOMES, type Call } from '@/types/models'

const DEFAULT_PERIOD: PeriodKey = 'week'

function isPeriodKey(value: string | null): value is PeriodKey {
  return PERIOD_KEYS.includes(value as PeriodKey)
}

export function DashboardPage() {
  const { user } = useAuth()
  const { contacts } = useDirectory()
  // Période dans l'URL (?p=…&from=…&to=…) : pas de stockage local, lien partageable entre vos onglets
  const [params, setParams] = useSearchParams()
  const periodParam = params.get('p')
  const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : DEFAULT_PERIOD
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''

  const range = useMemo(
    () => periodRange(period, new Date(), period === 'custom' ? { from, to } : undefined),
    [period, from, to],
  )

  const [calls, setCalls] = useState<Call[] | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const startMs = range?.start.getTime() ?? null
  const endMs = range?.end.getTime() ?? null

  useEffect(() => {
    if (!user || !range) return
    let cancelled = false
    setError(false)
    listCallsBetween(user.uid, range.start, range.end)
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
    // startMs/endMs suffisent : range est recréé à chaque rendu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, startMs, endMs, reloadKey])

  const metrics = useMemo(() => computeCallMetrics(calls ?? []), [calls])

  // Contacts qualifiés : passés au statut « Qualifié » pendant la période
  const qualified = useMemo(() => {
    if (startMs === null || endMs === null) return 0
    return contacts.filter(
      (c) => c.status === 'Qualifié' && c.statusChangedAt.toMillis() >= startMs && c.statusChangedAt.toMillis() <= endMs,
    ).length
  }, [contacts, startMs, endMs])

  function setPeriod(key: PeriodKey) {
    const next = new URLSearchParams(params)
    next.set('p', key)
    if (key !== 'custom') {
      next.delete('from')
      next.delete('to')
    }
    setParams(next, { replace: true })
  }

  function setCustom(field: 'from' | 'to', value: string) {
    const next = new URLSearchParams(params)
    next.set('p', 'custom')
    next.set(field, value)
    setParams(next, { replace: true })
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">{range ? formatRangeLabel(range) : 'Choisissez des dates valides'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Période">
            {PERIOD_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                aria-pressed={period === key}
                className={cn(
                  'rounded-sm px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
                  period === key && 'bg-accent font-medium text-foreground',
                )}
              >
                {PERIOD_LABELS[key]}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="Du"
                value={from}
                onChange={(e) => setCustom('from', e.target.value)}
                className="w-40"
              />
              <span className="text-sm text-muted-foreground">au</span>
              <Input
                type="date"
                aria-label="Au"
                value={to}
                onChange={(e) => setCustom('to', e.target.value)}
                className="w-40"
              />
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
          <span className="text-muted-foreground">Chargement des appels impossible.</span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            Réessayer
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Appels passés" value={calls ? metrics.total : '—'} />
        <Tile
          label="Taux de connexion"
          value={calls ? formatPercent(metrics.connectRate) : '—'}
          hint={calls ? `${metrics.connected} connecté(s) / ${metrics.attempts} tentative(s)` : undefined}
        />
        <Tile label="RDV pris" value={calls ? metrics.rdv : '—'} />
        <Tile label="Contacts qualifiés" value={qualified} hint="Passés à « Qualifié » sur la période" />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Répartition des résultats</h2>
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Résultat</th>
                <th className="px-3 py-2 text-right font-medium">Appels</th>
                <th className="px-3 py-2 text-right font-medium">Part</th>
              </tr>
            </thead>
            <tbody>
              {CALL_OUTCOMES.map((o) => {
                const count = metrics.byOutcome[o]
                const share = metrics.total > 0 ? count / metrics.total : null
                return (
                  <tr key={o} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{o}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{count}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatPercent(share)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Taux de connexion = résultats « Argumenté », « Rappel demandé » et « RDV pris », sur les appels hors « Mauvais numéro ».
        </p>
      </div>
    </section>
  )
}

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
