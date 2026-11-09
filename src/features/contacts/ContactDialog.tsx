import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormSelect } from '@/components/FormSelect'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { COUNTRIES, allTimezones, countryByCode } from '@/lib/geo'
import { MAX_PHONES_PER_CONTACT, PHONE_LABELS, CONTACT_STATUSES, STATUSES_REQUIRING_REASON, type Contact, type ContactEmail, type Phone } from '@/types/models'
import { contactFormSchema, type ContactFormValues } from '@/lib/schemas'
import { splitCell } from '@/lib/csv-import'
import { safeLinkedinUrl } from '@/lib/text'
import { DataError, createContact, updateContact } from '@/services/contacts.repo'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  ownerId: string
  contact?: Contact
  onSaved: (contactId: string) => void
}

const EMPTY: ContactFormValues = {
  firstName: '',
  lastName: '',
  title: '',
  email: '',
  description: '',
  linkedinUrl: '',
  source: '',
  accountId: '',
  status: 'Cold',
  country: '',
  city: '',
  timezone: '',
  phones: [{ number: '', label: 'Mobile', isPrimary: true }],
}

function fromContact(c: Contact, phones: Phone[], emails: ContactEmail[]): ContactFormValues {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    title: c.title ?? '',
    email: emails.length > 0 ? emails.map((e) => e.address).join(' ; ') : (c.email ?? ''),
    description: c.description ?? '',
    linkedinUrl: c.linkedinUrl ?? '',
    source: c.source ?? '',
    accountId: c.accountId ?? '',
    status: c.status,
    country: c.country ?? '',
    city: c.city ?? '',
    timezone: c.timezone ?? '',
    phones: phones.map((p) => ({ id: p.id, number: p.number, label: p.label, isPrimary: p.isPrimary })),
  }
}

