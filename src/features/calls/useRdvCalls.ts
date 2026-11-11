import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { listRdvCallsForOwner } from '@/services/calls.repo'
import type { Call } from '@/types/models'

/** Date du RDV : la date du rendez-vous si elle est renseignée, sinon la date de l'appel. */
export function rdvDateOf(call: Call): Date {
  return (call.meetingAt ?? call.calledAt).toDate()
}

/**
 * Dernier RDV pris par contact (l'appel complet, pour afficher le détail et le compte rendu).
 * Vue personnelle seulement : la vue admin ne charge pas les appels de l'équipe, la map est alors vide.
 */
export function useRdvCalls(reloadKey = 0): Map<string, Call> {
  const { user } = useAuth()
  const { teamView } = useDirectory()
  const [rdvCalls, setRdvCalls] = useState<Map<string, Call>>(new Map())

  useEffect(() => {
    if (!user || teamView) return
    let cancelled = false
    listRdvCallsForOwner(user.uid)
      .then((calls) => {
        if (cancelled) return
        const latest = new Map<string, Call>()
        for (const call of calls) {
          const previous = latest.get(call.contactId)
          if (!previous || rdvDateOf(call) > rdvDateOf(previous)) latest.set(call.contactId, call)
        }
        setRdvCalls(latest)
      })
      .catch(() => !cancelled && setRdvCalls(new Map()))
    return () => {
      cancelled = true
    }
  }, [user, teamView, reloadKey])

  return rdvCalls
}
