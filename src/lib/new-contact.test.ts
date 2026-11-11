import { describe, expect, it } from 'vitest'
import { NEW_CONTACT_WINDOW_MS, isNewContact } from '@/lib/new-contact'

const NOW = new Date('2026-11-11T12:00:00Z')
const createdAgo = (ms: number) => ({ toMillis: () => NOW.getTime() - ms })

describe('isNewContact', () => {
  it('affiche le badge juste après la création', () => {
    expect(isNewContact(createdAgo(0), NOW)).toBe(true)
  })

  it('affiche le badge jusqu’à 24 h, pas au-delà', () => {
    expect(isNewContact(createdAgo(NEW_CONTACT_WINDOW_MS - 1), NOW)).toBe(true)
    expect(isNewContact(createdAgo(NEW_CONTACT_WINDOW_MS), NOW)).toBe(false)
  })

  it('ne l’affiche pas sans date de création', () => {
    expect(isNewContact(null, NOW)).toBe(false)
    expect(isNewContact(undefined, NOW)).toBe(false)
  })
})
