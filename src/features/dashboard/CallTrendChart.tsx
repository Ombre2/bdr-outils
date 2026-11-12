import { useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { FormSelect } from '@/components/FormSelect'
import { Button } from '@/components/ui/button'
import { buildBuckets, bucketStart, type Granularity } from '@/lib/trend'
import { cn } from '@/lib/utils'
import { CALL_OUTCOMES, outcomeLabel, type Call, type CallOutcome } from '@/types/models'

interface Props {
  calls: readonly Call[]
  start: Date
  end: Date
}

// Mêmes couleurs que les variables du thème (src/index.css). Recharts écrit les couleurs
// dans des attributs SVG, où les variables CSS ne s'appliquent pas : on les donne en dur.
const COLORS = {
  light: { bar: 'oklch(0.42 0.085 255)', grid: 'oklch(0.92 0.004 286)', tick: 'oklch(0.55 0.01 286)', hover: 'oklch(0.967 0.001 286)' },
  dark: { bar: 'oklch(0.72 0.085 255)', grid: 'oklch(1 0 0 / 12%)', tick: 'oklch(0.72 0.01 286)', hover: 'oklch(0.27 0.006 286)' },
} as const

const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })
const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

interface Point {
  label: string // date courte, sur l'axe
  full: string // date complète, dans l'infobulle
  count: number
}

/** Nombre d'appels par jour ou par semaine, pour un résultat donné ou pour tous. */
export function CallTrendChart({ calls, start, end }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [outcome, setOutcome] = useState<CallOutcome | 'all'>('all')
  const { resolvedTheme } = useTheme()
  const colors = resolvedTheme === 'dark' ? COLORS.dark : COLORS.light

  const points = useMemo<Point[]>(() => {
    const counts = new Map<number, number>()
    for (const call of calls) {
      if (outcome !== 'all' && call.outcome !== outcome) continue
      const key = bucketStart(call.calledAt.toDate(), granularity).getTime()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return buildBuckets(start, end, granularity).map((date) => ({
      label: SHORT_DATE.format(date),
      full: granularity === 'day' ? LONG_DATE.format(date) : `Semaine du ${LONG_DATE.format(date)}`,
      count: counts.get(date.getTime()) ?? 0,
    }))
  }, [calls, start, end, granularity, outcome])

  const total = points.reduce((sum, p) => sum + p.count, 0)
  // Trop de dates pour toutes les afficher : une étiquette sur n
  const tickEvery = Math.max(1, Math.ceil(points.length / 12))

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Évolution des appels</h2>
        <div className="flex flex-wrap items-center gap-2">
          <FormSelect
            className="w-56"
            value={outcome}
            onValueChange={(v) => setOutcome(v as CallOutcome | 'all')}
            options={[{ value: 'all', label: 'Tous les résultats' }, ...CALL_OUTCOMES.map((o) => ({ value: o, label: outcomeLabel(o) }))]}
            ariaLabel="Résultat affiché dans le graphique"
          />
          <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Regroupement">
            {(['day', 'week'] as const).map((g) => (
              <Button
                key={g}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setGranularity(g)}
                aria-pressed={granularity === g}
                className={cn('h-7 px-2.5 text-xs', granularity === g && 'bg-accent font-medium text-foreground')}
              >
                {g === 'day' ? 'Jour' : 'Semaine'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-56 w-full" role="img" aria-label={`Appels par ${granularity === 'day' ? 'jour' : 'semaine'} : ${total} au total`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="label"
              interval={tickEvery - 1}
              tickLine={false}
              axisLine={{ stroke: colors.grid }}
              tick={{ fontSize: 11, fill: colors.tick }}
            />
            <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: colors.tick }} />
            <Tooltip
              cursor={{ fill: colors.hover }}
              labelFormatter={(_label, payload) => payload?.[0]?.payload?.full ?? ''}
              formatter={(value) => [`${value} appel${Number(value) > 1 ? 's' : ''}`, '']}
              contentStyle={{
                background: 'var(--popover)',
                color: 'var(--popover-foreground)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" name="Appels" fill={colors.bar} radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-muted-foreground">
        {total} appel{total > 1 ? 's' : ''} sur la période{outcome !== 'all' ? ` (résultat « ${outcome} »)` : ''}. Survolez une barre pour voir le détail.
      </p>
    </div>
  )
}
