// App shell: header + bottom tab navigation (mobile-first, spec 12).
import { NavLink, Outlet } from 'react-router'
import { BookText, ChartColumn, LayoutDashboard, LogOut, Plus } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useApp } from '@/lib/app-context'

const tabs = [
  { to: '/', label: 'Catat', icon: Plus, end: true },
  { to: '/buku', label: 'Buku', icon: BookText, end: false },
  { to: '/laporan', label: 'Laporan', icon: ChartColumn, end: false },
  { to: '/dompet', label: 'Dompet', icon: LayoutDashboard, end: false },
]

export function Shell() {
  const { user, setUser, pushToast } = useApp()
  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      setUser(null)
      pushToast('info', 'Berhasil keluar.')
    },
  })

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <span className="font-display text-xl font-bold tracking-tight text-ink">duit.</span>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">{user?.email}</span>
          <button
            onClick={() => logout.mutate()}
            aria-label="Keluar"
            className="rounded-lg p-2 text-muted hover:bg-linen hover:text-ink"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-3xl border-t border-line bg-surface/95 backdrop-blur">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
                isActive ? 'text-ink' : 'text-muted hover:text-ink'
              }`
            }
          >
            <t.icon className="size-5" />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
