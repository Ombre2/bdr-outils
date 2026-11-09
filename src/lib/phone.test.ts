import { describe, expect, it } from 'vitest'
import { callHref, formatPhone, parsePhone } from '@/lib/phone'

describe('callHref : lien d\'appel CloudTalk', () => {
  it('numéro E.164 : lien ct+tel: (ouvre CloudTalk, pas Linkus)', () => {
    expect(callHref('+233205294019')).toBe('ct+tel:+233205294019')
  })

  it('numéro non E.164 ou texte libre : pas de lien', () => {
    expect(callHref('0205294019')).toBeNull()
    expect(callHref('tel:+233205294019')).toBeNull()
  })
})

describe('parsePhone : formats saisis', () => {
  it('+1 919-864-6942 (États-Unis) : espaces et tirets ignorés', () => {
    expect(parsePhone('+1 919-864-6942', 'MG')?.e164).toBe('+19198646942')
  })

  it('233 20 811 1165 sans « + » : indicatif du Ghana reconnu', () => {
    expect(parsePhone('233 20 811 1165', 'MG')?.e164).toBe('+233208111165')
    expect(parsePhone('233 20 811 1165')?.e164).toBe('+233208111165')
  })

  it('00225 05 56 63 9628 : préfixe 00 traité comme « + » (Côte d\'Ivoire)', () => {
    expect(parsePhone('00225 05 56 63 9628', 'MG')?.e164).toBe('+2250556639628')
    expect(parsePhone('00225 05 56 63 9628')?.e164).toBe('+2250556639628')
  })

  it('numéro national du pays par défaut reste prioritaire', () => {
    expect(parsePhone('034 12 345 67', 'MG')?.e164).toBe('+261341234567')
  })

  it('un numéro national invalide n\'est pas réinterprété comme indicatif', () => {
    expect(parsePhone('06 12 34 56 78', 'MG')).toBeNull()
  })

  it('un numéro trop court est refusé', () => {
    expect(parsePhone('12', 'MG')).toBeNull()
  })

  it('vide ou texte sans chiffres : refusé', () => {
    expect(parsePhone('   ', 'MG')).toBeNull()
    expect(parsePhone('abc', 'MG')).toBeNull()
  })
})

describe('formatPhone : affichage seulement', () => {
  it('ajoute des espaces au format international', () => {
    expect(formatPhone('+233205294019')).toBe('+233 20 529 4019')
    expect(formatPhone('+8801704133023')).toBe('+880 1704 133023')
  })

  it('garde la valeur brute si le numéro est invalide', () => {
    expect(formatPhone('+216346998094')).toBe('+216346998094')
  })
})
