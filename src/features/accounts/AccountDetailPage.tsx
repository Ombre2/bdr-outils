import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ExternalLink, Pencil, Trash2, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LocalTime } from '@/components/LocalTime'
import { AccountDialog } from '@/features/accounts/AccountDialog'
import { CallTimeline } from '@/features/calls/CallTimeline'
import { ContactDetailView } from '@/features/contacts/ContactDetailPage'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirectory } from '@/features/directory/DirectoryProvider'
import { countryLabel } from '@/lib/geo'
import { cn } from '@/lib/utils'
import { safeHttpsUrl } from '@/lib/text'
import { AccountHasContactsError, deleteAccount } from '@/services/accounts.repo'

const ACCOUNT_TAB = 'account'

export function AccountDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { accountById, contacts, refresh, loading, teamView, ownerEmail } = useDirectory()
  const [editing, setEditing] = useState(false)
  // Onglets ouverts : l'onglet « Compte » plus un onglet par contact ouvert
  const [openContactIds, setOpenContactIds] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<string>(ACCOUNT_TAB)

  // Changer de compte referme les onglets de contacts
  useEffect(() => {
    setOpenContactIds([])
    setActiveTab(ACCOUNT_TAB)
  }, [id])

  const account = accountById(id)
  const linkedContacts = useMemo(
    () => contacts.filter((c) => c.accountId === id),
    [contacts, id],
  )

  if (!account) {
    return (
      <p className="text-sm text-muted-foreground">
        {loading ? 'Chargement…' : 'Compte introuvable.'}{' '}
        <Link className="underline" to="/accounts">
          Retour aux comptes
        </Link>
      </p>
    )
  }

  const website = safeHttpsUrl(account.website)

  function openContact(contactId: string) {
    setOpenContactIds((prev) => (prev.includes(contactId) ? prev : [...prev, contactId]))
    setActiveTab(contactId)
  }

  function closeContact(contactId: string) {
    setOpenContactIds((prev) => prev.filter((x) => x !== contactId))
    setActiveTab((current) => (current === contactId ? ACCOUNT_TAB : current))
  }

  async function handleDelete() {
    if (!user || !window.confirm(`Supprimer le compte « ${account!.name} » ?`)) return
    try {
      await deleteAccount(user.uid, account!.id)
      await refresh()
      toast.success('Compte supprimé.')
      navigate('/accounts')
    } catch (error) {
      toast.error(
        error instanceof AccountHasContactsError ? error.message : 'Suppression impossible. Réessayez.',
      )
    }
  }

  return (
    <section className="space-y-6">
      <Link to="/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Comptes
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">{account.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[account.industry, countryLabel(account.country), account.city].filter(Boolean).join(' · ') || '—'}
          </p>
          {teamView && <p className="text-sm text-muted-foreground">Propriétaire : {ownerEmail(account.ownerId) ?? '—'}</p>}
        </div>
        <div className="flex gap-2">
          {!teamView && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" aria-hidden /> Modifier
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleDelete()} aria-label="Supprimer le compte">
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Barre d'onglets : Compte + un onglet par contact ouvert */}
      {openContactIds.length > 0 && (
        <div className="flex flex-wrap items-end gap-1 border-b border-border" role="tablist">
          <TabButton active={activeTab === ACCOUNT_TAB} onClick={() => setActiveTab(ACCOUNT_TAB)}>
            Compte
          </TabButton>
          {openContactIds.map((contactId) => {
            const c = contacts.find((x) => x.id === contactId)
            return (
              <div key={contactId} className="flex items-end">
                <TabButton active={activeTab === contactId} onClick={() => setActiveTab(contactId)}>
                  {c ? `${c.firstName} ${c.lastName}` : 'Contact'}
                </TabButton>
                <button
                  type="button"
                  onClick={() => closeContact(contactId)}
                  aria-label="Fermer cet onglet"
                  className="mb-1 ml-0.5 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {activeTab !== ACCOUNT_TAB ? (
        <ContactDetailView id={activeTab} embedded onDeleted={() => closeContact(activeTab)} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-md border border-border p-4 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Site web</dt>
              <dd>
                {website ? (
                  <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                    {account.website} <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Headcount</dt>
              <dd className="tabular-nums">{account.headcount ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Heure locale</dt>
              <dd>
                <LocalTime timezone={account.timezone} />
              </dd>
            </div>
            <div className="col-span-2 md:col-span-4">
              <dt className="text-xs text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-line">{account.description ?? '—'}</dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h2 className="text-sm font-medium">Contacts ({linkedContacts.length})</h2>
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Nom</TableHead>
                    <TableHead>Poste</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linkedContacts.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => openContact(c.id)}>
                      <TableCell className="font-medium">
                        {c.firstName} {c.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.title ?? '—'}</TableCell>
                      <TableCell>{c.status}</TableCell>
                    </TableRow>
                  ))}
                  {linkedContacts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                        Aucun contact dans ce compte.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-medium">Historique des appels</h2>
            <CallTimeline ownerId={account.ownerId} accountId={account.id} reloadKey={0} showContact />
          </div>
        </>
      )}

      <AccountDialog
        open={editing}
        onOpenChange={setEditing}
        ownerId={user?.uid ?? ''}
        account={account}
        onSaved={() => void refresh()}
      />
    </section>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
        active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
