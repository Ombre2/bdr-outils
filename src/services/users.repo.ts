import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { DEFAULT_DAILY_CALL_GOAL, MAX_DAILY_CALL_GOAL, MIN_DAILY_CALL_GOAL } from '@/lib/daily-goal'
import { db } from '@/services/firebase'

export class DailyGoalInputError extends Error {}

/** Objectif d'appels du jour du BDR (valeur par défaut s'il n'en a pas encore choisi). */
export async function getDailyCallGoal(uid: string): Promise<number> {
  const snap = await getDoc(doc(db, 'users', uid))
  const goal: unknown = snap.exists() ? snap.data().dailyCallGoal : undefined
  return typeof goal === 'number' ? goal : DEFAULT_DAILY_CALL_GOAL
}

/** Enregistre l'objectif dans l'entrée users/{uid}, sans toucher à l'email. */
export async function setDailyCallGoal(uid: string, goal: number): Promise<void> {
  if (!Number.isInteger(goal) || goal < MIN_DAILY_CALL_GOAL || goal > MAX_DAILY_CALL_GOAL) {
    throw new DailyGoalInputError(`L’objectif doit être un nombre entre ${MIN_DAILY_CALL_GOAL} et ${MAX_DAILY_CALL_GOAL}.`)
  }
  await setDoc(doc(db, 'users', uid), { dailyCallGoal: goal, updatedAt: serverTimestamp() }, { merge: true })
}
