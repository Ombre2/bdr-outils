import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/FormSelect'
import { ActivityInputError, createActivity } from '@/services/activities.repo'
import { ACTIVITY_TYPES, type ActivityType, type Contact } from '@/types/models'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  ownerId: string
  contact: Contact
  onSaved: () => void
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Journalise un email, un message LinkedIn ou une autre action (sans appel). */
export function ActivityDialog({ open, onOpenChange, ownerId, contact, onSaved }: Props) {
  const [type, setType] = useState<ActivityType>('Email envoyé')
  const [occurredAt, setOccurredAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setType('Email envoyé')
    setOccurredAt(toLocalInput(new Date())) // par défaut : maintenant
    setNotes('')
  }, [open])

  async function save() {
    if (saving) return
    const date = new Date(occurredAt)
    if (Number.isNaN(date.getTime())) {
      toast.error('Date invalide.')
      return
    }
    setSaving(true)
    try {
      await createActivity(ownerId, contact, { type, occurredAt: date, notes })
      toast.success('Action enregistrée.')
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ActivityInputError ? error.message : 'Enregistrement impossible. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4 pr-12">
          <DialogTitle>
            Action · {contact.firstName} {contact.lastName}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Type d’action</Label>
            <FormSelect
              value={type}
              onValueChange={(v) => setType(v as ActivityType)}
              options={ACTIVITY_TYPES.map((t) => ({ value: t, label: t }))}
              ariaLabel="Type d’action"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="activity-at">Date et heure</Label>
            <Input id="activity-at" type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes (facultatif)</Label>
            <Textarea rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="ex. Objet : présentation offre" />
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
