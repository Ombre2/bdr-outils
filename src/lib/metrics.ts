import { CALL_OUTCOMES, type CallOutcome } from '@/types/models'

/** Résultats où quelqu'un a réellement parlé au BDR. */
export const CONNECTED_OUTCOMES: readonly CallOutcome[] = ['Argumenté', 'Rappel demandé', 'RDV pris']

/** Résultats qui ne comptent pas comme essai (mauvais numéro). « Faux numéro » = ancien libellé, gardé pour l'historique. */
export const NON_ATTEMPT_OUTCOMES: readonly string[] = ['Mauvais numéro', 'Faux numéro']

export interface CallMetrics {
  total: number // tous les appels de la période
  attempts: number // total hors mauvais numéros
  connected: number
  connectRate: number | null // connected / attempts, null si aucun essai
  rdv: number
  byOutcome: Record<CallOutcome, number>
}

/** Calcule les métriques d'appels. Les faux numéros ne comptent pas dans le taux de connexion. */
export function computeCallMetrics(calls: readonly { outcome: CallOutcome }[]): CallMetrics {
  const byOutcome = Object.fromEntries(CALL_OUTCOMES.map((o) => [o, 0])) as Record<CallOutcome, number>
  for (const call of calls) {
    if (call.outcome in byOutcome) byOutcome[call.outcome] += 1
  }

  const total = calls.length
  const nonAttempts = calls.filter((c) => NON_ATTEMPT_OUTCOMES.includes(c.outcome)).length
  const attempts = total - nonAttempts
  const connected = CONNECTED_OUTCOMES.reduce((sum, o) => sum + byOutcome[o], 0)

  return {
    total,
    attempts,
    connected,
    connectRate: attempts > 0 ? connected / attempts : null,
    rdv: byOutcome['RDV pris'],
    byOutcome,
  }
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)} %`
}
