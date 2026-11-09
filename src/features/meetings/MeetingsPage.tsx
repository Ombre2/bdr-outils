import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/features/auth/AuthProvider'
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

  useEffect(() => {
    if (!user) return
    let cancelled = false
    listMeetingsForOwner(user.uid)
      .then((list) => !cancelled && setMeetings(list))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [user])

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const sorted = [...(meetings ?? [])].sort((a, b) => a.meetingAt!.toMillis() - b.meetingAt!.toMillis())
    return {
      upcoming: sorted.filter((m) => m.meetingAt!.toMillis() >= now),
      past: sorted.filter((m) => m.meetingAt!.toMillis() < now).reverse(), // les plus récents d'abord
    }
  }, [meetings])

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
              <TableHead>Compte</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Appel du</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((m) => {
              const contact = contactById.get(m.contactId)
              return (
                <TableRow key={m.id}>
                  <TableCell className="font-medium tabular-nums">{formatDateTime(m.meetingAt!.toDate())}</TableCell>
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
                  <TableCell className="text-muted-foreground">
                    {accountById(m.accountId)?.name ?? contact?.accountName ?? '—'}
                  </TableCell>
                  <TableCell>
                    {contact && (
                      <Badge variant="outline" className="font-normal">
                        {contact.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatDateTime(m.calledAt.toDate())}</TableCell>
                  <TableCell className="max-w-xs">
                    <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">{m.notes ?? ''}</p>
                  </TableCell>
                </TableRow>
              )
            })}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
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
    </section>
  )
}
