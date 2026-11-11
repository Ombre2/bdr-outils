/** Durée pendant laquelle un contact créé affiche le badge « Nouveau ». */
export const NEW_CONTACT_WINDOW_MS = 24 * 60 * 60 * 1000

/** Vrai si le contact a été créé il y a moins de 24 h. Calcul à l'affichage : rien n'est stocké. */
export function isNewContact(createdAt: { toMillis(): number } | null | undefined, now: Date): boolean {
  if (!createdAt) return false
  return now.getTime() - createdAt.toMillis() < NEW_CONTACT_WINDOW_MS
}
