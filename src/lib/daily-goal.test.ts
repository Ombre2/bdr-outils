import { describe, expect, it } from 'vitest'
import { goalProgress, parseDailyCallGoal } from '@/lib/daily-goal'

describe('parseDailyCallGoal', () => {
  it('accepte un nombre entier entre 1 et 500', () => {
    expect(parseDailyCallGoal('40')).toBe(40)
    expect(parseDailyCallGoal(' 1 ')).toBe(1)
    expect(parseDailyCallGoal('500')).toBe(500)
  })

  it('refuse le vide, zéro, les décimales, le texte et les valeurs trop grandes', () => {
    expect(parseDailyCallGoal('')).toBeNull()
    expect(parseDailyCallGoal('0')).toBeNull()
    expect(parseDailyCallGoal('12.5')).toBeNull()
    expect(parseDailyCallGoal('-3')).toBeNull()
    expect(parseDailyCallGoal('abc')).toBeNull()
    expect(parseDailyCallGoal('501')).toBeNull()
  })
})

describe('goalProgress', () => {
  it('calcule le pourcentage arrondi', () => {
    expect(goalProgress(0, 40)).toBe(0)
    expect(goalProgress(18, 40)).toBe(45)
    expect(goalProgress(1, 3)).toBe(33)
  })

  it('plafonne à 100 quand l’objectif est dépassé', () => {
    expect(goalProgress(55, 40)).toBe(100)
  })
})
