/** Fuseau de l'appareil du BDR (ex. Indian/Antananarivo). */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Décalage d'un fuseau à un instant donné, en millisecondes (heure murale − UTC). */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  const wallAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return wallAsUtc - (instant.getTime() - instant.getMilliseconds())
}

/**
 * Date/heure « jour J + n à HH:00 » dans le fuseau donné.
 * Exemple : demain 9h à Abidjan, quel que soit le fuseau de l'appareil.
 */
export function zonedDateAt(daysFromToday: number, hour: number, timeZone: string, now: Date = new Date()): Date {
  const today = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  const target = new Date(Date.UTC(Number(today.year), Number(today.month) - 1, Number(today.day) + daysFromToday))
  const guess = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate(), hour, 0)
  const offset = tzOffsetMs(new Date(guess), timeZone)
  return new Date(guess - offset)
}

/** Date saisie (AAAA-MM-JJ) à 9h dans le fuseau donné. */
export function zonedDateFromInput(dateInput: string, timeZone: string, hour = 9): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput)
  if (!match) return null
  const [, y, m, d] = match
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), hour, 0)
  return new Date(guess - tzOffsetMs(new Date(guess), timeZone))
}

/** Fin de la journée de l'appareil : sert à « Ma Journée » (rappels du jour + retards). */
export function endOfToday(now: Date = new Date()): Date {
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return end
}

/** Fin de la journée de demain : sert à « Ma Journée » (rappels planifiés pour demain). */
export function endOfTomorrow(now: Date = new Date()): Date {
  const end = endOfToday(now)
  end.setDate(end.getDate() + 1)
  return end
}

/**
 * Créneaux de rappel pour une liste d'appels, dans l'ordre : une minute d'écart entre deux appels.
 * Aujourd'hui : à partir de maintenant. Demain : à partir de 9h. Sert à garder l'ordre choisi dans « Ma Journée ».
 */
export function planCallSlots(count: number, day: 'today' | 'tomorrow', now: Date = new Date()): Date[] {
  const start = new Date(now)
  if (day === 'today') {
    start.setSeconds(0, 0)
    start.setMinutes(start.getMinutes() + 1)
  } else {
    start.setDate(start.getDate() + 1)
    start.setHours(9, 0, 0, 0)
  }
  return Array.from({ length: count }, (_, i) => new Date(start.getTime() + i * 60_000))
}

export function startOfToday(now: Date = new Date()): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start
}
