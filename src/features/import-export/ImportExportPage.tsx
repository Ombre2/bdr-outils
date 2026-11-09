import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { saveAs } from 'file-saver'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FormSelect } from '@/components/FormSelect'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import {
  ACCOUNT_FIELDS,
  CONTACT_FIELDS,
  FIELD_LABELS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  detectMapping,
  isMappingValid,
  mappingWarnings,
  planImport,
  type Mapping,
  type MappingField,
  type PlannedRow,
  type RowStatus,
} from '@/lib/csv-import'
import { accountsCsv, callsCsv, contactsCsv, importTemplateCsv } from '@/lib/csv-export'
import { COUNTRIES } from '@/lib/geo'
import { normalizeText } from '@/lib/text'
import { PERIOD_KEYS, PERIOD_LABELS, periodRange, type PeriodKey } from '@/lib/period'
import { runImport } from '@/services/import.service'
import { listCallsBetween } from '@/services/calls.repo'
import { cn } from '@/lib/utils'

type Tab = 'import' | 'export'

export function ImportExportPage() {
  const { teamView } = useDirectory()
  const [tab, setTab] = useState<Tab>('import')
  if (teamView) {
    return (
      <section className="space-y-5">
        <header>
          <h1 className="text-lg font-semibold tracking-tight">Import / Export</h1>
          <p className="text-sm text-muted-foreground">
            Réservé aux BDR. Le compte administrateur consulte les données de l’équipe dans les autres écrans.
          </p>
        </header>
      </section>
    )
  }
  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Import / Export</h1>
        <p className="text-sm text-muted-foreground">Fichiers CSV. Les données sont nettoyées avant toute écriture.</p>
      </header>

      <div className="inline-flex rounded-md border border-border p-0.5" role="tablist">
        {(['import', 'export'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-sm px-3 py-1 text-sm text-muted-foreground hover:text-foreground',
              tab === t && 'bg-accent font-medium text-foreground',
            )}
          >
            {t === 'import' ? 'Importer' : 'Exporter'}
          </button>
        ))}
      </div>

      {tab === 'import' ? <ImportPanel /> : <ExportPanel />}
    </section>
  )
}

/* ------------------------------------------------------------------ IMPORT */

type Step = 'file' | 'mapping' | 'preview' | 'done'

