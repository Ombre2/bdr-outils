import { useEffect, useState } from 'react'
import { localTimeLabel } from '@/lib/time'

/** Heure locale du contact, rafraîchie toutes les 30 secondes. Signale les heures peu adaptées à un appel. */
export function LocalTime({ timezone }: { timezone: string | null }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const label = localTimeLabel(timezone, now)
  if (!label) return <span className="text-muted-foreground">Fuseau non renseigné</span>

  const hour = timezone
    ? Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false }).format(now))
    : 12
  const outOfHours = hour < 8 || hour >= 20

  return (
    <span className="tabular-nums">
      {label}
      {outOfHours && <span className="ml-2 text-xs text-muted-foreground">· hors plage d'appel</span>}
    </span>
  )
}
