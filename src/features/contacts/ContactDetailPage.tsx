import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Loader2, PhoneCall, Pencil, Plus, Trash2 } from 'lucide-react'
import { buildContactCopyText } from '@/lib/contact-copy'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { backTarget } from '@/lib/url-filters'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormSelect } from '@/components/FormSelect'
import { LocalTime } from '@/components/LocalTime'
import { useAuth } from '@/features/auth/AuthProvider'
import { CallTimeline } from '@/features/calls/CallTimeline'
import { LogCallDialog } from '@/features/calls/LogCallDialog'
import { ContactDialog } from '@/features/contacts/ContactDialog'
import { StatusReasonDialog } from '@/features/contacts/StatusReasonDialog'
import { ActivityDialog } from '@/features/contacts/ActivityDialog'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { nextCadenceStep } from '@/lib/cadence'
import { countryLabel } from '@/lib/geo'
import { isNewContact } from '@/lib/new-contact'
import { formatDateTime } from '@/lib/time'
import { callHref, formatPhone } from '@/lib/phone'
import { safeLinkedinUrl } from '@/lib/text'
import { CONTACT_STATUSES, PHONE_LABELS, STATUSES_REQUIRING_REASON, type ContactStatus, type StatusChange } from '@/types/models'
import { completeCadenceStep, deleteContact, setContactCadence, setContactStatus, setPrimaryPhone } from '@/services/contacts.repo'
import { listStatusChanges } from '@/services/status-history.repo'
import { deleteActivity, listActivities } from '@/services/activities.repo'
import type { Activity } from '@/types/models'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ContactDetailViewProps {
  id: string
  embedded?: boolean // affiché dans un onglet de la page compte : pas de lien de retour
  onDeleted?: () => void
}

