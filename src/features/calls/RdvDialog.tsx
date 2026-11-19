import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/RichTextEditor'
import { rdvDateOf } from '@/features/calls/useRdvCalls'
import { richTextLength } from '@/lib/rich-text'
import { cn } from '@/lib/utils'
import { formatDateTime, toDateTimeInput } from '@/lib/time'
import {
  CallInputError,
  FOLLOW_UP_DESCRIPTION_MAX,
  MAX_FOLLOW_UPS,
  addFollowUpMeeting,
  rescheduleMeeting,
  saveRdvDetails,
  type FollowUpInput,
} from '@/services/calls.repo'
import type { Call } from '@/types/models'

// RDV de suivi en cours de saisie : la date reste au format du champ datetime-local
type FollowUpDraft = Omit<FollowUpInput, 'meetingAt'> & { meetingInput: string }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  call: Call
  contactName: string
  done: boolean // le RDV est passé
  onSaved: () => void
}

/** Détail d'un RDV : date, notes de l'appel et compte rendu à rédiger après le rendez-vous. */
export function RdvDialog({ open, onOpenChange, call, contactName, done, onSaved }: Props) {
  const [compteRendu, setCompteRendu] = useState(call.compteRendu ?? '')
  const [meetingInput, setMeetingInput] = useState(toDateTimeInput(rdvDateOf(call)))
  const changes = [...(call.meetingHistory ?? [])].sort((a, b) => a.changedAt.toMillis() - b.changedAt.toMillis())
  const [saving, setSaving] = useState(false)
  const [now] = useState(() => Date.now())
  const [followUps, setFollowUps] = useState<FollowUpDraft[]>(() =>
    (call.followUps ?? []).map((f) => ({
      meetingInput: toDateTimeInput(f.meetingAt.toDate()),
      description: f.description ?? '',
      compteRendu: f.compteRendu ?? '',
      createdAt: f.createdAt,
    })),
  )
  const [newFollowUpInput, setNewFollowUpInput] = useState('')
  const [newFollowUpDescription, setNewFollowUpDescription] = useState('')
  // Cartes dépliées (numéro du RDV) : seul le dernier RDV est ouvert à l'ouverture
  const [openCards, setOpenCards] = useState<Set<number>>(() => new Set([(call.followUps?.length ?? 0) + 1]))

  function toggleCard(number: number) {
    setOpenCards((current) => {
      const next = new Set(current)
      if (next.has(number)) next.delete(number)
      else next.add(number)
      return next
    })
  }

  function updateFollowUp(index: number, patch: Partial<FollowUpDraft>) {
    setFollowUps((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  async function addFollowUp() {
    if (saving) return
    const meetingAt = new Date(newFollowUpInput)
    if (!newFollowUpInput || Number.isNaN(meetingAt.getTime())) {
      toast.error('Date du RDV de suivi invalide.')
      return
    }
    setSaving(true)
    try {
      const added = await addFollowUpMeeting(call.id, meetingAt, newFollowUpDescription, followUps.length)
      setFollowUps((list) => [
        ...list,
        { meetingInput: newFollowUpInput, description: added.description ?? '', compteRendu: '', createdAt: added.createdAt },
      ])
      setOpenCards(new Set([followUps.length + 2])) // le nouveau RDV de suivi s'ouvre, les autres se replient
      setNewFollowUpInput('')
      setNewFollowUpDescription('')
      toast.success('RDV de suivi ajouté.')
      onSaved()
    } catch (error) {
      toast.error(error instanceof CallInputError ? error.message : 'Ajout impossible. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  async function reschedule() {
    if (saving) return
    const meetingAt = new Date(meetingInput)
    if (!meetingInput || Number.isNaN(meetingAt.getTime())) {
      toast.error('Date du RDV invalide.')
      return
    }
    setSaving(true)
    try {
      await rescheduleMeeting(call.id, meetingAt, rdvDateOf(call))
      toast.success('RDV reporté.')
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof CallInputError ? error.message : 'Report impossible. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await saveRdvDetails(
        call.id,
        compteRendu,
        followUps.map((f) => ({
          meetingAt: new Date(f.meetingInput),
          description: f.description,
          compteRendu: f.compteRendu,
          createdAt: f.createdAt,
        })),
      )
      toast.success('Compte rendu enregistré.')
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof CallInputError ? error.message : 'Enregistrement impossible. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4 pr-12">
          <DialogTitle>Rendez-vous avec {contactName}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <RdvCard
            title={followUps.length > 0 ? 'RDV n° 1' : 'Rendez-vous'}
            date={formatDateTime(rdvDateOf(call))}
            done={done}
            hasCompteRendu={richTextLength(compteRendu) > 0}
            open={openCards.has(1)}
            onToggle={() => toggleCard(1)}
          >
          {changes.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-medium">
                RDV reporté {changes.length} fois
              </p>
              <ul className="mt-1 space-y-0.5">
                {changes.map((change) => (
                  <li key={change.changedAt.toMillis()}>
                    Ancienne date : {formatDateTime(change.previousAt.toDate())} · changé le {formatDateTime(change.changedAt.toDate())}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium" htmlFor="rdv-reschedule">Reporter le RDV</Label>
            <div className="flex gap-2">
              <Input id="rdv-reschedule" type="datetime-local" value={meetingInput} onChange={(e) => setMeetingInput(e.target.value)} />
              <Button
                type="button"
                variant="outline"
                onClick={() => void reschedule()}
                disabled={saving || meetingInput === toDateTimeInput(rdvDateOf(call))}
              >
                Reporter
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes de l’appel</Label>
            <p className="whitespace-pre-line rounded-md bg-muted/50 px-3 py-2 text-sm">{call.notes || '—'}</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium" htmlFor="rdv-compte-rendu">Compte rendu du rendez-vous</Label>
            <RichTextEditor
              id="rdv-compte-rendu"
              value={compteRendu}
              onChange={setCompteRendu}
              placeholder="Ce qui a été dit, les prochaines étapes…"
            />
          </div>
          </RdvCard>

          {followUps.map((f, i) => {
            const at = new Date(f.meetingInput)
            const validDate = !Number.isNaN(at.getTime())
            return (
              <RdvCard
                key={f.createdAt.toMillis()}
                title={`RDV de suivi n° ${i + 2}`}
                date={validDate ? formatDateTime(at) : '—'}
                description={f.description}
                done={validDate && at.getTime() < now}
                hasCompteRendu={richTextLength(f.compteRendu) > 0}
                open={openCards.has(i + 2)}
                onToggle={() => toggleCard(i + 2)}
              >
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" htmlFor={`rdv-suivi-date-${i}`}>Date du RDV</Label>
                  <Input
                    id={`rdv-suivi-date-${i}`}
                    type="datetime-local"
                    value={f.meetingInput}
                    onChange={(e) => updateFollowUp(i, { meetingInput: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" htmlFor={`rdv-suivi-description-${i}`}>Description</Label>
                  <Input
                    id={`rdv-suivi-description-${i}`}
                    value={f.description}
                    maxLength={FOLLOW_UP_DESCRIPTION_MAX}
                    placeholder="Ex. : démo avec le DSI"
                    onChange={(e) => updateFollowUp(i, { description: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" htmlFor={`rdv-suivi-cr-${i}`}>Compte rendu du RDV n°&nbsp;{i + 2}</Label>
                  <RichTextEditor
                    id={`rdv-suivi-cr-${i}`}
                    value={f.compteRendu}
                    onChange={(html) => updateFollowUp(i, { compteRendu: html })}
                    placeholder="Ce qui a été dit, les prochaines étapes…"
                  />
                </div>
              </RdvCard>
            )
          })}

          {followUps.length < MAX_FOLLOW_UPS && (
            <div className="space-y-1.5 pt-2">
              <Label className="text-xs font-medium" htmlFor="rdv-suivi-new">Ajouter un RDV de suivi</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="rdv-suivi-new"
                  type="datetime-local"
                  className="sm:w-56"
                  value={newFollowUpInput}
                  onChange={(e) => setNewFollowUpInput(e.target.value)}
                />
                <Input
                  aria-label="Description du RDV de suivi"
                  value={newFollowUpDescription}
                  maxLength={FOLLOW_UP_DESCRIPTION_MAX}
                  placeholder="Description (facultatif)"
                  onChange={(e) => setNewFollowUpDescription(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={() => void addFollowUp()} disabled={saving || !newFollowUpInput}>
                  Ajouter
                </Button>
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface RdvCardProps {
  title: string
  date: string
  description?: string
  done: boolean
  hasCompteRendu: boolean
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/** Carte pliable d'un RDV : l'en-tête résume le RDV, le contenu (dates, compte rendu) se déplie au clic. */
function RdvCard({ title, date, description, done, hasCompteRendu, open, onToggle, children }: RdvCardProps) {
  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
        aria-expanded={open}
        onClick={onToggle}
      >
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden />
        <span className="font-medium">{title}</span>
        <span className="tabular-nums text-muted-foreground">· {date}</span>
        {description && <span className="min-w-0 truncate text-muted-foreground">· {description}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs">
          <span className={hasCompteRendu ? 'text-muted-foreground' : 'text-muted-foreground/70'}>
            {hasCompteRendu ? 'CR rédigé' : 'Pas de CR'}
          </span>
          <span className={done ? 'text-muted-foreground/70' : 'font-medium text-emerald-700 dark:text-emerald-400'}>
            {done ? 'Terminé' : 'À venir'}
          </span>
        </span>
      </button>
      {/* Contenu masqué plutôt que retiré : la saisie en cours dans l'éditeur est conservée */}
      <div hidden={!open} className="space-y-4 border-t px-3 py-3">
        {children}
      </div>
    </div>
  )
}