function ImportPanel() {
  const { user } = useAuth()
  const { phones, emails, accounts, refresh } = useDirectory()
  const [step, setStep] = useState<Step>('file')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<Mapping>({ fields: {}, phones: [], emails: [] })
  const [showManual, setShowManual] = useState(false)
  const [defaultCountry, setDefaultCountry] = useState('MG')
  const [plan, setPlan] = useState<PlannedRow[]>([])
  const [createAccounts, setCreateAccounts] = useState(true)
  const [progress, setProgress] = useState<{ stage: string; done: number; total: number } | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error('Fichier trop volumineux (5 Mo maximum).')
      return
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      delimitersToGuess: [',', ';', '\t'],
      transformHeader: (h) => h.replace(/^﻿/, '').trim(),
      complete: (res) => {
        const fields = res.meta.fields ?? []
        if (fields.length === 0 || res.data.length === 0) {
          toast.error('Fichier vide ou sans en-têtes.')
          return
        }
        if (res.data.length > MAX_IMPORT_ROWS) {
          toast.warning(`Seules les ${MAX_IMPORT_ROWS} premières lignes seront traitées.`)
        }
        setFileName(file.name)
        setHeaders(fields)
        setRows(res.data)
        setMapping(detectMapping(fields)) // correspondance pré-remplie, modifiable à la main
        setShowManual(false)
        setStep('mapping')
      },
      error: () => toast.error('Lecture du fichier impossible.'),
    })
  }

  function runPlan() {
    const existingEmails = new Set(emails.map((e) => e.address))
    const existingPhones = new Set(phones.map((p) => p.number))
    const existingAccountKeys = new Set(accounts.map((a) => normalizeText(a.name)))
    const planned = planImport(rows, {
      mapping,
      defaultCountry: defaultCountry || null,
      existingEmails,
      existingPhones,
      existingAccountKeys,
    })
    setPlan(planned)
    setStep('preview')
  }

  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { ready: 0, warning: 0, error: 0, duplicate: 0 }
    plan.forEach((r) => (c[r.status] += 1))
    return c
  }, [plan])

  const importable = plan.filter((r) => r.contact && (r.status === 'ready' || r.status === 'warning'))

  async function doImport() {
    if (!user || importable.length === 0) return
    setBusy(true)
    setProgress({ stage: 'Préparation', done: 0, total: importable.length })
    try {
      const accountIdByKey = new Map(accounts.map((a) => [normalizeText(a.name), a.id]))
      const res = await runImport(
        user.uid,
        importable.map((r) => r.contact!),
        {
          createMissingAccounts: createAccounts,
          accountIdByKey,
          onProgress: (stage, done, total) => setProgress({ stage, done, total }),
        },
      )
      await refresh()
      setResult(
        `${res.contactsCreated} contact(s) importé(s)` +
          (res.accountsCreated ? `, ${res.accountsCreated} compte(s) créé(s)` : '') +
          (res.accountsLinked ? `, ${res.accountsLinked} compte(s) existant(s) rattaché(s)` : '') +
          (res.contactsFailed ? `, ${res.contactsFailed} en échec` : '') +
          (res.phonesIncomplete
            ? `, ${res.phonesIncomplete} sans numéro (erreur d'écriture : ${res.subError ?? 'inconnue'}, voir la console F12)`
            : '') +
          '.',
      )
      setStep('done')
    } catch {
      toast.error('Import interrompu. Les lots déjà écrits sont conservés. Vérifiez la liste des contacts.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function downloadTemplate() {
    saveAs(new Blob([importTemplateCsv()], { type: 'text/csv;charset=utf-8' }), 'modele-import-contacts.csv')
  }

  function reset() {
    setStep('file')
    setRows([])
    setHeaders([])
    setPlan([])
    setResult(null)
  }

  if (step === 'file') {
    return (
      <div className="space-y-6">
        <div className="space-y-3 rounded-md border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Fichier CSV avec en-têtes (séparateur virgule ou point-virgule). 5 Mo et {MAX_IMPORT_ROWS} lignes maximum.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="mx-auto block text-sm"
            aria-label="Choisir un fichier CSV"
          />
        </div>

        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Format attendu</h2>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              Télécharger un exemple de fichier
            </Button>
          </div>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Prénom</span> et <span className="text-foreground">Nom</span> : obligatoires,
              chacun dans sa colonne.
            </li>
            <li>
              <span className="text-foreground">Téléphone</span> (et Mobile) : un numéro par cellule, ou plusieurs séparés par
              « : », « ; » ou « , ». Indicatif de préférence (+261…).
            </li>
            <li>
              <span className="text-foreground">Email</span> : un ou plusieurs emails séparés par « ; » ou un espace.
            </li>
            <li>
              <span className="text-foreground">Entreprise</span> et ses champs (site, industrie, headcount, pays, ville) :
              créent le compte. Un compte existant n'est pas modifié.
            </li>
            <li>
              <span className="text-foreground">Statut</span> : Cold, En cours, Qualifié, Disqualifié ou Ne plus contacter.
              Sinon « Cold » est appliqué.
            </li>
            <li>
              <span className="text-foreground">Headcount</span> : une plage de texte, par exemple « 11-50 ».
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Les colonnes sont reconnues automatiquement à partir de leurs en-têtes. Vous pouvez corriger la correspondance avant l'import.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'mapping') {
    const sample = (header: string | undefined): string => {
      if (!header) return ''
      const value = rows[0]?.[header]
      return value ? `ex. « ${value.length > 40 ? `${value.slice(0, 40)}…` : value} »` : ''
    }
    const selectFor = (field: MappingField) => (
      <label key={field} className="space-y-1.5">
        <span className="text-xs text-muted-foreground">{FIELD_LABELS[field]}</span>
        <FormSelect
          value={mapping.fields[field] ?? ''}
          onValueChange={(v) => setMapping((m) => ({ ...m, fields: { ...m.fields, [field]: v || undefined } }))}
          options={headers.map((h) => ({ value: h, label: h }))}
          emptyLabel="— ne pas importer —"
          ariaLabel={FIELD_LABELS[field]}
        />
        <span className="block h-4 truncate text-xs text-muted-foreground">{sample(mapping.fields[field])}</span>
      </label>
    )
    const columnsCheckboxes = (key: 'phones' | 'emails') => (
      <fieldset className="space-y-2">
        <legend className="text-xs text-muted-foreground">{FIELD_LABELS[key]}</legend>
        <div className="flex flex-wrap gap-3">
          {headers.map((h) => (
            <label key={h} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={mapping[key].includes(h)}
                onCheckedChange={(checked) =>
                  setMapping((m) => ({
                    ...m,
                    [key]: checked ? [...m[key], h] : m[key].filter((x) => x !== h),
                  }))
                }
              />
              {h}
            </label>
          ))}
        </div>
      </fieldset>
    )

    // Résumé de la correspondance détectée
    const used = new Set<string>([
      ...Object.values(mapping.fields).filter((v): v is string => !!v),
      ...mapping.phones,
      ...mapping.emails,
    ])
    const ignored = headers.filter((h) => !used.has(h))
    const summary: [string, string | undefined][] = [
      ['Nom complet (découpé)', mapping.fields.fullName],
      ['Prénom', mapping.fields.firstName],
      ['Nom', mapping.fields.lastName],
      ['Emails', mapping.emails.join(', ') || undefined],
      ['Téléphones', mapping.phones.join(', ') || undefined],
      ['Poste', mapping.fields.title],
      ['Statut', mapping.fields.status],
      ['Source', mapping.fields.source],
      ['Entreprise', mapping.fields.accountName],
      ['Site web', mapping.fields.website],
      ['Industrie', mapping.fields.industry],
      ['Headcount', mapping.fields.headcount],
      ['Pays (entreprise)', mapping.fields.accountCountry],
      ['Ville (entreprise)', mapping.fields.accountCity],
    ]
    const warnings = mappingWarnings(mapping)

    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {fileName} · {rows.length} ligne(s).{' '}
          {showManual
            ? 'Correspondance manuelle : associez chaque champ à une colonne.'
            : 'Correspondance détectée automatiquement à partir des en-têtes.'}
        </p>

        {!showManual && (
          <div className="max-w-xl space-y-4">
            <div className="rounded-md border border-border px-4">
              {summary.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm last:border-0">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={value ? 'font-medium' : 'text-muted-foreground'}>{value ?? '— non détecté —'}</span>
                </div>
              ))}
            </div>

            {ignored.length > 0 && (
              <p className="text-xs text-muted-foreground">Colonnes ignorées : {ignored.join(', ')}</p>
            )}

            {warnings.map((w) => (
              <p key={w} className="text-sm text-amber-700">
                {w}
              </p>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={reset}>
                Annuler
              </Button>
              <Button variant="outline" onClick={() => setShowManual(true)}>
                Modifier la correspondance
              </Button>
              <Button onClick={runPlan} disabled={!isMappingValid(mapping)}>
                Vérifier les données
              </Button>
            </div>
            {!isMappingValid(mapping) && (
              <p className="text-xs text-destructive">Aucune colonne de nom reconnue : utilisez « Modifier la correspondance ».</p>
            )}
          </div>
        )}

        {showManual && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-sm font-medium">Contact</h2>
              <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">{CONTACT_FIELDS.map(selectFor)}</div>
              {columnsCheckboxes('emails')}
              {columnsCheckboxes('phones')}
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-medium">Compte (entreprise)</h2>
              <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">{ACCOUNT_FIELDS.map(selectFor)}</div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowManual(false)}>
                Retour à la correspondance détectée
              </Button>
              <Button onClick={runPlan} disabled={!isMappingValid(mapping)}>
                Vérifier les données
              </Button>
            </div>
          </div>
        )}

        <label className="block max-w-xs space-y-1.5">
          <span className="text-xs text-muted-foreground">Pays par défaut (numéros sans indicatif)</span>
          <FormSelect
            value={defaultCountry}
            onValueChange={(v) => setDefaultCountry(v)}
            options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
            ariaLabel="Pays par défaut"
          />
        </label>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <Count label="Prêtes" value={counts.ready} />
          <Count label="Prêtes avec corrections" value={counts.warning} />
          <Count label="Doublons (ignorés)" value={counts.duplicate} />
          <Count label="Rejetées" value={counts.error} warn={counts.error > 0} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={createAccounts} onCheckedChange={(v) => setCreateAccounts(v === true)} />
          Créer les comptes (entreprises) qui n'existent pas encore
        </label>

        <div className="max-h-[50svh] overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Ligne</th>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Téléphones</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 font-medium">Remarques</th>
              </tr>
            </thead>
            <tbody>
              {plan.slice(0, 300).map((r, i) => (
                <tr key={`${r.line}-${i}`} className="border-b border-border last:border-0 align-top">
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.line || '—'}</td>
                  <td className="px-3 py-2">
                    {r.contact ? `${r.contact.firstName} ${r.contact.lastName}` : '—'}
                    {r.contact?.account && (
                      <span className="block text-xs text-muted-foreground">{r.contact.account.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.contact?.phones.map((p) => p.number).join(', ') || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant={r.status === 'error' ? 'destructive' : 'outline'} className="font-normal">
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.messages.join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.length > 300 && (
          <p className="text-xs text-muted-foreground">Aperçu limité aux 300 premières lignes.</p>
        )}

        {progress && (
          <div className="max-w-md space-y-1.5" role="status" aria-live="polite">
            <div className="flex justify-between text-sm">
              <span>{progress.stage}…</span>
              <span className="tabular-nums text-muted-foreground">
                {progress.done} / {progress.total} ({progress.total ? Math.round((progress.done / progress.total) * 100) : 0} %)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep('mapping')} disabled={busy}>
            Retour
          </Button>
          <Button onClick={() => void doImport()} disabled={busy || importable.length === 0}>
            Importer {importable.length} contact(s)
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">{result}</p>
      <Button variant="outline" onClick={reset}>
        Nouvel import
      </Button>
    </div>
  )
}

const STATUS_LABEL: Record<RowStatus, string> = {
  ready: 'Prête',
  warning: 'Corrigée',
  duplicate: 'Doublon',
  error: 'Rejetée',
}

function Count({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div>
      <p className={cn('text-lg font-semibold tabular-nums', warn && 'text-destructive')}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ EXPORT */

type Dataset = 'contacts' | 'accounts' | 'calls'

function ExportPanel() {
  const { user } = useAuth()
  const { contacts, accounts, phonesOf, emailsOf, accountById } = useDirectory()
  const [dataset, setDataset] = useState<Dataset>('contacts')
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [busy, setBusy] = useState(false)

  async function download() {
    if (!user) return
    setBusy(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)
      let csv: string
      let name: string

      if (dataset === 'contacts') {
        csv = contactsCsv(contacts, phonesOf, (id) => accountById(id ?? null)?.name, emailsOf)
        name = 'contacts'
      } else if (dataset === 'accounts') {
        const counts = new Map<string, number>()
        contacts.forEach((c) => c.accountId && counts.set(c.accountId, (counts.get(c.accountId) ?? 0) + 1))
        csv = accountsCsv(accounts, (id) => counts.get(id) ?? 0)
        name = 'comptes'
      } else {
        const range = periodRange(period)
        if (!range) throw new Error('Période invalide')
        const calls = await listCallsBetween(user.uid, range.start, range.end)
        const byId = new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`]))
        csv = callsCsv(calls, (id) => byId.get(id) ?? '', (id) => accountById(id ?? null)?.name)
        name = `appels-${PERIOD_LABELS[period].toLowerCase().replace(/\s+/g, '-')}`
      }

      saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}-${stamp}.csv`)
      toast.success('Export téléchargé.')
    } catch {
      toast.error('Export impossible. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Données</span>
          <FormSelect
            value={dataset}
            onValueChange={(v) => setDataset(v as Dataset)}
            options={[
              { value: 'contacts', label: `Contacts (${contacts.length})` },
              { value: 'accounts', label: `Comptes (${accounts.length})` },
              { value: 'calls', label: 'Appels (par période)' },
            ]}
            ariaLabel="Données à exporter"
          />
        </label>
        {dataset === 'calls' && (
          <label className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Période</span>
            <FormSelect
              value={period}
              onValueChange={(v) => setPeriod(v as PeriodKey)}
              options={PERIOD_KEYS.filter((k) => k !== 'custom').map((k) => ({ value: k, label: PERIOD_LABELS[k] }))}
              ariaLabel="Période"
            />
          </label>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Le fichier contient des données personnelles. Ne le transmettez que par un canal autorisé. Il est encodé en UTF-8
        avec séparateur « ; » (ouverture directe dans Excel). Les cellules commençant par =, +, - ou @ sont neutralisées.
      </p>

      <Button onClick={() => void download()} disabled={busy}>
        Télécharger le CSV
      </Button>
    </div>
  )
}
