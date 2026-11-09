import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FormSelect } from '@/components/FormSelect'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { CadenceInputError, deleteCadence, saveCadence } from '@/services/cadences.repo'
import { CADENCE_CHANNELS, MAX_CADENCE_STEPS, type Cadence, type CadenceChannel } from '@/types/models'

export function CadencesPage() {
  const { cadences, contacts, refresh, loading, teamView } = useDirectory()
  const { user } = useAuth()
  const [editing, setEditing] = useState<Cadence | 'new' | null>(null)

  // Nombre de contacts qui suivent chaque cadence
  const usage = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of contacts) {
      if (c.cadenceId) map.set(c.cadenceId, (map.get(c.cadenceId) ?? 0) + 1)
    }
    return map
  }, [contacts])

  async function handleDelete(cadence: Cadence) {
    const inUse = usage.get(cadence.id) ?? 0
    if (inUse > 0) {
      toast.error(`Cette cadence est utilisée par ${inUse} contact(s). Arrêtez-la sur ces contacts avant de la supprimer.`)
      return
    }
    if (!window.confirm(`Supprimer la cadence « ${cadence.name} » ?`)) return
    try {
      await deleteCadence(cadence.id)
      await refresh()
      toast.success('Cadence supprimée.')
    } catch {
      toast.error('Suppression impossible. Réessayez.')
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Cadences</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Une cadence est un plan en plusieurs étapes, par exemple : jour 0 appel, jour 2 email, jour 5 LinkedIn. Quand vous
            démarrez une cadence sur un contact, ses étapes apparaissent dans « Ma Journée » au bon jour. Marquez chaque étape
            « faite » une fois réalisée.
          </p>
        </div>
        {!teamView && (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Nouvelle cadence
          </Button>
        )}
      </header>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Nom</TableHead>
              <TableHead>Étapes</TableHead>
              <TableHead className="text-right">Contacts</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cadences.map((c) => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => !teamView && setEditing(c)}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.steps.length} étape(s) · {c.steps.map((s) => s.channel).join(' → ')}
                </TableCell>
                <TableCell className="text-right tabular-nums">{usage.get(c.id) ?? 0}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Supprimer la cadence ${c.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(c)
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && cadences.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Aucune cadence. Créez-en une pour suivre vos contacts étape par étape.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CadenceDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        ownerId={user?.uid ?? ''}
        cadence={editing && editing !== 'new' ? editing : null}
        onSaved={() => void refresh()}
      />
    </section>
  )
}

interface StepDraft {
  dayOffset: string
  channel: CadenceChannel
  label: string
}

const DEFAULT_STEPS: StepDraft[] = [{ dayOffset: '0', channel: 'Appel', label: 'Premier appel' }]

function CadenceDialog({
  open,
  onOpenChange,
  ownerId,
  cadence,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ownerId: string
  cadence: Cadence | null
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [steps, setSteps] = useState<StepDraft[]>(DEFAULT_STEPS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(cadence?.name ?? '')
    setSteps(
      cadence
        ? cadence.steps.map((s) => ({ dayOffset: String(s.dayOffset), channel: s.channel, label: s.label }))
        : DEFAULT_STEPS,
    )
  }, [open, cadence])

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await saveCadence(
        ownerId,
        cadence,
        name,
        steps.map((s) => ({
          dayOffset: Number(s.dayOffset),
          channel: s.channel,
          label: s.label,
        })),
      )
      toast.success('Cadence enregistrée.')
      onSaved()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof CadenceInputError ? error.message : 'Enregistrement impossible. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cadence ? 'Modifier la cadence' : 'Nouvelle cadence'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="cadence-name">Nom</Label>
            <Input id="cadence-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Séquence Afrique de l’Ouest" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Étapes</Label>
            <p className="text-xs text-muted-foreground">
              Le jour 0 est le jour où la cadence démarre sur le contact. Un jour 2 veut dire « 2 jours après le démarrage ».
              Les étapes sont classées automatiquement par jour.
            </p>
            {steps.map((step, index) => (
              <div key={index} className="grid grid-cols-[80px_140px_1fr_auto] items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={step.dayOffset}
                  onChange={(e) => updateStep(index, { dayOffset: e.target.value })}
                  aria-label={`Jour de l’étape ${index + 1}`}
                />
                <FormSelect
                  value={step.channel}
                  onValueChange={(v) => updateStep(index, { channel: v as CadenceChannel })}
                  options={CADENCE_CHANNELS.map((ch) => ({ value: ch, label: ch }))}
                  ariaLabel={`Canal de l’étape ${index + 1}`}
                />
                <Input
                  value={step.label}
                  maxLength={120}
                  onChange={(e) => updateStep(index, { label: e.target.value })}
                  placeholder="ex. Email de présentation"
                  aria-label={`Libellé de l’étape ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Retirer l’étape ${index + 1}`}
                  disabled={steps.length === 1}
                  onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={steps.length >= MAX_CADENCE_STEPS}
              onClick={() => setSteps((prev) => [...prev, { dayOffset: String((Number(prev.at(-1)?.dayOffset) || 0) + 2), channel: 'Email', label: '' }])}
            >
              <Plus className="size-4" aria-hidden /> Ajouter une étape
            </Button>
          </div>
        </div>

        <DialogFooter>
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
