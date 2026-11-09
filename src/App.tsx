import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from '@/app/RequireAuth'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { AccountDetailPage } from '@/features/accounts/AccountDetailPage'
import { AccountsPage } from '@/features/accounts/AccountsPage'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { ContactDetailPage } from '@/features/contacts/ContactDetailPage'
import { CadencesPage } from '@/features/cadences/CadencesPage'
import { ContactsPage } from '@/features/contacts/ContactsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ImportExportPage } from '@/features/import-export/ImportExportPage'
import { DirectoryProvider } from '@/features/directory/DirectoryProvider'
import { TodayPage } from '@/features/today/TodayPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <DirectoryProvider>
                  <AppShell />
                </DirectoryProvider>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/today" replace />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="contacts/:id" element={<ContactDetailPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="accounts/:id" element={<AccountDetailPage />} />
            <Route path="cadences" element={<CadencesPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="import-export" element={<ImportExportPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" />
    </AuthProvider>
  )
}
