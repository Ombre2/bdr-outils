import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EditCallDialog } from '@/features/calls/EditCallDialog'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { formatDateTime } from '@/lib/time'
import { formatPhone } from '@/lib/phone'
import { listCallsForAccount, listCallsForContact } from '@/services/calls.repo'
import type { Call, CallOutcome } from '@/types/models'

interface Props {
  ownerId: string
  contactId?: string
  accountId?: string
  reloadKey: number // incrémenté après un nouvel appel
  showContact?: boolean // affiche le nom du contact (fiche compte)
}

const OUTCOME_VARIANT: Partial<Record<CallOutcome, 'default' | 'secondary' | 'outline'>> = {
  'RDV pris': 'default',
  Argumenté: 'secondary',
}

/** Historique des appels, style timeline, du plus récent au plus ancien. */
export function CallTimeline({ ownerId, contactId, accountId, reloadKey, showContact }: Props) {
  const { contacts, phonesOf, teamView } = useDirectory()
  const [calls, setCalls] = useState<Call[] | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState<Call | null>(null)
  const [localKey, setLocalKey] = useState(0) // rechargé après une correction

  useEffect(() => {
    let cancelled = false
    setError(false)
    const load = contactId
      ? listCallsForContact(ownerId, contactId)
      : accountId
        ? listCallsForAccount(ownerId, accountId)
        : Promise.resolve([] as Call[])
    load
      .then((list) => !cancelled && setCalls(list))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [ownerId, contactId, accountId, reloadKey, localKey])

  if (error) return <p className="text-sm text-muted-foreground">Historique indisponible pour le moment.</p>
  if (calls === null) return <p className="text-sm text-muted-foreground">Chargement de l'historique…</p>
  if (calls.length === 0) return <p className="text-sm text-muted-foreground">Aucun appel enregistré.</p>

  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {calls.map((call) => {
        const contact = showContact ? contacts.find((c) => c.id === call.contactId) : undefined
        return (
          <li key={call.id} className="relative text-sm">
            <span className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-muted-foreground" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <time className="tabular-nums text-muted-foreground" dateTime={call.calledAt.toDate().toISOString()}>
                {formatDateTime(call.calledAt.toDate())}
              </time>
              <Badge variant={OUTCOME_VARIANT[call.outcome] ?? 'outline'} className="font-normal">
                {call.outcome}
              </Badge>
              {call.calledPhone && <span className="tabular-nums text-muted-foreground">{formatPhone(call.calledPhone)}</span>}
              {contact && (
                <span className="text-muted-foreground">
                  · {contact.firstName} {contact.lastName}
                </span>
              )}
              {!teamView && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEditing(call)}>
                  <Pencil className="size-3" aria-hidden /> Corriger
                </Button>
              )}
              {call.editedAt && <span className="text-xs text-muted-foreground">(corrigé)</span>}
            </div>
            {call.notes && <p className="mt-1 whitespace-pre-line">{call.notes}</p>}
            {call.meetingAt && (
              <p className="mt-1 text-xs font-medium">
                RDV : {formatDateTime(call.meetingAt.toDate())}
              </p>
            )}
            {call.nextReminderAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                Rappel prévu : {formatDateTime(call.nextReminderAt.toDate())}
              </p>
            )}
          </li>
        )
      })}
      {editing && (
        <EditCallDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          call={editing}
          phones={phonesOf(editing.contactId)}
          onSaved={() => setLocalKey((k) => k + 1)}
        />
      )}
    </ol>
  )
}
