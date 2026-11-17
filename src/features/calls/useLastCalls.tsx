import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { formatDateTime } from '@/lib/time'
import { listCallsBetween } from '@/services/calls.repo'
import { outcomeLabel, type Call, type Contact } from '@/types/models'

/**
 * Dernier appel de chaque contact, sur 90 jours.
 * Vue personnelle seulement : la vue admin ne charge pas les appels de l'équipe, la map est alors vide.
 */
export function useLastCalls(reloadKey = 0): Map<string, Call> {
  const { user } = useAuth()
  const { teamView } = useDirectory()
  const [lastCalls, setLastCalls] = useState<Map<string, Call>>(new Map())

  useEffect(() => {
    if (!user || teamView) return
    let cancelled = false
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    listCallsBetween(user.uid, since, new Date())
      .then((calls) => {
        if (cancelled) return
        const map = new Map<string, Call>()
        for (const call of calls) {
          const previous = map.get(call.contactId)
          if (!previous || call.calledAt.toMillis() > previous.calledAt.toMillis()) map.set(call.contactId, call)
        }
        setLastCalls(map)
      })
      .catch(() => !cancelled && setLastCalls(new Map()))
    return () => {
      cancelled = true
    }
  }, [user, teamView, reloadKey])

  return lastCalls
}

/**
 * Dernier appel : date, résultat et description (notes), avec un survol pour le texte entier.
 * Sans appel chargé (plus ancien ou vue admin), on affiche seulement la date gardée sur le contact.
 */
export function LastCallCell({ call, contact }: { call: Call | undefined; contact: Contact }) {
  if (!call) {
    return contact.lastCallAt ? (
      <span className="text-xs tabular-nums text-muted-foreground">{formatDateTime(contact.lastCallAt.toDate())}</span>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    )
  }
  return (
    <div className="max-w-xs space-y-0.5">
      <p className="text-xs tabular-nums text-muted-foreground">
        {formatDateTime(call.calledAt.toDate())} · {outcomeLabel(call.outcome)}
      </p>
      {call.notes && (
        <p className="line-clamp-2 text-sm" title={call.notes}>
          {call.notes}
        </p>
      )}
    </div>
  )
}
