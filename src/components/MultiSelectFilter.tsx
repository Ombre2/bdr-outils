import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface MultiFilterOption {
  value: string
  label: string
}

interface Props {
  label: string // libellé du filtre, ex. « Pays »
  options: MultiFilterOption[]
  selected: string[]
  onChange: (selected: string[]) => void
  className?: string
}

/**
 * Filtre à choix multiples : on coche plusieurs valeurs.
 * Aucune valeur cochée = tout afficher.
 */
export function MultiSelectFilter({ label, options, selected, onChange, className }: Props) {
  const toggle = (value: string, checked: boolean) => {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value))
  }

  const summary =
    selected.length === 0
      ? `Tous`
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} sélectionnés`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={`h-9 justify-between gap-2 font-normal ${className ?? ''}`} aria-label={`Filtrer par ${label.toLowerCase()}`}>
          <span className="truncate">
            {label} : <span className="text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown className="size-4 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">Aucune valeur</p>}
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={(checked) => toggle(o.value, checked === true)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <button type="button" className="w-full px-2 py-1.5 text-left text-sm text-muted-foreground hover:text-foreground" onClick={() => onChange([])}>
              Tout effacer
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
