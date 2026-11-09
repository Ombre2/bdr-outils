import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/FormSelect'
import { formatPhone } from '@/lib/phone'
import { CallInputError, updateCall } from '@/services/calls.repo'
import { CALL_OUTCOMES, type Call, type CallOutcome, type Phone } from '@/types/models'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  call: Call
  phones: Phone[]
  onSaved: () => void
}

/** Date locale au format d'un champ datetime-local. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Correction d'un appel déjà enregistré (résultat, numéro, date, notes). */
export function EditCallDialog({ open, onOpenChange, call, phones, onSaved }: Props) {
  const [outcome, setOutcome] = useState<CallOutcome>(call.outcome)
  const [calledPhone, setCalledPhone] = useState<string>(call.calledPhone ?? '')
  const [calledAtInput, setCalledAtInput] = useState('')
  const [meetingInput, setMeetingInput] = useState('')
  const [notes, setNotes] = useState(call.notes ?? '')
  const [saving, setSaving] = useState(false)

  // Remplit le formulaire avec l'appel à chaque ouverture
  useEffect(() => {
    if (!open) return
    setOutcome(call.outcome)
    setCalledPhone(call.calledPhone ?? '')
    setCalledAtInput(toLocalInput(call.calledAt.toDate()))
    setMeetingInput(call.meetingAt ? toLocalInput(call.meetingAt.toDate()) : '')
    setNotes(call.notes ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, call.id])

  async function save() {
    if (saving) return
    const calledAt = new Date(calledAtInput)
    if (Number.isNaN(calledAt.getTime())) {
      toast.error('Date de l’appel invalide.')
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
      await updateCall(call.id, {
        outcome,
        calledPhone: calledPhone || null,
        notes,
        calledAt,
        meetingAt,
      })
      toast.success('Appel corrigé.')
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof CallInputError ? error.message : 'Correction impossible. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4 pr-12">
          <DialogTitle>Corriger l’appel</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Résultat</Label>
            <FormSelect
              value={outcome}
              onValueChange={(v) => setOutcome(v as CallOutcome)}
              options={CALL_OUTCOMES.map((o) => ({ value: o, label: o }))}
              ariaLabel="Résultat de l’appel"
            />
          </div>

          {outcome === 'RDV pris' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium" htmlFor="edit-meeting-at">Date et heure du RDV *</Label>
              <Input id="edit-meeting-at" type="datetime-local" value={meetingInput} onChange={(e) => setMeetingInput(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="edit-called-at">Date et heure de l’appel</Label>
            <Input id="edit-called-at" type="datetime-local" value={calledAtInput} onChange={(e) => setCalledAtInput(e.target.value)} />
          </div>

          {phones.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Numéro composé</Label>
              <FormSelect
                value={calledPhone}
                onValueChange={(v) => setCalledPhone(v)}
                options={phones.map((p) => ({ value: p.number, label: `${formatPhone(p.number)} (${p.label})` }))}
                ariaLabel="Numéro composé"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 5000))} />
          </div>
        </DialogBody>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
