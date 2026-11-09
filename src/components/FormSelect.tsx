import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Radix n'accepte pas de valeur vide pour un élément : on utilise un jeton interne pour « aucun choix ».
const EMPTY_TOKEN = '__empty__'

export interface FormSelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  onValueChange: (value: string) => void
  options: FormSelectOption[]
  emptyLabel?: string // libellé de l'option « vide » (ex. « — » ou « Tous les pays »). Absent = pas d'option vide.
  placeholder?: string
  ariaLabel?: string
  id?: string
  className?: string
  disabled?: boolean
}

/**
 * Liste déroulante de l'application. Son apparence ne dépend pas du thème du système
 * (contrairement à un <select> natif), et elle se contrôle au clavier.
 */
export function FormSelect({
  value,
  onValueChange,
  options,
  emptyLabel,
  placeholder,
  ariaLabel,
  id,
  className,
  disabled,
}: Props) {
  const hasEmpty = emptyLabel !== undefined
  const radixValue = value === '' && hasEmpty ? EMPTY_TOKEN : value
  const selectedLabel =
    value === '' ? (hasEmpty ? emptyLabel : placeholder ?? '') : (options.find((o) => o.value === value)?.label ?? value)

  return (
    <Select
      value={radixValue}
      onValueChange={(next) => onValueChange(next === EMPTY_TOKEN ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder ?? emptyLabel ?? '—'}>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {hasEmpty && <SelectItem value={EMPTY_TOKEN}>{emptyLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
