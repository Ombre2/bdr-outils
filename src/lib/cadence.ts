import type { Cadence, CadenceStep, Contact } from '@/types/models'

export interface CadenceDue {
  index: number // position de l'étape dans la cadence (0 = première)
  step: CadenceStep
  dueAt: Date // jour de l'étape, à minuit (heure locale)
}

/**
 * Prochaine étape d'un contact dans sa cadence, avec sa date.
 * Renvoie null si pas de cadence, ou si toutes les étapes sont faites.
 * Le délai se compte en jours calendaires à partir du jour de démarrage.
 */
export function nextCadenceStep(cadence: Cadence | undefined, contact: Contact): CadenceDue | null {
  if (!cadence || !contact.cadenceStartedAt) return null
  const index = contact.cadenceStep ?? 0
  const step = cadence.steps[index]
  if (!step) return null
  const start = contact.cadenceStartedAt.toDate()
  const dueAt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + step.dayOffset)
  return { index, step, dueAt }
}