/** Fiche d'un contact. Utilisée seule (page /contacts/:id) ou dans un onglet de la page compte. */
export function ContactDetailView({ id, embedded = false, onDeleted }: ContactDetailViewProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { contacts, accountById, phonesOf, emailsOf, refresh, loading, cadences, cadenceById, teamView, ownerEmail } = useDirectory()
  const [editing, setEditing] = useState(false)
  const [logging, setLogging] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingStatus, setPendingStatus] = useState<ContactStatus | null>(null)
  const [history, setHistory] = useState<StatusChange[]>([])
  const [updatingPhone, setUpdatingPhone] = useState<string | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [now] = useState(() => new Date())
  const [activityKey, setActivityKey] = useState(0)
  const [activityOpen, setActivityOpen] = useState(false)
  const [cadenceChoice, setCadenceChoice] = useState('')
  const [cadenceBusy, setCadenceBusy] = useState(false)

  const phoneItems = useRef(new Map<string, HTMLLIElement>())
  const previousTops = useRef(new Map<string, number>())

  const contact = contacts.find((c) => c.id === id)
  const contactOwner = contact?.ownerId

  // Animation : le numéro validé glisse en haut de la liste
  const phonesKey = phonesOf(contact?.id ?? '').map((p) => `${p.id}:${p.isPrimary}`).join('|')
  useLayoutEffect(() => {
    if (previousTops.current.size === 0) return
    phoneItems.current.forEach((el, key) => {
      const before = previousTops.current.get(key)
      if (before === undefined) return
      const delta = before - el.getBoundingClientRect().top
      if (delta !== 0) {
        el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
          duration: 350,
          easing: 'ease-out',
        })
      }
    })
    previousTops.current = new Map()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phonesKey])
  const contactId = contact?.id

  // Historique des statuts : rechargé à chaque changement de statut
  useEffect(() => {
    if (!contactOwner || !contactId) return
    let cancelled = false
    listStatusChanges(contactOwner, contactId)
      .then((items) => {
        if (!cancelled) setHistory(items)
      })
      .catch(() => {
        if (!cancelled) setHistory([])
      })
    return () => {
      cancelled = true
    }
  }, [contactOwner, contactId, reloadKey])

  // Autres actions (email, LinkedIn…) : rechargées après chaque ajout ou suppression
  useEffect(() => {
    if (!contactOwner || !contactId) return
    let cancelled = false
    listActivities(contactOwner, contactId)
      .then((items) => !cancelled && setActivities(items))
      .catch(() => !cancelled && setActivities([]))
    return () => {
      cancelled = true
    }
  }, [contactOwner, contactId, activityKey])

  if (!contact) {
    return (
      <p className="text-sm text-muted-foreground">
        {loading ? 'Chargement…' : 'Contact introuvable.'}{' '}
        <Link className="underline" to="/contacts">
          Retour aux contacts
        </Link>
      </p>
    )
  }

  const phones = phonesOf(contact.id)
  const emails = emailsOf(contact.id)
  const account = accountById(contact.accountId)

  async function applyStatus(status: ContactStatus, reason: string | null) {
    try {
      await setContactStatus(contact!, status, reason)
      setReloadKey((k) => k + 1)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error && error.message.startsWith('Indiquez') ? error.message : 'Mise à jour du statut impossible. Réessayez.')
    }
  }

  // Tout changement de statut passe par la saisie du motif (obligatoire pour certains statuts)
  function changeStatus(status: ContactStatus) {
    setPendingStatus(status)
  }

  async function copyContactInfo() {
    const text = buildContactCopyText(contact!, phones, emails, account?.name ?? null)
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Infos du contact copiées.')
    } catch {
      toast.error('Copie impossible. Sélectionnez le texte manuellement.')
    }
  }

  const cadence = cadenceById(contact.cadenceId)
  const nextStep = nextCadenceStep(cadence, contact)
  const stepsDone = contact.cadenceStep ?? 0

  async function startCadence() {
    if (!cadenceChoice) return
    setCadenceBusy(true)
    try {
      await setContactCadence(contact!, cadenceChoice)
      setCadenceChoice('')
      await refresh()
    } catch {
      toast.error('Impossible de démarrer la cadence. Réessayez.')
    } finally {
      setCadenceBusy(false)
    }
  }

  async function stopCadence() {
    setCadenceBusy(true)
    try {
      await setContactCadence(contact!, null)
      await refresh()
    } catch {
      toast.error('Impossible d’arrêter la cadence. Réessayez.')
    } finally {
      setCadenceBusy(false)
    }
  }

  async function doneStep() {
    if (!cadence) return
    setCadenceBusy(true)
    try {
      await completeCadenceStep(contact!, cadence.steps.length)
      await refresh()
    } catch {
      toast.error('Impossible de valider l’étape. Réessayez.')
    } finally {
      setCadenceBusy(false)
    }
  }

  async function removeActivity(activityId: string) {
    if (!window.confirm('Supprimer cette action ?')) return
    try {
      await deleteActivity(activityId)
      setActivityKey((k) => k + 1)
    } catch {
      toast.error('Suppression impossible. Réessayez.')
    }
  }

  async function choosePhone(phoneId: string) {
    if (updatingPhone) return
    // Position de chaque numéro avant le changement, pour l'animation de déplacement
    previousTops.current = new Map(
      Array.from(phoneItems.current.entries()).map(([key, el]) => [key, el.getBoundingClientRect().top]),
    )
    setUpdatingPhone(phoneId)
    try {
      await setPrimaryPhone(contact!.id, phones, phoneId)
      await refresh()
    } catch {
      previousTops.current = new Map()
      toast.error('Impossible de valider ce numéro. Réessayez.')
    } finally {
      setUpdatingPhone(null)
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Supprimer le contact ${contact!.firstName} ${contact!.lastName} et ses numéros ?`)) return
    try {
      await deleteContact(contact!.ownerId, contact!.id, phones, emails)
      await refresh()
      toast.success('Contact supprimé.')
      if (onDeleted) onDeleted()
      else navigate('/contacts')
    } catch {
      toast.error('Suppression impossible. Réessayez.')
    }
  }

  return (
    <section className="space-y-6">
      {!embedded && (
        <Link to={backTarget(location.state, '/contacts')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {backTarget(location.state, '/contacts') === '/today' ? 'Ma Journée' : 'Contacts'}
        </Link>
      )}

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">
              {contact.firstName} {contact.lastName}
            </h1>
            <Badge variant="outline" className="font-normal">
              {contact.status}
            </Badge>
            {isNewContact(contact.createdAt, now) && <Badge className="font-normal">Nouveau</Badge>}
          </div>
          {teamView && <p className="text-sm text-muted-foreground">Propriétaire : {ownerEmail(contact.ownerId) ?? '—'}</p>}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void copyContactInfo()}>
            <Copy className="size-4" aria-hidden /> Copier les infos
          </Button>
          <FormSelect
            className="w-44"
            value={contact.status}
            onValueChange={(v) => changeStatus(v as ContactStatus)}
            options={CONTACT_STATUSES.map((s) => ({ value: s, label: s }))}
            ariaLabel="Statut du contact"
            disabled={teamView}
          />
          {!teamView && (
            <>
              <Button size="sm" onClick={() => setLogging(true)}>
                <PhoneCall className="size-4" aria-hidden /> Logger un appel
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" aria-hidden /> Modifier
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleDelete()} aria-label="Supprimer le contact">
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
        <div className="space-y-4 rounded-md border border-border p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Prénom</dt>
              <dd>{contact.firstName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Nom</dt>
              <dd>{contact.lastName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Titre</dt>
              <dd>{contact.title ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Société</dt>
              <dd>
                {account ? (
                  <Link to={`/accounts/${account.id}`} className="underline">
                    {account.name}
                  </Link>
                ) : (
                  contact.accountName ?? '—'
                )}
              </dd>
            </div>
          </dl>

          <h2 className="pt-2 text-sm font-medium">Téléphones</h2>
          {phones.length === 0 && <p className="text-sm text-muted-foreground">Aucun numéro.</p>}
          <ul className="space-y-2">
            {[...phones]
              .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)) // le bon numéro en haut
              .map((p) => {
              const href = callHref(p.number)
              return (
                <li
                  key={p.id}
                  ref={(el) => {
                    if (el) phoneItems.current.set(p.id, el)
                    else phoneItems.current.delete(p.id)
                  }}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {href ? (
                      <a href={href} className="font-medium tabular-nums underline-offset-2 hover:underline">
                        {formatPhone(p.number)}
                      </a>
                    ) : (
                      <span>{formatPhone(p.number)}</span>
                    )}
                    <span className="text-muted-foreground">{PHONE_LABELS.includes(p.label) ? p.label : ''}</span>
                  </span>
                  {p.isPrimary ? (
                    <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
                      <Check className="size-3" aria-hidden /> Bon numéro
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 cursor-pointer"
                      disabled={updatingPhone !== null || teamView}
                      onClick={() => void choosePhone(p.id)}
                    >
                      {updatingPhone === p.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                      Bon numéro
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>

          <h2 className="pt-2 text-sm font-medium">Email</h2>
          {emails.length === 0 && <p className="text-sm text-muted-foreground">Aucun email.</p>}
          <ul className="space-y-1.5">
            {emails.map((e) =>
              EMAIL_RE.test(e.address) ? (
                <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <a href={`mailto:${e.address}`} className="underline-offset-2 hover:underline">
                    {e.address}
                  </a>
                  {e.isPrimary && (
                    <Badge variant="secondary" className="font-normal">
                      Principal
                    </Badge>
                  )}
                </li>
              ) : null,
            )}
          </ul>
        </div>

        <div className="space-y-4 rounded-md border border-border p-4">
          <h2 className="text-sm font-medium">Localisation</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Pays</dt>
              <dd>{countryLabel(contact.country)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ville</dt>
              <dd>{contact.city ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Heure locale</dt>
              <dd>
                <LocalTime timezone={contact.timezone} />
              </dd>
            </div>
          </dl>

          <h2 className="pt-2 text-sm font-medium">Profil LinkedIn</h2>
          {safeLinkedinUrl(contact.linkedinUrl) ? (
            <a
              href={safeLinkedinUrl(contact.linkedinUrl)!}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-sm underline-offset-2 hover:underline"
            >
              {safeLinkedinUrl(contact.linkedinUrl)}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}

          <h2 className="pt-2 text-sm font-medium">Source</h2>
          <p className="text-sm">{contact.source ?? '—'}</p>

          <h2 className="pt-2 text-sm font-medium">Description</h2>
          <p className="whitespace-pre-line text-sm">{contact.description ?? '—'}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-md border border-border p-4">
          <h2 className="text-sm font-medium">Cadence</h2>
          {cadence ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{cadence.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {stepsDone} / {cadence.steps.length} étape(s) faite(s)
                </span>
              </div>
              {nextStep ? (
                <div className="rounded-md bg-accent/50 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Prochaine étape · {formatDateTime(nextStep.dueAt)}</p>
                  <p className="font-medium">
                    {nextStep.step.channel} : {nextStep.step.label}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Cadence terminée.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {nextStep && (
                  <Button size="sm" onClick={() => void doneStep()} disabled={cadenceBusy || teamView}>
                    Étape faite
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => void stopCadence()} disabled={cadenceBusy || teamView}>
                  Arrêter la cadence
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-xs text-muted-foreground">
                Une cadence est un plan d’étapes (appel, email, LinkedIn) à suivre sur ce contact. Choisissez-en une pour
                faire apparaître les étapes dans « Ma Journée ».
              </p>
              <FormSelect
                className="w-56"
                value={cadenceChoice}
                onValueChange={(v) => setCadenceChoice(v)}
                options={cadences.map((c) => ({ value: c.id, label: c.name }))}
                emptyLabel="Choisir une cadence"
                ariaLabel="Cadence à démarrer"
                disabled={teamView}
              />
              <Button size="sm" onClick={() => void startCadence()} disabled={!cadenceChoice || cadenceBusy || teamView}>
                Démarrer
              </Button>
              {cadences.length === 0 && (
                <p className="w-full text-xs text-muted-foreground">Aucune cadence. Créez-en une dans l’onglet « Cadences ».</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Autres actions</h2>
            {!teamView && (
              <Button size="sm" variant="outline" onClick={() => setActivityOpen(true)}>
                <Plus className="size-4" aria-hidden /> Journaliser
              </Button>
            )}
          </div>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune action (email, LinkedIn…) enregistrée.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activities.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0">
                  <div className="space-y-0.5">
                    <p>
                      <span className="font-medium">{a.type}</span>{' '}
                      <span className="text-muted-foreground tabular-nums">· {formatDateTime(a.occurredAt.toDate())}</span>
                    </p>
                    {a.notes && <p className="whitespace-pre-line text-muted-foreground">{a.notes}</p>}
                  </div>
                  {!teamView && (
                    <Button variant="ghost" size="icon" onClick={() => void removeActivity(a.id)} aria-label="Supprimer cette action">
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ActivityDialog
        open={activityOpen}
        onOpenChange={setActivityOpen}
        ownerId={contact.ownerId}
        contact={contact}
        onSaved={() => setActivityKey((k) => k + 1)}
      />

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Historique du statut</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun changement de statut enregistré.</p>
        ) : (
          <ul className="space-y-2 rounded-md border border-border p-4 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-b-0 last:pb-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground tabular-nums">{formatDateTime(h.changedAt?.toDate())}</span>
                  <span>
                    {h.fromStatus ? `${h.fromStatus} → ` : ''}
                    <span className="font-medium">{h.toStatus}</span>
                  </span>
                </span>
                {h.reason && <span className="text-muted-foreground">Motif : {h.reason}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium">Historique des appels</h2>
        <CallTimeline ownerId={contact.ownerId} contactId={contact.id} reloadKey={reloadKey} />
      </div>

      <StatusReasonDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => {
          if (!open) setPendingStatus(null)
        }}
        status={pendingStatus}
        required={pendingStatus !== null && STATUSES_REQUIRING_REASON.includes(pendingStatus)}
        onConfirm={(reason) => {
          const target = pendingStatus
          setPendingStatus(null)
          if (target) void applyStatus(target, reason || null)
        }}
      />

      <LogCallDialog
        open={logging}
        onOpenChange={setLogging}
        contact={contact}
        phones={phones}
        onLogged={() => {
          setReloadKey((k) => k + 1)
          void refresh()
        }}
      />

      <ContactDialog
        open={editing}
        onOpenChange={setEditing}
        ownerId={user?.uid ?? ''}
        contact={contact}
        onSaved={() => void refresh()}
      />
    </section>
  )
}

/** Page /contacts/:id : la fiche du contact selon l'adresse. */
export function ContactDetailPage() {
  const { id = '' } = useParams()
  return <ContactDetailView id={id} />
}
