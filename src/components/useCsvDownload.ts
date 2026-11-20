import { useState } from 'react'
import { saveAs } from 'file-saver'
import { toast } from 'sonner'
import { utf16le } from '@/lib/csv-export'

/** Horodatage du nom de fichier : « AAAA-MM-JJ-HHhMM », en heure locale. */
function fileStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}h${pad(date.getMinutes())}`
}

/**
 * Téléchargement d'un CSV avec état « en cours » et messages en français.
 * `build` renvoie le contenu et le nom de base du fichier (sans date ni extension).
 */
export function useCsvDownload() {
  const [busy, setBusy] = useState(false)

  async function download(build: () => Promise<{ csv: string; name: string }> | { csv: string; name: string }) {
    setBusy(true)
    try {
      const { csv, name } = await build()
      saveAs(new Blob([utf16le(csv)], { type: 'text/csv;charset=utf-16le' }), `${name}-${fileStamp(new Date())}.csv`)
      toast.success('Export téléchargé.')
    } catch {
      toast.error('Export impossible. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return { busy, download }
}
