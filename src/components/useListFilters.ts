import { useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { applyFilterChanges, type FilterChanges } from '@/lib/url-filters'

/**
 * Lit et écrit les filtres d'une liste dans l'URL.
 * replace: true : chaque changement remplace l'entrée courante, donc le retour arrière
 * ramène toujours à la liste avec les derniers filtres choisis.
 */
export function useListFilters() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()

  const update = useCallback(
    (changes: FilterChanges) => setParams((prev) => applyFilterChanges(prev, changes), { replace: true }),
    [setParams],
  )

  return {
    text: (key: string) => params.get(key) ?? '',
    list: (key: string) => params.getAll(key),
    flag: (key: string) => params.get(key) === '1',
    update,
    // Adresse complète de la liste, transmise à la fiche pour que le retour la retrouve
    href: `${location.pathname}${location.search}`,
  }
}
