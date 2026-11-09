import { describe, expect, it } from 'vitest'
import { computeCallMetrics, formatPercent } from '@/lib/metrics'
import { periodRange, parseLocalDate } from '@/lib/period'
import type { CallOutcome } from '@/types/models'

const calls = (outcomes: CallOutcome[]) => outcomes.map((outcome) => ({ outcome }))

describe('computeCallMetrics', () => {
  it('exclut les faux numéros du taux de connexion', () => {
    const m = computeCallMetrics(
      calls(['NPR', 'Argumenté', 'Mauvais numéro', 'RDV pris', 'Messagerie', 'Rappel demandé']),
    )
    expect(m.total).toBe(6)
    expect(m.attempts).toBe(5)
    expect(m.connected).toBe(3)
    expect(m.connectRate).toBeCloseTo(0.6)
    expect(m.rdv).toBe(1)
  })

  it('renvoie un taux nul (non calculable) sans essai', () => {
    const m = computeCallMetrics(calls(['Mauvais numéro']))
    expect(m.connectRate).toBeNull()
    expect(formatPercent(m.connectRate)).toBe('—')
  })

  it('gère une liste vide', () => {
    const m = computeCallMetrics([])
    expect(m.total).toBe(0)
    expect(m.connectRate).toBeNull()
    expect(m.rdv).toBe(0)
  })
})

describe('periodRange', () => {
  // Mercredi 11 novembre 2026, 15h00 heure locale
  const now = new Date(2026, 10, 11, 15, 0, 0)

  it("aujourd'hui couvre la journée locale", () => {
    const r = periodRange('today', now)!
    expect(r.start.getHours()).toBe(0)
    expect(r.end.getDate()).toBe(11)
    expect(r.end.getHours()).toBe(23)
  })

  it('la semaine commence le lundi et finit le dimanche', () => {
    const r = periodRange('week', now)!
    expect(r.start.getDay()).toBe(1) // lundi
    expect(r.start.getDate()).toBe(9)
    expect(r.end.getDay()).toBe(0) // dimanche
    expect(r.end.getDate()).toBe(15)
  })

  it('un dimanche appartient à la semaine qui commence le lundi précédent', () => {
    const sunday = new Date(2026, 10, 15, 10, 0, 0)
    const r = periodRange('week', sunday)!
    expect(r.start.getDate()).toBe(9)
  })

  it('le mois couvre du 1er au dernier jour', () => {
    const r = periodRange('month', now)!
    expect(r.start.getDate()).toBe(1)
    expect(r.end.getDate()).toBe(30)
  })

  it('personnalisé : bornes incluses, refuse les dates inversées ou invalides', () => {
    const r = periodRange('custom', now, { from: '2026-11-01', to: '2026-11-03' })!
    expect(r.end.getDate()).toBe(3)
    expect(r.end.getHours()).toBe(23)
    expect(periodRange('custom', now, { from: '2026-11-05', to: '2026-11-01' })).toBeNull()
    expect(parseLocalDate('2026-02-31', 'start')).toBeNull()
  })
})
