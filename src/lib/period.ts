export const PERIOD_KEYS = ['today', 'week', 'month', 'custom'] as const
export type PeriodKey = (typeof PERIOD_KEYS)[number]

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Aujourd'hui",
  week: 'Cette semaine',
  month: 'Ce mois',
  custom: 'Personnalisé',
}

export interface PeriodRange {
  start: Date
  end: Date
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Date AAAA-MM-JJ lue en heure locale de l'appareil (début ou fin de journée). */
export function parseLocalDate(value: string, edge: 'start' | 'end'): Date | null {
  const match = DATE_RE.exec(value)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  // Refuse les dates qui se recalent (ex. 31 février)
  if (date.getMonth() !== Number(m) - 1) return null
  if (edge === 'start') date.setHours(0, 0, 0, 0)
  else date.setHours(23, 59, 59, 999)
  return date
}

/** Bornes de la période, en heure locale de l'appareil. Semaine : lundi → dimanche. */
export function periodRange(
  key: PeriodKey,
  now: Date = new Date(),
  custom?: { from: string; to: string },
): PeriodRange | null {
  switch (key) {
    case 'today': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      const end = new Date(now)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    }
    case 'week': {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // lundi
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return { start, end }
    }
    case 'custom': {
      if (!custom) return null
      const start = parseLocalDate(custom.from, 'start')
      const end = parseLocalDate(custom.to, 'end')
      if (!start || !end || start > end) return null
      return { start, end }
    }
  }
}

export function formatRangeLabel(range: PeriodRange | null): string {
  if (!range) return 'Période invalide'
  const fmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  const same = range.start.toDateString() === range.end.toDateString()
  return same ? fmt.format(range.start) : `${fmt.format(range.start)} → ${fmt.format(range.end)}`
}
