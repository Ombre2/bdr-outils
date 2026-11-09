/** Heure locale d'un fuseau IANA, ex. « 14:32 (UTC+3) ». Renvoie null si le fuseau est invalide. */
export function localTimeLabel(timezone: string | null | undefined, now: Date = new Date()): string | null {
  if (!timezone) return null
  try {
    const time = new Intl.DateTimeFormat('fr-FR', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(now)
    const offset = new Intl.DateTimeFormat('fr-FR', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value
    return offset ? `${time} (${offset})` : time
  } catch {
    return null
  }
}

/** Heure de l'appel affichée dans les listes et la timeline. */
export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
