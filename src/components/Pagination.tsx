import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/FormSelect'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export const PAGE_SIZES = [25, 50, 100] as const

export interface PageSlice<T> {
  items: T[]
  page: number // page effective (bornée)
  pageCount: number
  total: number
  from: number // premier élément affiché (base 1), 0 si vide
  to: number // dernier élément affiché
}

/** Découpe une liste déjà chargée. La page demandée est bornée à la plage disponible. */
export function paginate<T>(items: T[], requestedPage: number, pageSize: number): PageSlice<T> {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const start = (page - 1) * pageSize
  const slice = items.slice(start, start + pageSize)
  return {
    items: slice,
    page,
    pageCount,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + slice.length,
  }
}

interface Props {
  page: number
  pageCount: number
  from: number
  to: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function Pagination({ page, pageCount, from, to, total, pageSize, onPageChange, onPageSizeChange }: Props) {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <p className="tabular-nums text-muted-foreground">
        {total === 0 ? 'Aucun résultat' : `${from}–${to} sur ${total}`}
      </p>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-muted-foreground">
          Par page
          <FormSelect
            className="h-8 w-20"
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
            options={PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
            ariaLabel="Nombre de lignes par page"
          />
        </label>

        <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Page précédente">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="min-w-24 text-center tabular-nums">
          Page {page} / {pageCount}
        </span>
        <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label="Page suivante">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  )
}
