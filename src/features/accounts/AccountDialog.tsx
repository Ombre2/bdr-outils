import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/FormSelect'
import { COUNTRIES, allTimezones, countryByCode } from '@/lib/geo'
import { accountFormSchema, type AccountFormValues } from '@/lib/schemas'
import { createAccount, updateAccount } from '@/services/accounts.repo'
import type { Account } from '@/types/models'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  ownerId: string
  account?: Account
  onSaved: (accountId: string) => void
}

const EMPTY: AccountFormValues = {
  name: '',
  website: '',
  industry: '',
  headcount: '',
  description: '',
  country: '',
  city: '',
  timezone: '',
}

function fromAccount(a: Account): AccountFormValues {
  return {
    name: a.name,
    website: a.website ?? '',
    industry: a.industry ?? '',
    headcount: a.headcount ?? '',
    description: a.description ?? '',
    country: a.country ?? '',
    city: a.city ?? '',
    timezone: a.timezone ?? '',
  }
}

export function AccountDialog({ open, onOpenChange, ownerId, account, onSaved }: Props) {
  const [values, setValues] = useState<AccountFormValues>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof AccountFormValues, string>>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setValues(account ? fromAccount(account) : EMPTY)
      setErrors({})
    }
  }, [open, account])

  function set<K extends keyof AccountFormValues>(key: K, value: AccountFormValues[K]) {
    setValues((prev) => {
      const next = { ...prev, [key]: value }
      // Fuseau proposé automatiquement quand le pays change
      if (key === 'country') {
        const suggested = countryByCode(String(value))?.timezone
        if (suggested) next.timezone = suggested
      }
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = accountFormSchema.safeParse(values)
    if (!parsed.success) {
      const fieldErrors: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof AccountFormValues
        fieldErrors[key] ??= issue.message
      }
      setErrors(fieldErrors)
      return
    }

    setSaving(true)
    const input = {
      ...parsed.data,
      headcount: parsed.data.headcount || null,
      country: parsed.data.country || null,
      timezone: parsed.data.timezone || null,
    }
    try {
      if (account) {
        await updateAccount(account.id, input)
        onSaved(account.id)
      } else {
        const id = await createAccount(ownerId, input)
        onSaved(id)
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? 'Modifier le compte' : 'Nouveau compte'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-x-4 gap-y-3" noValidate>
          <Field label="Nom de l'entreprise *" error={errors.name} className="col-span-2">
            <Input value={values.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </Field>
          <Field label="Site web" error={errors.website} className="col-span-2">
            <Input
              placeholder="https://exemple.com"
              value={values.website}
              onChange={(e) => set('website', e.target.value)}
            />
          </Field>
          <Field label="Industrie" error={errors.industry}>
            <Input value={values.industry} onChange={(e) => set('industry', e.target.value)} />
          </Field>
          <Field label="Headcount" error={errors.headcount}>
            <Input
              inputMode="numeric"
              placeholder="ex. 11-50"
              value={values.headcount}
              onChange={(e) => set('headcount', e.target.value)}
            />
          </Field>
          <Field label="Pays">
            <FormSelect
              value={values.country}
              onValueChange={(v) => set('country', v)}
              options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
              emptyLabel="—"
              ariaLabel="Pays"
            />
          </Field>
          <Field label="Ville">
            <Input value={values.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="Fuseau horaire" className="col-span-2">
            <FormSelect
              value={values.timezone}
              onValueChange={(v) => set('timezone', v)}
              options={allTimezones().map((tz) => ({ value: tz, label: tz }))}
              emptyLabel="—"
              ariaLabel="Fuseau horaire"
            />
          </Field>
          <Field label="Description" error={errors.description} className="col-span-2">
            <Textarea rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} />
          </Field>

          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
