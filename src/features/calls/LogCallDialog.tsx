import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/FormSelect'
import { CallInputError, logCall } from '@/services/calls.repo'
import { formatPhone } from '@/lib/phone'
import { CALL_OUTCOMES, CONTACT_STATUSES, STATUSES_REQUIRING_REASON, outcomeLabel, type CallOutcome, type Contact, type ContactStatus, type Phone } from '@/types/models'
import { deviceTimezone, zonedDateAt, zonedDateFromInput } from '@/lib/reminder'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: Contact
  phones: Phone[]
  initialPhone?: string
  onLogged: () => void
}

type ReminderChoice = 'none' | 'tomorrow' | '3d' | '7d' | '1m' | 'date'

const REMINDER_LABELS: Record<ReminderChoice, string> = {
  none: 'Aucun',
  tomorrow: 'Demain 9h',
  '3d': '+3 jours',
  '7d': '+1 semaine',
  '1m': '+1 mois',
  date: 'Date…',
}

/** Date locale au format attendu par un champ datetime-local (« AAAA-MM-JJTHH:mm »). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Résultat suggéré selon le type d'appel : le BDR peut toujours changer
const SUGGESTED_REMINDER: Partial<Record<CallOutcome, ReminderChoice>> = {
  NPR: 'tomorrow',
  Messagerie: 'tomorrow',
  'Rappel demandé': '3d',
  Nurturing: '1m',
}

export function LogCallDialog({ open, onOpenChange, contact, phones, initialPhone, onLogged }: Props) {
  const [outcome, setOutcome] = useState<CallOutcome | null>(null)
  const [calledPhone, setCalledPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [reminder, setReminder] = useState<ReminderChoice>('none')
  const [reminderDate, setReminderDate] = useState('')
  const [status, setStatus] = useState<ContactStatus>(contact.status)
  const [statusReason, setStatusReason] = useState('')
  const [calledAtInput, setCalledAtInput] = useState('') // date et heure de l'appel, « AAAA-MM-JJTHH:mm »
  const [meetingInput, setMeetingInput] = useState('') // date et heure du RDV, si résultat « RDV pris »
  const [saving, setSaving] = useState(false)

  const timezone = contact.timezone ?? deviceTimezone()
  const statusChanged = status !== contact.status
  const reasonRequired = statusChanged && STATUSES_REQUIRING_REASON.includes(status)

  // Réinitialise le formulaire à chaque ouverture
  useEffect(() => {
    if (!open) return
    const primary = phones.find((p) => p.isPrimary) ?? phones[0]
    setOutcome(null)
    setCalledPhone(initialPhone ?? primary?.number ?? '')
    setNotes('')
    setReminder('none')
    setReminderDate('')
    setStatus(contact.status)
    setStatusReason('')
    setCalledAtInput(toLocalInput(new Date())) // par défaut : maintenant
    setMeetingInput('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact.id])

  const reminderAt = useMemo(() => {
    switch (reminder) {
      case 'tomorrow':
        return zonedDateAt(1, 9, timezone)
      case '3d':
        return zonedDateAt(3, 9, timezone)
      case '7d':
        return zonedDateAt(7, 9, timezone)
      case '1m':
        return zonedDateAt(30, 9, timezone)
      case 'date':
        return reminderDate ? zonedDateFromInput(reminderDate, timezone) : null
      default:
        return null
    }
  }, [reminder, reminderDate, timezone])

  function chooseOutcome(value: CallOutcome) {
    setOutcome(value)
    // Suggestion de rappel, seulement si aucun rappel n'a été choisi explicitement
    if (reminder === 'none' && SUGGESTED_REMINDER[value]) setReminder(SUGGESTED_REMINDER[value]!)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Ctrl/Cmd + Entrée : enregistrer
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void save()
      return
    }
    // Touches 1 à 9 : résultat, sauf dans un champ de saisie
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const index = Number(e.key) - 1
    if (Number.isInteger(index) && index >= 0 && index < Math.min(9, CALL_OUTCOMES.length)) {
      e.preventDefault()
      chooseOutcome(CALL_OUTCOMES[index])
    }
  }

  async function save() {
    if (saving) return
    if (!outcome) {
      toast.error('Choisissez un résultat.')
      return
    }
    if (phones.length > 0 && !calledPhone) {
      toast.error('Choisissez le numéro composé.')
      return
    }
    if (reminder === 'date' && !reminderAt) {
      toast.error('Date de rappel invalide.')
      return
    }
    if (reasonRequired && !statusReason.trim()) {
      toast.error(`Indiquez le motif pour le statut « ${status} ».`)
      return
    }
    const calledAt = calledAtInput ? new Date(calledAtInput) : new Date()
    if (Number.isNaN(calledAt.getTime())) {
      toast.error('Date de l’appel invalide.')
      return
    }
    if (calledAt.getTime() > Date.now() + 60_000) {
      toast.error('La date de l’appel ne peut pas être dans le futur.')
      return
    }
    if (outcome === 'RDV pris' && !meetingInput) {
      toast.error('Indiquez la date et l’heure du RDV.')
      return
    }
    const meetingAt = outcome === 'RDV pris' ? new Date(meetingInput) : null
    if (meetingAt && Number.isNaN(meetingAt.getTime())) {
      toast.error('Date du RDV invalide.')
      return
    }

    setSaving(true)
    try {
      await logCall(contact.ownerId, contact, {
        outcome,
        calledPhone: calledPhone || null,
        notes,
        nextReminderAt: reminderAt,
        meetingAt,
        status,
        statusReason: statusChanged ? statusReason : null,
        calledAt,
      })
      toast.success('Appel enregistré.')
      onLogged()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof CallInputError ? error.message : 'Enregistrement impossible. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  const reminderPreview = reminderAt
    ? new Intl.DateTimeFormat('fr-FR', {
        timeZone: timezone,
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(reminderAt)
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-2xl"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="border-b px-6 py-4 pr-12">
          <DialogTitle>
            Appel · {contact.firstName} {contact.lastName}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Résultat</Label>
            <div className="flex flex-wrap gap-1.5">
              {CALL_OUTCOMES.map((o, i) => (
                <Button
                  key={o}
                  type="button"
                  variant={outcome === o ? 'default' : 'outline'}
                  className={cn('justify-between gap-3 whitespace-nowrap font-normal', outcome !== o && 'text-foreground')}
                  onClick={() => chooseOutcome(o)}
                  aria-pressed={outcome === o}
                >
                  {outcomeLabel(o)}
                  {i < 9 && <kbd className="font-mono text-[11px] opacity-60">{i + 1}</kbd>}
                </Button>
              ))}
            </div>
          </div>

          {outcome === 'RDV pris' && (
            <div className="space-y-1.5 rounded-md border border-primary/40 bg-accent/40 p-3">
              <Label className="text-xs font-medium" htmlFor="meeting-at">Date et heure du RDV *</Label>
              <Input
                id="meeting-at"
                type="datetime-local"
                value={meetingInput}
                onChange={(e) => setMeetingInput(e.target.value)}
              />
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2 [&>*]:min-w-0">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="called-at">Date et heure de l’appel</Label>
            <Input
              id="called-at"
              type="datetime-local"
              value={calledAtInput}
              max={toLocalInput(new Date())}
              onChange={(e) => setCalledAtInput(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Numéro composé</Label>
            {phones.length > 0 ? (
              <FormSelect
                value={calledPhone}
                onValueChange={(v) => setCalledPhone(v)}
                options={phones.map((p) => ({
                  value: p.number,
                  label: `${formatPhone(p.number)} (${p.label})${p.isPrimary ? ' · principal' : ''}`,
                }))}
                ariaLabel="Numéro composé"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Aucun numéro enregistré pour ce contact.</p>
            )}
          </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Prochain rappel</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(REMINDER_LABELS) as ReminderChoice[]).map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant={reminder === r ? 'default' : 'outline'}
                  onClick={() => setReminder(r)}
                  className="font-normal"
                >
                  {REMINDER_LABELS[r]}
                </Button>
              ))}
            </div>
            {reminder === 'date' && (
              <Input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} className="mt-1.5" />
            )}
            {reminderPreview && (
              <p className="text-xs text-muted-foreground">
                Rappel : {reminderPreview} · fuseau du contact ({timezone})
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 5000))} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Statut du contact</Label>
            <FormSelect
              value={status}
              onValueChange={(v) => setStatus(v as ContactStatus)}
              options={CONTACT_STATUSES.map((s) => ({ value: s, label: s }))}
              ariaLabel="Statut du contact"
            />
            {statusChanged && (
              <Textarea
                rows={2}
                value={statusReason}
                maxLength={500}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder={reasonRequired ? `Motif du passage en « ${status} » *` : 'Motif du changement (facultatif)'}
                className="mt-1.5"
              />
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !outcome}>
            Enregistrer <span className="ml-2 text-xs opacity-70">Ctrl+Entrée</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
