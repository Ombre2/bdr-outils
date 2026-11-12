import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/RichTextEditor'
import { rdvDateOf } from '@/features/calls/useRdvCalls'
import { formatDateTime, toDateTimeInput } from '@/lib/time'
import { CallInputError, rescheduleMeeting, saveCompteRendu } from '@/services/calls.repo'
import type { Call } from '@/types/models'

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
      await saveCompteRendu(call.id, compteRendu)
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

        <DialogBody className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{formatDateTime(rdvDateOf(call))}</span>
            <span className={done ? 'text-xs text-muted-foreground/70' : 'text-xs font-medium text-emerald-700 dark:text-emerald-400'}>
              {done ? 'Terminé' : 'À venir'}
            </span>
          </div>

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
