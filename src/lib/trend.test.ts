import { describe, expect, it } from 'vitest'
import { buildBuckets, bucketStart } from '@/lib/trend'

describe('bucketStart', () => {
  it('ramène une date au début du jour', () => {
    expect(bucketStart(new Date(2026, 10, 12, 14, 32), 'day')).toEqual(new Date(2026, 10, 12))
  })

  it('ramène une date au lundi de sa semaine', () => {
    // 12 novembre 2026 est un jeudi : lundi = 9 novembre
    expect(bucketStart(new Date(2026, 10, 12, 14, 32), 'week')).toEqual(new Date(2026, 10, 9))
    // un dimanche appartient à la semaine qui commence le lundi précédent
    expect(bucketStart(new Date(2026, 10, 15, 9, 0), 'week')).toEqual(new Date(2026, 10, 9))
  })
})

describe('buildBuckets', () => {
  it('liste tous les jours de la période, sans trou', () => {
    const days = buildBuckets(new Date(2026, 10, 10, 9), new Date(2026, 10, 12, 18), 'day')
    expect(days).toEqual([new Date(2026, 10, 10), new Date(2026, 10, 11), new Date(2026, 10, 12)])
  })

  it('liste les semaines (lundis) couvrant la période', () => {
    // du jeudi 12 au mardi 24 novembre : semaines du 9 et du 16 et du 23
    const weeks = buildBuckets(new Date(2026, 10, 12), new Date(2026, 10, 24, 23, 59), 'week')
    expect(weeks).toEqual([new Date(2026, 10, 9), new Date(2026, 10, 16), new Date(2026, 10, 23)])
  })

  it('une période d\'un seul jour donne un seul jour', () => {
    expect(buildBuckets(new Date(2026, 10, 12, 0, 0), new Date(2026, 10, 12, 23, 59), 'day')).toEqual([new Date(2026, 10, 12)])
  })
})
