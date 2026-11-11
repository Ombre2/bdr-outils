import { useEffect, useRef } from 'react'
import { Bold, Italic, List, ListOrdered, Underline } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sanitizeRichText } from '@/lib/rich-text'

// Mise en forme des listes dans le texte riche
const RICH_TEXT_STYLE = '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5'

const TOOLS = [
  { command: 'bold', label: 'Gras', icon: Bold },
  { command: 'italic', label: 'Italique', icon: Italic },
  { command: 'underline', label: 'Souligné', icon: Underline },
  { command: 'insertUnorderedList', label: 'Liste à puces', icon: List },
  { command: 'insertOrderedList', label: 'Liste numérotée', icon: ListOrdered },
] as const

interface EditorProps {
  id?: string
  value: string // texte riche (HTML nettoyé)
  onChange: (html: string) => void
  placeholder?: string
}

/** Éditeur de texte riche : gras, italique, souligné et listes. Le contenu est nettoyé à chaque saisie. */
export function RichTextEditor({ id, value, onChange, placeholder }: EditorProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Contenu initial seulement : ensuite, l'éditeur garde sa propre saisie (le curseur ne saute pas)
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeRichText(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function emit() {
    if (ref.current) onChange(sanitizeRichText(ref.current.innerHTML))
  }

  function format(command: string) {
    ref.current?.focus()
    document.execCommand(command)
    emit()
  }

  return (
    <div className="rounded-md border border-input">
      <div className="flex gap-1 border-b p-1" role="toolbar" aria-label="Mise en forme">
        {TOOLS.map(({ command, label, icon: Icon }) => (
          <Button
            key={command}
            type="button"
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            title={label}
            aria-label={label}
            // Garde la sélection du texte quand on clique sur le bouton
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format(command)}
          >
            <Icon className="size-3.5" aria-hidden />
          </Button>
        ))}
      </div>
      <div
        id={id}
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        onInput={emit}
        className={`${RICH_TEXT_STYLE} min-h-32 px-3 py-2 text-sm focus:outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]`}
      />
    </div>
  )
}

/** Affichage d'un texte riche, nettoyé avant affichage. */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`${RICH_TEXT_STYLE} ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
    />
  )
}
