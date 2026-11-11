// Texte riche du compte rendu : seules ces balises sont conservées, tout le reste est retiré.
const KEEP_TAG: Record<string, string> = {
  B: 'b',
  STRONG: 'b',
  I: 'i',
  EM: 'i',
  U: 'u',
  UL: 'ul',
  OL: 'ol',
  LI: 'li',
  P: 'p',
  DIV: 'div',
}
// Ces éléments sont retirés avec tout leur contenu
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE'])
// Un texte sans ces balises est un ancien compte rendu en texte brut
const RICH_TAG_RE = /<(b|i|u|ul|ol|li|p|div|br|strong|em)[\s>/]/i

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cleanNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  if (DROP_WITH_CONTENT.has(el.tagName)) return ''
  if (el.tagName === 'BR') return '<br>'
  const children = [...el.childNodes].map(cleanNode).join('')
  const tag = KEEP_TAG[el.tagName]
  return tag ? `<${tag}>${children}</${tag}>` : children
}

/** Nettoie un texte riche : ne garde que les balises autorisées et échappe le reste. */
export function sanitizeRichText(value: string): string {
  if (!RICH_TAG_RE.test(value)) return escapeText(value).replace(/\n/g, '<br>')
  const doc = new DOMParser().parseFromString(value, 'text/html') // document inerte : rien ne s'exécute
  return [...doc.body.childNodes].map(cleanNode).join('')
}

/** Longueur du texte visible (sans balises). */
export function richTextLength(value: string): number {
  const doc = new DOMParser().parseFromString(sanitizeRichText(value), 'text/html')
  return (doc.body.textContent ?? '').trim().length
}
