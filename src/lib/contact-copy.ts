import { formatPhone } from '@/lib/phone'
import type { Contact, ContactEmail, Phone } from '@/types/models'

/**
 * Texte prêt à coller (CRM, email, note) : nom, prénom, titre, entreprise, numéros, email.
 * Le numéro principal (bon numéro) est mis en premier.
 */
export function buildContactCopyText(
  contact: Contact,
  phones: Phone[],
  emails: ContactEmail[],
  accountName: string | null,
): string {
  const lines = [
    `Nom : ${contact.lastName}`,
    `Prénom : ${contact.firstName}`,
    `Titre : ${contact.title ?? '—'}`,
    `Entreprise : ${accountName ?? contact.accountName ?? '—'}`,
  ]
  const sortedPhones = [...phones].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  if (sortedPhones.length === 0) {
    lines.push('Téléphone : —')
  } else {
    sortedPhones.forEach((p, i) => {
      lines.push(`${i === 0 ? 'Téléphone' : 'Autre téléphone'} : ${formatPhone(p.number)} (${p.label})`)
    })
  }
  const primaryEmail = emails.find((e) => e.isPrimary) ?? emails[0]
  lines.push(`Email : ${primaryEmail?.address ?? contact.email ?? '—'}`)
  return lines.join('\n')
}
