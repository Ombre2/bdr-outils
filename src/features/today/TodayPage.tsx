import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Building2, ClipboardPlus, Clock, PhoneCall } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pagination, paginate, type PageSlice } from '@/components/Pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { LogCallDialog } from '@/features/calls/LogCallDialog'
import { DailyGoal } from '@/features/today/DailyGoal'
import { callHref, formatPhone } from '@/lib/phone'
import { endOfToday, endOfTomorrow, planCallSlots, startOfToday } from '@/lib/reminder'
import { nextCadenceStep } from '@/lib/cadence'
import { localTimeLabel } from '@/lib/time'
import { listCallsSince } from '@/services/calls.repo'
import { LastCallCell, useLastCalls } from '@/features/calls/useLastCalls'
import { completeCadenceStep, setContactReminders } from '@/services/contacts.repo'
import { Checkbox } from '@/components/ui/checkbox'
import { useStoredSort } from '@/components/useStoredSort'
import { toast } from 'sonner'
import { safeLinkedinUrl } from '@/lib/text'
import type { Contact } from '@/types/models'

export function TodayPage() {
  const { user } = useAuth()
  const { contacts, phonesOf, accountById, cadenceById, refresh, loading, teamView } = useDirectory()
  const [logFor, setLogFor] = useState<Contact | null>(null)
  const [callsToday, setCallsToday] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const lastCalls = useLastCalls(reloadKey) // dernier appel de chaque contact, rechargé après chaque log
  const [stepBusy, setStepBusy] = useState<string | null>(null)
  // Sélection pour retirer des contacts de la liste du jour (rappels d'aujourd'hui et de demain)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [removing, setRemoving] = useState(false)
  // Pagination de chaque tableau, à l'intérieur de la page (la page elle-même ne défile pas)
  const [pageSize, setPageSize] = useState<number>(25)
  const [cadencePage, setCadencePage] = useState(1)
  const [listPage, setListPage] = useState(1)
  // Liste affichée : aujourd'hui ou demain (une seule à la fois)
  const [day, setDay] = useState<'today' | 'tomorrow'>('today')
  // Tri par compte : null = tri par heure de rappel (par défaut)
  const [accountSort, setAccountSort] = useStoredSort('journee-compte', null)

  function toggleSelected(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  async function removeFromList() {
    const byId = new Map(contacts.map((c) => [c.id, c] as const))
    const chosen = selectedIds.map((id) => byId.get(id)).filter((c): c is Contact => !!c)
    if (chosen.length === 0) return
    setRemoving(true)
    try {
      await setContactReminders(chosen.map((contact) => ({ contact, at: null })))
      toast.success(`${chosen.length} contact(s) retiré(s) de la liste. Ils restent dans Contacts.`)
      setSelectedIds([])
      await refresh()
    } catch {
      toast.error('Impossible de retirer les contacts. Réessayez.')
    } finally {
      setRemoving(false)
    }
  }

  // Replanifie la sélection pour demain à partir de 9h, en gardant l'ordre de la liste affichée
  async function rescheduleToTomorrow() {
    const chosen = activeList.filter((c) => selectedIds.includes(c.id))
    if (chosen.length === 0) return
    setRemoving(true)
    try {
      const slots = planCallSlots(chosen.length, 'tomorrow')
      await setContactReminders(chosen.map((contact, i) => ({ contact, at: slots[i] })))
      toast.success(`${chosen.length} appel(s) replanifié(s) pour demain.`)
      setSelectedIds([])
      await refresh()
    } catch {
      toast.error('Impossible de replanifier les appels. Réessayez.')
    } finally {
      setRemoving(false)
    }
  }

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

  // Rappels planifiés pour demain, triés par heure
  const tomorrowReminders = useMemo(() => {
    const startMs = endOfToday().getTime()
    const endMs = endOfTomorrow().getTime()
    return contacts
      .filter((c) => c.nextReminderAt && c.nextReminderAt.toMillis() > startMs && c.nextReminderAt.toMillis() <= endMs)
      .sort((a, b) => a.nextReminderAt!.toMillis() - b.nextReminderAt!.toMillis())
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
    // Touche tapée sur la case à cocher : ce n'est pas une action sur la ligne
    if (e.target !== e.currentTarget) return
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

  // Badge « in » vers le profil LinkedIn, même rendu que dans la liste des contacts
  function linkedinBadge(contact: Contact) {
    const url = safeLinkedinUrl(contact.linkedinUrl)
    if (!url) return null
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Ouvrir le profil LinkedIn"
        aria-label={`Profil LinkedIn de ${contact.firstName} ${contact.lastName}`}
        className="ml-1.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm bg-[#0A66C2] align-middle text-[10px] font-bold leading-none text-white hover:opacity-80"
      >
        in
      </a>
    )
  }

  const dateLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  const cadencePg = paginate(cadenceDue, cadencePage, pageSize)
  const dayList = day === 'today' ? reminders : tomorrowReminders
  // Les contacts d'un même compte se suivent, par heure de rappel. Sans compte : en bas de liste.
  const activeList = useMemo(() => {
    if (!accountSort) return dayList
    const dir = accountSort === 'asc' ? 1 : -1
    return [...dayList].sort((a, b) => {
      const accountA = accountById(a.accountId)?.name ?? a.accountName ?? ''
      const accountB = accountById(b.accountId)?.name ?? b.accountName ?? ''
      if (!accountA !== !accountB) return accountA ? -1 : 1
      return accountA.localeCompare(accountB, 'fr') * dir || a.nextReminderAt!.toMillis() - b.nextReminderAt!.toMillis()
    })
  }, [dayList, accountSort, accountById])
  const activePg = paginate(activeList, listPage, pageSize)

  function switchDay(next: 'today' | 'tomorrow') {
    setDay(next)
    setListPage(1)
    setSelectedIds([])
  }

  function pager(pg: Pick<PageSlice<unknown>, 'page' | 'pageCount' | 'from' | 'to' | 'total'>, setPage: (p: number) => void) {
    return (
      <Pagination
        page={pg.page}
        pageCount={pg.pageCount}
        from={pg.from}
        to={pg.to}
        total={pg.total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size)
          setCadencePage(1)
          setListPage(1)
        }}
      />
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Ma Journée</h1>
          <p className="text-sm capitalize text-muted-foreground">{dateLabel}</p>
        </div>
        <div className="flex gap-6 text-sm">
          <Stat label="À rappeler" value={reminders.length} />
          <Stat label="En retard" value={overdueCount} warn={overdueCount > 0} />
          <Stat label="Demain" value={tomorrowReminders.length} />
          {user && <DailyGoal uid={user.uid} callsToday={callsToday} readOnly={teamView} />}
        </div>
      </header>

      {!teamView && selectedIds.length > 0 && (
        <div className="shrink-0 flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-accent/40 px-3 py-2 text-sm">
          <span className="font-medium">{selectedIds.length} sélectionné(s)</span>
          <span className="text-xs text-muted-foreground">Ils restent dans Contacts, seul leur rappel est retiré.</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {day === 'today' && (
              <Button size="sm" onClick={() => void rescheduleToTomorrow()} disabled={removing}>
                {removing ? 'Enregistrement…' : 'Replanifier pour demain'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void removeFromList()} disabled={removing}>
              {removing ? 'Retrait…' : 'Retirer de la liste'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])} disabled={removing}>
              Vider
            </Button>
          </div>
        </div>
      )}

      {cadenceDue.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <h2 className="shrink-0 text-sm font-medium">Étapes de cadence à faire ({cadenceDue.length})</h2>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
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
                {cadencePg.items.map(({ contact, next }) => {
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
                        <Link to={`/contacts/${contact.id}`} state={{ from: '/today' }} className="font-medium hover:underline">
                          {contact.firstName} {contact.lastName}
                        </Link>
                        {linkedinBadge(contact)}
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
                          disabled={stepBusy === contact.id || teamView}
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
          {pager(cadencePg, setCadencePage)}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-medium">Rappels</h2>
          <Button size="sm" variant={day === 'today' ? 'default' : 'outline'} aria-pressed={day === 'today'} onClick={() => switchDay('today')}>
            Aujourd’hui ({reminders.length})
          </Button>
          <Button size="sm" variant={day === 'tomorrow' ? 'default' : 'outline'} aria-pressed={day === 'tomorrow'} onClick={() => switchDay('tomorrow')}>
            Demain ({tomorrowReminders.length})
          </Button>
          <Button
            size="sm"
            variant={accountSort ? 'secondary' : 'ghost'}
            className="ml-auto"
            onClick={() => {
              setAccountSort(accountSort === null ? 'asc' : accountSort === 'asc' ? 'desc' : null)
              setListPage(1)
            }}
            title={accountSort === 'desc' ? 'Revenir au tri par heure' : 'Trier par compte'}
          >
            Trier par compte {accountSort === 'asc' ? '↑' : accountSort === 'desc' ? '↓' : '↕'}
          </Button>
        </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {!teamView && <TableHead className="w-10" />}
              <TableHead className="w-28">Rappel</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Téléphones</TableHead>
              <TableHead>Dernier appel</TableHead>
              <TableHead className="sticky right-0 w-px border-l border-border bg-background text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activePg.items.map((c) => {
              const overdue = c.nextReminderAt!.toMillis() < startOfToday().getTime()
              const phones = phonesOf(c.id)
              return (
                <TableRow
                  key={c.id}
                  data-reminder-row
                  tabIndex={0}
                  onKeyDown={(e) => onRowKeyDown(e, c)}
                  className="group focus-visible:bg-accent focus-visible:outline-none"
                >
                  {!teamView && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(c.id)}
                        onCheckedChange={() => toggleSelected(c.id)}
                        aria-label={`Sélectionner ${c.firstName} ${c.lastName}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="tabular-nums">
                    <span className={overdue ? 'text-destructive' : undefined}>
                      {reminderLabel(c.nextReminderAt!.toDate(), c.timezone, overdue || day === 'tomorrow')}
                    </span>
                    {overdue && <Badge variant="outline" className="ml-2 border-destructive/40 font-normal text-destructive">Retard</Badge>}
                    {/* Heure actuelle chez le contact, juste sous l'heure prévue : aide à choisir le bon moment */}
                    {c.timezone && (
                      <p className="text-xs text-muted-foreground" title="Heure actuelle chez le contact">
                        <Clock className="mr-1 inline size-3 align-[-2px]" aria-hidden />
                        {localTimeLabel(c.timezone)}
                      </p>
                    )}
                  </TableCell>
                  {/* Deux lignes maximum pour garder des lignes basses : nom + statut, puis compte · poste */}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Link to={`/contacts/${c.id}`} state={{ from: '/today' }} className="font-medium hover:underline">
                        {c.firstName} {c.lastName}
                      </Link>
                      {linkedinBadge(c)}
                      <Badge variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
                        {c.status}
                      </Badge>
                    </div>
                    {/* Compte mis en avant (icône + texte foncé), poste en gris */}
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const accountName = accountById(c.accountId)?.name ?? c.accountName
                        return (
                          <>
                            {accountName && (
                              <span className="font-medium text-foreground">
                                <Building2 className="mr-1 inline size-3 align-[-2px]" aria-hidden />
                                {accountName}
                              </span>
                            )}
                            {accountName && c.title && ' · '}
                            {c.title && <span className="italic">{c.title}</span>}
                          </>
                        )
                      })()}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      {phones.map((p) => {
                        const href = callHref(p.number)
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
                  <TableCell><LastCallCell call={lastCalls.get(c.id)} contact={c} /></TableCell>
                  {/* Colonne fixée à droite : « Logger » reste visible sur un petit écran */}
                  <TableCell className="sticky right-0 border-l border-border bg-background text-right group-hover:bg-muted group-focus-visible:bg-accent">
                    <Button
                      size="icon-sm"
                      onClick={() => setLogFor(c)}
                      disabled={teamView}
                      title="Logger un appel"
                      aria-label={`Logger un appel avec ${c.firstName} ${c.lastName}`}
                    >
                      <ClipboardPlus className="size-4" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {!loading && activeList.length === 0 && (
              <TableRow>
                <TableCell colSpan={teamView ? 5 : 6} className="py-10 text-center text-muted-foreground">
                  {day === 'today' ? 'Aucun rappel pour aujourd’hui. Bonne prospection.' : 'Aucun appel planifié pour demain.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {pager(activePg, setListPage)}
      </div>

      <p className="shrink-0 text-xs text-muted-foreground">
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
