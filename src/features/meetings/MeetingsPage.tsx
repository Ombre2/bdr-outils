import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
import { RdvDialog } from '@/features/calls/RdvDialog'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { formatDateTime } from '@/lib/time'
import { listMeetingsForOwner } from '@/services/calls.repo'
import type { Call } from '@/types/models'

/** Rendez-vous pris par le BDR : à venir (par défaut) ou passés. Toutes les infos sont dans la ligne. */
export function MeetingsPage() {
  const { user } = useAuth()
  const { contacts, accountById, loading } = useDirectory()
  const [meetings, setMeetings] = useState<Call[] | null>(null)
  const [error, setError] = useState(false)
  const [showPast, setShowPast] = useState(false)
  const [reloadKey, setReloadKey] = useState(0) // rechargé après l'enregistrement d'un compte rendu
  const [openRdv, setOpenRdv] = useState<Call | null>(null) // RDV dont le détail est ouvert
  const [now] = useState(() => Date.now()) // heure d'ouverture : sépare RDV à venir et passés

  useEffect(() => {
    if (!user) return
    let cancelled = false
    listMeetingsForOwner(user.uid)
      .then((list) => !cancelled && setMeetings(list))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [user, reloadKey])

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])

  function contactNameOf(call: Call): string {
    const contact = contactById.get(call.contactId)
    return contact ? `${contact.firstName} ${contact.lastName}` : 'Contact'
  }

  const { upcoming, past } = useMemo(() => {
    const sorted = [...(meetings ?? [])].sort((a, b) => a.meetingAt!.toMillis() - b.meetingAt!.toMillis())
    return {
      upcoming: sorted.filter((m) => m.meetingAt!.toMillis() >= now),
      past: sorted.filter((m) => m.meetingAt!.toMillis() < now).reverse(), // les plus récents d'abord
    }
  }, [meetings, now])

  const visible = showPast ? past : upcoming

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Rendez-vous</h1>
          <p className="text-sm text-muted-foreground">
            {meetings === null ? '—' : `${upcoming.length} à venir · ${past.length} passé${past.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowPast((v) => !v)}>
          {showPast ? 'Voir les RDV à venir' : `Voir les RDV passés (${past.length})`}
        </Button>
      </header>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-44">Date du RDV</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="hidden md:table-cell">Compte</TableHead>
              <TableHead className="hidden lg:table-cell">Statut</TableHead>
              <TableHead className="hidden lg:table-cell">Appel du</TableHead>
              <TableHead className="hidden md:table-cell">Notes</TableHead>
              <TableHead>Compte rendu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((m) => {
              const contact = contactById.get(m.contactId)
              const done = m.meetingAt!.toMillis() < now
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium tabular-nums">
                    <button
                      type="button"
                      className="cursor-pointer text-left hover:underline"
                      onClick={() => setOpenRdv(m)}
                    >
                      {formatDateTime(m.meetingAt!.toDate())}
                    </button>
                  </TableCell>
                  <TableCell>
                    {contact ? (
                      <>
                        <Link to={`/contacts/${contact.id}`} className="font-medium hover:underline">
                          {contact.firstName} {contact.lastName}
                        </Link>
                        {contact.title && <p className="text-xs text-muted-foreground">{contact.title}</p>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Contact introuvable</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {accountById(m.accountId)?.name ?? contact?.accountName ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {contact && (
                      <Badge variant="outline" className="font-normal">
                        {contact.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">{formatDateTime(m.calledAt.toDate())}</TableCell>
                  <TableCell className="hidden max-w-xs md:table-cell">
                    <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{m.notes ?? ''}</p>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setOpenRdv(m)}
                    >
                      {m.compteRendu ? 'Voir le CR' : done ? 'Faire le CR' : 'Préparer le CR'}
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {error
                    ? 'Rendez-vous indisponibles pour le moment.'
                    : meetings === null || loading
                      ? 'Chargement…'
                      : showPast
                        ? 'Aucun rendez-vous passé.'
                        : 'Aucun rendez-vous à venir. Pour en ajouter un, loggez un appel avec le résultat « RDV pris ».'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {openRdv && (
        <RdvDialog
          open
          onOpenChange={(open) => !open && setOpenRdv(null)}
          call={openRdv}
          contactName={contactNameOf(openRdv)}
          done={openRdv.meetingAt!.toMillis() < now}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      )}
    </section>
  )
}
