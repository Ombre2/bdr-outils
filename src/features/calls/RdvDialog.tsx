import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/RichTextEditor'
import { rdvDateOf } from '@/features/calls/useRdvCalls'
import { formatDateTime } from '@/lib/time'
import { CallInputError, saveCompteRendu } from '@/services/calls.repo'
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
  const [saving, setSaving] = useState(false)

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
