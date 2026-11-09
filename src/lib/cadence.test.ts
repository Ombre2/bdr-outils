import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { nextCadenceStep } from '@/lib/cadence'
import type { Cadence, Contact } from '@/types/models'

const cadence = {
  id: 'c1',
  ownerId: 'u1',
  name: 'Test',
  steps: [
    { dayOffset: 0, channel: 'Appel', label: 'Premier appel' },
    { dayOffset: 2, channel: 'Email', label: 'Email de suivi' },
  ],
} as unknown as Cadence

function contactAt(start: Date | null, step = 0): Contact {
  return {
    id: 'k1',
    cadenceStartedAt: start ? Timestamp.fromDate(start) : null,
    cadenceStep: step,
  } as unknown as Contact
}

describe('nextCadenceStep', () => {
  it('renvoie la première étape le jour du démarrage', () => {
    const start = new Date(2026, 10, 6, 15, 30)
    const next = nextCadenceStep(cadence, contactAt(start))
    expect(next?.index).toBe(0)
    expect(next?.step.label).toBe('Premier appel')
    expect(next?.dueAt).toEqual(new Date(2026, 10, 6))
  })

  it('calcule la date de l’étape suivante en jours calendaires', () => {
    const next = nextCadenceStep(cadence, contactAt(new Date(2026, 10, 6, 15, 30), 1))
    expect(next?.step.label).toBe('Email de suivi')
    expect(next?.dueAt).toEqual(new Date(2026, 10, 8))
  })

  it('renvoie null quand toutes les étapes sont faites ou sans cadence', () => {
    expect(nextCadenceStep(cadence, contactAt(new Date(2026, 10, 6), 2))).toBeNull()
    expect(nextCadenceStep(undefined, contactAt(new Date(2026, 10, 6)))).toBeNull()
    expect(nextCadenceStep(cadence, contactAt(null))).toBeNull()
  })
})
