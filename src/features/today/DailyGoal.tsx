import { useEffect, useState, type FormEvent } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEFAULT_DAILY_CALL_GOAL, MAX_DAILY_CALL_GOAL, MIN_DAILY_CALL_GOAL, goalProgress, parseDailyCallGoal } from '@/lib/daily-goal'
import { cn } from '@/lib/utils'
import { DailyGoalInputError, getDailyCallGoal, setDailyCallGoal } from '@/services/users.repo'

interface Props {
  uid: string
  callsToday: number | null
  readOnly: boolean // vue équipe (admin) : pas de modification
}

/** Appels du jour par rapport à l'objectif du BDR, avec barre de progression. L'objectif se modifie sur place. */
export function DailyGoal({ uid, callsToday, readOnly }: Props) {
  const [goal, setGoal] = useState(DEFAULT_DAILY_CALL_GOAL)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getDailyCallGoal(uid)
      .then((value) => !cancelled && setGoal(value))
      .catch(() => {
        // Lecture impossible : l'objectif par défaut reste affiché
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  function startEditing() {
    setDraft(String(goal))
    setEditing(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const value = parseDailyCallGoal(draft)
    if (value === null) {
      toast.error(`Indiquez un nombre d’appels entre ${MIN_DAILY_CALL_GOAL} et ${MAX_DAILY_CALL_GOAL}.`)
      return
    }
    setSaving(true)
    try {
      await setDailyCallGoal(uid, value)
      setGoal(value)
      setEditing(false)
      toast.success(`Objectif enregistré : ${value} appels par jour.`)
    } catch (error) {
      toast.error(error instanceof DailyGoalInputError ? error.message : 'Impossible d’enregistrer l’objectif. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  const done = callsToday ?? 0
  const progress = goalProgress(done, goal)
  const reached = callsToday !== null && done >= goal

  return (
    <div className="w-40 text-right">
      {editing ? (
        <form onSubmit={(e) => void save(e)} className="flex items-center justify-end gap-1">
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_DAILY_CALL_GOAL}
            max={MAX_DAILY_CALL_GOAL}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            className="h-7 w-16 px-2 text-right tabular-nums"
            aria-label="Objectif d’appels par jour"
            autoFocus
            disabled={saving}
          />
          <Button type="submit" size="icon-xs" disabled={saving} aria-label="Enregistrer l’objectif">
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          </Button>
          <Button type="button" size="icon-xs" variant="ghost" onClick={() => setEditing(false)} disabled={saving} aria-label="Annuler">
            <X aria-hidden />
          </Button>
        </form>
      ) : (
        <p className="flex items-center justify-end gap-1 text-lg font-semibold tabular-nums">
          <span className={reached ? 'text-emerald-600 dark:text-emerald-400' : undefined}>{callsToday ?? '—'}</span>
          <span className="text-sm font-normal text-muted-foreground">/ {goal}</span>
          {!readOnly && (
            <button
              type="button"
              onClick={startEditing}
              className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Modifier l’objectif d’appels"
              title="Modifier l’objectif"
            >
              <Pencil className="size-3" aria-hidden />
            </button>
          )}
        </p>
      )}
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Avancement vers l’objectif d’appels"
      >
        <div
          className={cn('h-full rounded-full transition-[width]', reached ? 'bg-emerald-500' : 'bg-primary')}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{reached ? 'Objectif atteint !' : 'Appels / objectif'}</p>
    </div>
  )
}
