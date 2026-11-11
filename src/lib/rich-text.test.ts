import { describe, expect, it } from 'vitest'
import { sanitizeRichText } from '@/lib/rich-text'

// Les anciens comptes rendus sont du texte brut : on les affiche tels quels, sans balises interprétées
describe('sanitizeRichText (texte brut)', () => {
  it('échappe le HTML saisi dans un ancien texte brut', () => {
    expect(sanitizeRichText('<img src=x onerror=alert(1)> & co')).toBe('&lt;img src=x onerror=alert(1)&gt; &amp; co')
  })

  it('transforme les retours à la ligne en sauts de ligne', () => {
    expect(sanitizeRichText('Ligne 1\nLigne 2')).toBe('Ligne 1<br>Ligne 2')
  })

  it('garde un signe « inférieur à » suivi d une lettre comme du texte', () => {
    expect(sanitizeRichText('budget x<y')).toBe('budget x&lt;y')
  })
})
