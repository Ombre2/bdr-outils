/** Objectif d'appels du jour proposé tant que le BDR n'a pas choisi le sien. */
export const DEFAULT_DAILY_CALL_GOAL = 40
/** Limites acceptées, identiques à celles de firebase/firestore.rules. */
export const MIN_DAILY_CALL_GOAL = 1
export const MAX_DAILY_CALL_GOAL = 500

/** Objectif saisi (texte) → nombre entier valide, ou null si la saisie est incorrecte. */
export function parseDailyCallGoal(input: string): number | null {
  const text = input.trim()
  if (!/^\d+$/.test(text)) return null
  const goal = Number(text)
  return goal >= MIN_DAILY_CALL_GOAL && goal <= MAX_DAILY_CALL_GOAL ? goal : null
}

/** Avancement vers l'objectif, en pourcentage de 0 à 100 (plafonné une fois l'objectif dépassé). */
export function goalProgress(done: number, goal: number): number {
  if (goal <= 0) return 0
  return Math.min(100, Math.round((done / goal) * 100))
}
