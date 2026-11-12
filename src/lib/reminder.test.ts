import { describe, expect, it } from 'vitest'
import { planCallSlots } from '@/lib/reminder'

describe('planCallSlots', () => {
  it('aujourd’hui : commence à la minute suivante, un appel par minute, dans l’ordre', () => {
    const now = new Date(2026, 10, 12, 10, 30, 45)
    const slots = planCallSlots(3, 'today', now)
    expect(slots.map((d) => [d.getDate(), d.getHours(), d.getMinutes()])).toEqual([
      [12, 10, 31],
      [12, 10, 32],
      [12, 10, 33],
    ])
  })

  it('demain : commence à 9h le lendemain', () => {
    const now = new Date(2026, 10, 12, 16, 0, 0)
    const slots = planCallSlots(2, 'tomorrow', now)
    expect(slots.map((d) => [d.getDate(), d.getHours(), d.getMinutes()])).toEqual([
      [13, 9, 0],
      [13, 9, 1],
    ])
  })

  it('liste vide : aucun créneau', () => {
    expect(planCallSlots(0, 'today')).toEqual([])
  })
})
