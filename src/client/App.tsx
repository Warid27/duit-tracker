// Root component: providers, auth gate, routing (spec 12).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { AppContext, type Toast } from '@/lib/app-context'
import type { SessionUser } from '@/lib/types'
import { Shell } from '@/components/layout/shell'
import { AuthPage } from '@/pages/auth.page'
import { CatatPage } from '@/pages/catat.page'
import { BukuPage } from '@/pages/buku.page'
import { LaporanPage } from '@/pages/laporan.page'
import { DompetPage } from '@/pages/dompet.page'
import { PengaturanPage } from '@/pages/settings.page'

let toastSeq = 0

export function App() {
  const queryClient = useMemo(() => new QueryClient(), [])
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState<SessionUser | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = ++toastSeq
      setToasts((ts) => [...ts.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismissToast(id), 4000)
    },
    [dismissToast],
  )

  // Restore session on load (httpOnly cookie; 401 -> show login).
  useEffect(() => {
    api
      .get<SessionUser>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setBooting(false))
  }, [])

  const ctx = useMemo(
    () => ({ user, setUser, toasts, pushToast, dismissToast }),
    [user, toasts, pushToast, dismissToast],
  )

  if (booting) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="inline-block size-6 animate-spin rounded-full border-2 border-line border-t-ink" />
      </div>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={ctx}>
        <BrowserRouter>
          <Routes>
            {user ? (
              <>
                <Route element={<Shell />}>
                  <Route path="/" element={<CatatPage />} />
                  <Route path="/buku" element={<BukuPage />} />
                  <Route path="/laporan" element={<LaporanPage />} />
                  <Route path="/dompet" element={<DompetPage />} />
                  <Route path="/pengaturan" element={<PengaturanPage />} />
                </Route>
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <>
                <Route path="/login" element={<AuthPage />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </>
            )}
          </Routes>
        </BrowserRouter>

        {/* Toasts */}
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-md flex-col gap-2 px-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm shadow-lg"
            >
              {t.kind === 'success' ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sage" />
              ) : t.kind === 'error' ? (
                <XCircle className="mt-0.5 size-4 shrink-0 text-clay" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0 text-indigo" />
              )}
              <span className="text-ink">{t.message}</span>
              <button
                onClick={() => dismissToast(t.id)}
                aria-label="Tutup notifikasi"
                className="ml-auto text-muted hover:text-ink"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </AppContext.Provider>
    </QueryClientProvider>
  )
}
