import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { cleanText } from '@/lib/text'
import { db } from '@/services/firebase'
import { CADENCE_CHANNELS, MAX_CADENCE_STEPS, type Cadence, type CadenceStep } from '@/types/models'

export class CadenceInputError extends Error {}

/** Valide et nettoie les étapes : jours entre 0 et 365, libellé obligatoire, 1 à 20 étapes, triées par jour. */
export function prepareSteps(steps: CadenceStep[]): CadenceStep[] {
  if (steps.length < 1) throw new CadenceInputError('Ajoutez au moins une étape.')
  if (steps.length > MAX_CADENCE_STEPS) throw new CadenceInputError(`Maximum ${MAX_CADENCE_STEPS} étapes.`)
  return steps
    .map((s) => {
      const label = cleanText(s.label, 120)
      if (!label) throw new CadenceInputError('Chaque étape a besoin d’un libellé.')
      if (!Number.isInteger(s.dayOffset) || s.dayOffset < 0 || s.dayOffset > 365) {
        throw new CadenceInputError('Le délai doit être un nombre de jours entre 0 et 365.')
      }
      if (!CADENCE_CHANNELS.includes(s.channel)) throw new CadenceInputError('Canal invalide.')
      return { dayOffset: s.dayOffset, channel: s.channel, label }
    })
    .sort((a, b) => a.dayOffset - b.dayOffset)
}

export async function listCadences(ownerId: string): Promise<Cadence[]> {
  const snap = await getDocs(query(collection(db, 'cadences'), where('ownerId', '==', ownerId)))
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Cadence, 'id'>) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

export async function saveCadence(ownerId: string, existing: Cadence | null, name: string, steps: CadenceStep[]): Promise<void> {
  const cleanName = cleanText(name, 120)
  if (!cleanName) throw new CadenceInputError('Le nom de la cadence est obligatoire.')
  const prepared = prepareSteps(steps)
  if (existing) {
    await updateDoc(doc(db, 'cadences', existing.id), { name: cleanName, steps: prepared, updatedAt: serverTimestamp() })
  } else {
    await addDoc(collection(db, 'cadences'), {
      ownerId,
      name: cleanName,
      steps: prepared,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export async function deleteCadence(cadenceId: string): Promise<void> {
  await deleteDoc(doc(db, 'cadences', cadenceId))
}
