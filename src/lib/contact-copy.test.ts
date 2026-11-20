import { describe, expect, it } from 'vitest'
import { buildContactCopyText } from '@/lib/contact-copy'
import type { Contact } from '@/types/models'

function contact(linkedinUrl: string | null): Contact {
  return {
    firstName: 'Marie',
    lastName: 'Durand',
    title: null,
    accountName: null,
    email: null,
    linkedinUrl,
  } as unknown as Contact
}

describe('buildContactCopyText', () => {
  it('ajoute le profil LinkedIn en dernière ligne', () => {
    const text = buildContactCopyText(contact('https://www.linkedin.com/in/marie-durand'), [], [], null)
    expect(text.split('\n').at(-1)).toBe('LinkedIn : https://www.linkedin.com/in/marie-durand')
  })

  it('affiche un tiret sans profil LinkedIn', () => {
    expect(buildContactCopyText(contact(null), [], [], null)).toContain('LinkedIn : —')
    expect(buildContactCopyText(contact('  '), [], [], null)).toContain('LinkedIn : —')
  })
})
