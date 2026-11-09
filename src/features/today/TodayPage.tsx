import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { PhoneCall } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { LogCallDialog } from '@/features/calls/LogCallDialog'
import { formatPhone, telHref } from '@/lib/phone'
import { endOfToday, startOfToday } from '@/lib/reminder'
import { nextCadenceStep } from '@/lib/cadence'
import { localTimeLabel } from '@/lib/time'
import { listCallsSince } from '@/services/calls.repo'
import { completeCadenceStep } from '@/services/contacts.repo'
import { toast } from 'sonner'
import type { Contact } from '@/types/models'

export function TodayPage() {
  const { user } = useAuth()
  const { contacts, phonesOf, accountById, cadenceById, refresh, loading } = useDirectory()
  const [logFor, setLogFor] = useState<Contact | null>(null)
  const [callsToday, setCallsToday] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [stepBusy, setStepBusy] = useState<string | null>(null)

  // Étapes de cadence à faire aujourd'hui ou en retard, triées par date
  const cadenceDue = useMemo(() => {
    const endMs = endOfToday().getTime()
    return contacts
      .map((c) => ({ contact: c, next: nextCadenceStep(cadenceById(c.cadenceId), c) }))
      .filter((x): x is { contact: Contact; next: NonNullable<typeof x.next> } => !!x.next && x.next.dueAt.getTime() <= endMs)
      .sort((a, b) => a.next.dueAt.getTime() - b.next.dueAt.getTime())
  }, [contacts, cadenceById])

  async function doneCadenceStep(contact: Contact, totalSteps: number) {
    setStepBusy(contact.id)
    try {
      await completeCadenceStep(contact, totalSteps)
      await refresh()
    } catch {
      toast.error('Impossible de valider l’étape. Réessayez.')
    } finally {
      setStepBusy(null)
    }
  }

  // Rappels : aujourd'hui ou en retard, triés par heure
  const { reminders, overdueCount } = useMemo(() => {
    const endMs = endOfToday().getTime()
    const startMs = startOfToday().getTime()
    const list = contacts
      .filter((c) => c.nextReminderAt && c.nextReminderAt.toMillis() <= endMs)
      .sort((a, b) => a.nextReminderAt!.toMillis() - b.nextReminderAt!.toMillis())
    return {
      reminders: list,
      overdueCount: list.filter((c) => c.nextReminderAt!.toMillis() < startMs).length,
    }
  }, [contacts])

  // Compteur d'appels du jour (chargé à l'ouverture et après chaque log)
  useEffect(() => {
    if (!user) return
    let cancelled = false
    listCallsSince(user.uid, startOfToday())
      .then((calls) => !cancelled && setCallsToday(calls.length))
      .catch(() => !cancelled && setCallsToday(null))
    return () => {
      cancelled = true
    }
  }, [user, reloadKey])

  function onLogged() {
    setReloadKey((k) => k + 1)
    void refresh()
  }

  // Navigation clavier : ↑ ↓ entre les lignes, Entrée pour logger
  function onRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, contact: Contact) {
    if (e.key === 'Enter') {
      e.preventDefault()
      setLogFor(contact)
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('[data-reminder-row]'))
      const index = rows.indexOf(e.currentTarget)
      const next = rows[index + (e.key === 'ArrowDown' ? 1 : -1)]
      next?.focus()
    }
  }

  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Ma Journée</h1>
          <p className="text-sm capitalize text-muted-foreground">{dateLabel}</p>
        </div>
        <div className="flex gap-6 text-sm">
          <Stat label="À rappeler" value={reminders.length} />
          <Stat label="En retard" value={overdueCount} warn={overdueCount > 0} />
          <Stat label="Appels aujourd'hui" value={callsToday ?? '—'} />
        </div>
      </header>

      {cadenceDue.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Étapes de cadence à faire ({cadenceDue.length})</h2>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-28">Échéance</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Étape</TableHead>
                  <TableHead className="w-40 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cadenceDue.map(({ contact, next }) => {
                  const cadence = cadenceById(contact.cadenceId)!
                  const overdue = next.dueAt.getTime() < startOfToday().getTime()
                  return (
                    <TableRow key={contact.id}>
                      <TableCell className="tabular-nums">
                        <span className={overdue ? 'text-destructive' : undefined}>
                          {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(next.dueAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link to={`/contacts/${contact.id}`} className="font-medium hover:underline">
                          {contact.firstName} {contact.lastName}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {cadence.name} · étape {next.index + 1}/{cadence.steps.length}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="mr-2 font-normal">
                          {next.step.channel}
                        </Badge>
                        {next.step.label}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => void doneCadenceStep(contact, cadence.steps.length)}
                          disabled={stepBusy === contact.id}
                        >
                          Étape faite
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Rappels</h2>
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-28">Rappel</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Compte</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Téléphones</TableHead>
              <TableHead className="w-28 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reminders.map((c) => {
              const overdue = c.nextReminderAt!.toMillis() < startOfToday().getTime()
              const phones = phonesOf(c.id)
              return (
                <TableRow
                  key={c.id}
                  data-reminder-row
                  tabIndex={0}
                  onKeyDown={(e) => onRowKeyDown(e, c)}
                  className="focus-visible:bg-accent focus-visible:outline-none"
                >
                  <TableCell className="tabular-nums">
                    <span className={overdue ? 'text-destructive' : undefined}>
                      {reminderLabel(c.nextReminderAt!.toDate(), c.timezone, overdue)}
                    </span>
                    {overdue && <Badge variant="outline" className="ml-2 border-destructive/40 font-normal text-destructive">Retard</Badge>}
                  </TableCell>
                  <TableCell>
                    <Link to={`/contacts/${c.id}`} className="font-medium hover:underline">
                      {c.firstName} {c.lastName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {c.title ?? ''}
                      {c.timezone ? ` · ${localTimeLabel(c.timezone)}` : ''}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {accountById(c.accountId)?.name ?? c.accountName ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {phones.map((p) => {
                        const href = telHref(p.number)
                        return href ? (
                          <a
                            key={p.id}
                            href={href}
                            title={`Appeler ${p.label.toLowerCase()}`}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs tabular-nums hover:bg-accent"
                          >
                            <PhoneCall className="size-3" aria-hidden />
                            {formatPhone(p.number)}
                          </a>
                        ) : null
                      })}
                      {phones.length === 0 && <span className="text-xs text-muted-foreground">Aucun numéro</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => setLogFor(c)}>
                      Logger
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {!loading && reminders.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucun rappel pour aujourd'hui. Bonne prospection.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Raccourcis : ↑ ↓ pour naviguer, Entrée pour logger, touches 1 à 6 pour le résultat, Ctrl+Entrée pour enregistrer.
      </p>

      {logFor && (
        <LogCallDialog
          open={!!logFor}
          onOpenChange={(open) => !open && setLogFor(null)}
          contact={logFor}
          phones={phonesOf(logFor.id)}
          onLogged={onLogged}
        />
      )}
    </section>
  )
}

/** Heure du rappel dans le fuseau du contact ; date ajoutée pour les retards. */
function reminderLabel(date: Date, timezone: string | null, withDay: boolean): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: timezone ?? undefined,
    day: withDay ? '2-digit' : undefined,
    month: withDay ? '2-digit' : undefined,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div className="text-right">
      <p className={`text-lg font-semibold tabular-nums ${warn ? 'text-destructive' : ''}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
