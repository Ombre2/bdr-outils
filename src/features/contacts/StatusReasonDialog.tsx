import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ContactStatus } from '@/types/models'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: ContactStatus | null
  required: boolean // motif obligatoire pour ce statut
  onConfirm: (reason: string) => void
}

/** Saisie du motif d'un changement de statut (obligatoire pour certains statuts, facultatif sinon). */
export function StatusReasonDialog({ open, onOpenChange, status, required, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setReason('')
      setError('')
    }
  }, [open])

  function confirm() {
    if (required && !reason.trim()) {
      setError('Indiquez le motif.')
      return
    }
    onConfirm(reason.trim())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Passer en « {status} »</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{required ? 'Motif *' : 'Motif (facultatif)'}</Label>
          <Textarea
            rows={3}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex. Pas de budget cette année"
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={confirm}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
