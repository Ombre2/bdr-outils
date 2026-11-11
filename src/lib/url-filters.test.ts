import { describe, expect, it } from 'vitest'
import { applyFilterChanges, backTarget } from '@/lib/url-filters'

describe('applyFilterChanges', () => {
  it('ajoute une valeur et garde les autres paramètres', () => {
    const next = applyFilterChanges(new URLSearchParams('q=abc'), { pays: ['FR', 'BE'] })
    expect(next.get('q')).toBe('abc')
    expect(next.getAll('pays')).toEqual(['FR', 'BE'])
  })

  it('remplace une liste existante sans la doubler', () => {
    const next = applyFilterChanges(new URLSearchParams('pays=FR&pays=BE'), { pays: ['DE'] })
    expect(next.getAll('pays')).toEqual(['DE'])
  })

  it('retire le paramètre quand la valeur est vide ou null', () => {
    const current = new URLSearchParams('q=abc&pays=FR&masquer=1')
    expect(applyFilterChanges(current, { q: '' }).has('q')).toBe(false)
    expect(applyFilterChanges(current, { pays: [] }).has('pays')).toBe(false)
    expect(applyFilterChanges(current, { masquer: null }).has('masquer')).toBe(false)
  })

  it('ne modifie pas les paramètres d origine', () => {
    const current = new URLSearchParams('q=abc')
    applyFilterChanges(current, { q: null })
    expect(current.get('q')).toBe('abc')
  })
})

describe('backTarget', () => {
  it('renvoie l adresse de la liste quand elle est transmise', () => {
    expect(backTarget({ from: '/contacts?statut=Nouveau' }, '/contacts')).toBe('/contacts?statut=Nouveau')
  })

  it('renvoie l adresse par défaut sans état ou avec un état inattendu', () => {
    expect(backTarget(null, '/contacts')).toBe('/contacts')
    expect(backTarget({ from: 'https://example.com' }, '/contacts')).toBe('/contacts')
    expect(backTarget('texte', '/accounts')).toBe('/accounts')
  })
})
