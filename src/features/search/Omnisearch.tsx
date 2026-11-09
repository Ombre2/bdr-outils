import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Building2, UserRound } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { phoneDigits } from '@/lib/phone'
import { normalizeText } from '@/lib/text'

const MAX_RESULTS = 15

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Recherche instantanée sur comptes, contacts, emails et numéros (tous les numéros, sans espaces). */
export function Omnisearch({ open, onOpenChange }: Props) {
  const { accounts, contacts, phones, emails, accountById } = useDirectory()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = normalizeText(query)
    const digits = phoneDigits(query)
    const matchesPhone = digits.length >= 3

    const contactHits = contacts.filter((c) => {
      if (!q && !matchesPhone) return false
      const haystack = normalizeText(
        [c.firstName, c.lastName, c.title ?? '', c.email ?? '', c.accountName ?? ''].join(' '),
      )
      if (q && haystack.includes(q)) return true
      if (q && emails.some((e) => e.contactId === c.id && e.address.includes(q))) return true
      if (matchesPhone) {
        return phones.some((p) => p.contactId === c.id && phoneDigits(p.number).includes(digits))
      }
      return false
    })

    const accountHits = q ? accounts.filter((a) => a.searchName.includes(q)) : []

    return {
      contacts: contactHits.slice(0, MAX_RESULTS),
      accounts: accountHits.slice(0, 5),
    }
  }, [query, contacts, accounts, phones, emails])

  function go(path: string) {
    onOpenChange(false)
    setQuery('')
    navigate(path)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value)
        if (!value) setQuery('')
      }}
    >
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Recherche</DialogTitle>
        <DialogDescription className="sr-only">Nom, entreprise, email ou numéro de téléphone</DialogDescription>
        {/* shouldFilter=false : le filtrage est fait ci-dessus (numéros, accents, email) */}
        <Command shouldFilter={false} className="rounded-none">
      <CommandInput
        placeholder="Nom, entreprise, email ou numéro…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{query ? 'Aucun résultat.' : 'Tapez un nom, une entreprise ou un numéro.'}</CommandEmpty>

        {results.contacts.length > 0 && (
          <CommandGroup heading="Contacts">
            {results.contacts.map((c) => (
              <CommandItem key={c.id} value={`contact-${c.id}`} onSelect={() => go(`/contacts/${c.id}`)}>
                <UserRound className="size-4 text-muted-foreground" />
                <span className="font-medium">
                  {c.firstName} {c.lastName}
                </span>
                <span className="truncate text-muted-foreground">
                  {c.accountName ?? accountById(c.accountId)?.name ?? ''}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.accounts.length > 0 && (
          <CommandGroup heading="Comptes">
            {results.accounts.map((a) => (
              <CommandItem key={a.id} value={`account-${a.id}`} onSelect={() => go(`/accounts/${a.id}`)}>
                <Building2 className="size-4 text-muted-foreground" />
                <span className="font-medium">{a.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
