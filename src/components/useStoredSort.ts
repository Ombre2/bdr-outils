import { useState } from 'react'

export type SortDirection = 'asc' | 'desc' | null

/**
 * Tri d'une liste mémorisé dans le navigateur : il reste le même au retour sur la page.
 * Préférence d'affichage uniquement, aucune donnée métier n'est stockée.
 */
export function useStoredSort(key: string, fallback: SortDirection): [SortDirection, (v: SortDirection) => void] {
  const storageKey = `tri:${key}`
  const [value, setValue] = useState<SortDirection>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved === 'asc' || saved === 'desc') return saved
      if (saved === 'none') return null
    } catch {
      // Stockage indisponible (navigation privée…) : tri par défaut
    }
    return fallback
  })

  function save(next: SortDirection) {
    setValue(next)
    try {
      localStorage.setItem(storageKey, next ?? 'none')
    } catch {
      // Sans stockage, le tri reste valable jusqu'à la sortie de la page
    }
  }

  return [value, save]
}