// Séparateurs d'emails dans une cellule : espace, ; , : / | ou retour à la ligne
const EMAIL_SEPARATORS = /[\s:;,/|\n\r]+/
export function ContactDialog({ open, onOpenChange, ownerId, contact, onSaved }: Props) {
  const { accounts, accountById, phonesOf, emailsOf, refresh } = useDirectory()
  const [values, setValues] = useState<ContactFormValues>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [statusReason, setStatusReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(contact ? fromContact(contact, phonesOf(contact.id), emailsOf(contact.id)) : EMPTY)
    setErrors({})
    setStatusReason('')
    // phonesOf est recalculé à chaque chargement : on ne le suit pas pour ne pas écraser la saisie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact])

  function set<K extends keyof ContactFormValues>(key: K, value: ContactFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function setAccount(accountId: string) {
    setValues((prev) => {
      const account = accountById(accountId || null)
      // Reprend le pays et la ville du compte si le contact n'en a pas
      return {
        ...prev,
        accountId,
        country: prev.country || account?.country || '',
        city: prev.city || account?.city || '',
        timezone: prev.timezone || account?.timezone || '',
      }
    })
  }

  function setCountry(code: string) {
    setValues((prev) => ({
      ...prev,
      country: code,
      timezone: countryByCode(code)?.timezone ?? prev.timezone,
    }))
  }

  function updatePhone(index: number, patch: Partial<ContactFormValues['phones'][number]>) {
    setValues((prev) => ({
      ...prev,
      phones: prev.phones.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }))
  }

  function setPrimary(index: number) {
    setValues((prev) => ({
      ...prev,
      phones: prev.phones.map((p, i) => ({ ...p, isPrimary: i === index })),
    }))
  }

  function removePhone(index: number) {
    setValues((prev) => {
      const remaining = prev.phones.filter((_, i) => i !== index)
      // Toujours un principal s'il reste des numéros
      if (remaining.length > 0 && !remaining.some((p) => p.isPrimary)) remaining[0] = { ...remaining[0], isPrimary: true }
      return { ...prev, phones: remaining }
    })
  }

  function addPhone() {
    setValues((prev) => ({
      ...prev,
      phones: [...prev.phones, { number: '', label: 'Mobile', isPrimary: prev.phones.length === 0 }],
    }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = contactFormSchema.safeParse(values)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
      setErrors(fieldErrors)
      return
    }
    setErrors({})

    const data = parsed.data
    const statusChanged = !!contact && data.status !== contact.status
    if (statusChanged && STATUSES_REQUIRING_REASON.includes(data.status) && !statusReason.trim()) {
      toast.error(`Indiquez le motif pour le statut « ${data.status} ».`)
      return
    }
    const input = {
      statusReason: statusChanged ? statusReason : null,
      firstName: data.firstName,
      lastName: data.lastName,
      title: data.title,
      emails: splitCell(data.email, EMAIL_SEPARATORS),
      description: data.description,
      linkedinUrl: safeLinkedinUrl(data.linkedinUrl),
      // En modification, la source reste celle d'origine
      source: contact ? contact.source ?? null : data.source || null,
      accountId: data.accountId || null,
      accountName: accountById(data.accountId || null)?.name ?? null,
      status: data.status,
      country: data.country || null,
      city: data.city,
      timezone: data.timezone || null,
      phones: data.phones.map((p) => ({ id: p.id, number: p.number, label: p.label, isPrimary: p.isPrimary })),
    }

    setSaving(true)
    try {
      if (contact) {
        await updateContact(ownerId, contact, input, phonesOf(contact.id), emailsOf(contact.id))
        onSaved(contact.id)
      } else {
        const id = await createContact(ownerId, input)
        onSaved(id)
      }
      await refresh()
      onOpenChange(false)
    } catch (error) {
      if (error instanceof DataError) {
        toast.error(error.message)
      } else {
        toast.error('Enregistrement impossible. Réessayez.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4 pr-12">
          <DialogTitle>{contact ? 'Modifier le contact' : 'Nouveau contact'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogBody className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Prénom *" error={errors.firstName}>
            <Input value={values.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
          </Field>
          <Field label="Nom *" error={errors.lastName}>
            <Input value={values.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
          <Field label="Compte">
            <FormSelect
              value={values.accountId}
              onValueChange={(v) => setAccount(v)}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
              emptyLabel="— Aucun —"
              ariaLabel="Compte"
            />
          </Field>
          <Field label="Titre / poste">
            <Input value={values.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Profil LinkedIn" error={errors.linkedinUrl} className="col-span-2">
            <Input value={values.linkedinUrl} onChange={(e) => set('linkedinUrl', e.target.value)} placeholder="https://www.linkedin.com/in/..." />
          </Field>
          <Field label="Emails (séparés par ; ou espace)" error={errors.email} className="col-span-2">
            <Input value={values.email} onChange={(e) => set('email', e.target.value)} placeholder="principal@exemple.com ; autre@exemple.com" />
          </Field>
          <Field label="Source" error={errors.source}>
            {contact ? (
              // La source se définit à la création (import ou saisie) et ne se modifie plus ensuite
              <Input value={values.source || '—'} disabled readOnly aria-label="Source (non modifiable)" />
            ) : (
              <Input value={values.source} onChange={(e) => set('source', e.target.value)} placeholder="ex. Liste salon 2026" />
            )}
          </Field>
          <Field label="Statut">
            <FormSelect
              value={values.status}
              onValueChange={(v) => set('status', v as ContactFormValues['status'])}
              options={CONTACT_STATUSES.map((s) => ({ value: s, label: s }))}
              ariaLabel="Statut"
            />
          </Field>
          {contact && values.status !== contact.status && (
            <Field
              label={STATUSES_REQUIRING_REASON.includes(values.status) ? 'Motif du changement de statut *' : 'Motif du changement de statut (facultatif)'}
              className="col-span-2"
            >
              <Input value={statusReason} maxLength={500} onChange={(e) => setStatusReason(e.target.value)} placeholder="ex. Pas de budget cette année" />
            </Field>
          )}

          <div className="col-span-2 space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Téléphones ({values.phones.length}/{MAX_PHONES_PER_CONTACT})
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addPhone}
                disabled={values.phones.length >= MAX_PHONES_PER_CONTACT}
              >
                <Plus className="size-4" aria-hidden /> Ajouter
              </Button>
            </div>

            {values.phones.map((phone, index) => (
              <div key={phone.id ?? `new-${index}`} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="primary-phone"
                  aria-label="Numéro principal"
                  checked={phone.isPrimary}
                  onChange={() => setPrimary(index)}
                  className="size-4 accent-[var(--primary)]"
                />
                <Input
                  className="flex-1"
                  placeholder="+33 6 12 34 56 78"
                  value={phone.number}
                  onChange={(e) => updatePhone(index, { number: e.target.value })}
                  inputMode="tel"
                  aria-label="Numéro de téléphone"
                />
                <FormSelect
                  className="w-32"
                  value={phone.label}
                  onValueChange={(v) => updatePhone(index, { label: v as ContactFormValues['phones'][number]['label'] })}
                  options={PHONE_LABELS.map((l) => ({ value: l, label: l }))}
                  ariaLabel="Type de numéro"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removePhone(index)} aria-label="Retirer ce numéro">
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
            {errors.phones ? (
              <p className="text-xs text-destructive">{errors.phones}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Format international recommandé (+225…). Sans indicatif, le pays du contact est utilisé.
              </p>
            )}
          </div>

          <Field label="Pays">
            <FormSelect
              value={values.country}
              onValueChange={(v) => setCountry(v)}
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
          <Field label="Description" className="col-span-2" error={errors.description}>
            <Textarea rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} />
          </Field>

          </DialogBody>

          <DialogFooter className="border-t px-6 py-4">
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

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
