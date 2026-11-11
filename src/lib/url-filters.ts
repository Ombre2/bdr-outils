// Filtres de liste conservés dans l'URL : ils restent en place quand on ouvre une fiche puis qu'on revient.

export type FilterChanges = Record<string, string | string[] | null>

/** Applique des changements de filtres ; une valeur vide ou null retire le paramètre. */
export function applyFilterChanges(current: URLSearchParams, changes: FilterChanges): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(changes)) {
    next.delete(key)
    if (Array.isArray(value)) {
      for (const v of value) if (v) next.append(key, v)
    } else if (value) {
      next.set(key, value)
    }
  }
  return next
}

/** Adresse de retour transmise par la liste à la fiche (state.from), sinon l'adresse par défaut. */
export function backTarget(state: unknown, fallback: string): string {
  if (typeof state === 'object' && state !== null && 'from' in state) {
    const from = (state as { from: unknown }).from
    if (typeof from === 'string' && from.startsWith('/')) return from
  }
  return fallback
}
