import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { listRdvCallsForOwner } from '@/services/calls.repo'
import type { Call } from '@/types/models'

/** Date du RDV : la date du rendez-vous si elle est renseignée, sinon la date de l'appel. */
export function rdvDateOf(call: Call): Date {
  return (call.meetingAt ?? call.calledAt).toDate()
}

/** Un rendez-vous d'un appel « RDV pris » : le premier (numéro 1) ou un RDV de suivi (2, 3…). */
export interface MeetingItem {
  number: number
  at: Date
  description: string | null // RDV de suivi seulement
  compteRendu: string | null
}

/** Tous les RDV d'un appel, dans l'ordre : le premier RDV puis les RDV de suivi. */
export function meetingsOf(call: Call): MeetingItem[] {
  const first: MeetingItem = { number: 1, at: rdvDateOf(call), description: null, compteRendu: call.compteRendu ?? null }
  const followUps = (call.followUps ?? []).map((f, i) => ({
    number: i + 2,
    at: f.meetingAt.toDate(),
    description: f.description ?? null,
    compteRendu: f.compteRendu,
  }))
  return [first, ...followUps]
}

/** Dernier RDV d'un appel (le dernier RDV de suivi s'il y en a un). */
export function lastMeetingOf(call: Call): MeetingItem {
  return meetingsOf(call).reduce((latest, m) => (m.at > latest.at ? m : latest))
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
          if (!previous || lastMeetingOf(call).at > lastMeetingOf(previous).at) latest.set(call.contactId, call)
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
