export type Granularity = 'day' | 'week'

/** Début du jour (heure locale). */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Début de la semaine (lundi, heure locale). */
function startOfWeek(date: Date): Date {
  const d = startOfDay(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** Début du jour ou de la semaine qui contient cette date. */
export function bucketStart(date: Date, granularity: Granularity): Date {
  return granularity === 'day' ? startOfDay(date) : startOfWeek(date)
}

/** Liste des jours (ou semaines) de la période, du premier au dernier, sans trou. */
export function buildBuckets(start: Date, end: Date, granularity: Granularity): Date[] {
  const buckets: Date[] = []
  const step = granularity === 'day' ? 1 : 7
  for (let cur = bucketStart(start, granularity); cur <= end; ) {
    buckets.push(cur)
    cur = new Date(cur)
    cur.setDate(cur.getDate() + step) // setDate : reste correct au passage d'heure d'été
  }
  return buckets
}
