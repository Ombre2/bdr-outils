import { describe, expect, it } from 'vitest'
import { planCallSlots, reminderDayLabel } from '@/lib/reminder'

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

describe('reminderDayLabel', () => {
  const now = new Date(2026, 10, 26, 10, 0)
  it('aujourd’hui, demain ou date', () => {
    expect(reminderDayLabel(new Date(2026, 10, 26, 14, 32), now)).toBe('aujourd’hui à 14:32')
    expect(reminderDayLabel(new Date(2026, 10, 27, 9, 0), now)).toBe('demain à 09:00')
    expect(reminderDayLabel(new Date(2026, 10, 28, 9, 0), now)).toBe('le 28/11 à 09:00')
  })
})
