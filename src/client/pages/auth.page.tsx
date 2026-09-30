// Auth page: login + register in one screen (spec 12.3). No tokens stored client-side.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button, Field, Input } from '@/components/ui/primitives'
import { useApp } from '@/lib/app-context'
import type { AppConfig, SessionUser } from '@/lib/types'

export function AuthPage() {
  const { setUser, pushToast } = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AppConfig>('/config'),
    staleTime: 300_000,
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login'
      const user = await api.post<SessionUser>(path, {
        email,
        password,
        ...(mode === 'register' && name ? { name } : {}),
      })
      setUser(user)
      if (mode === 'register') pushToast('success', 'Akun dibuat. Selamat datang!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal, coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <h1 className="mb-1 font-display text-3xl font-bold text-ink">duit.</h1>
      <p className="mb-6 text-sm text-muted">Catat pengeluaranmu, tanpa ribet.</p>

      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {mode === 'register' && (
          <Field label="Nama (opsional)">
            <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label="Password">
          <Input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'register' ? 8 : 1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error ? <p className="text-sm text-clay">{error}</p> : null}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Daftar'}
        </Button>
      </form>

      {config.data?.registrationEnabled !== false && (
        <button
          className="mt-4 text-center text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
        </button>
      )}
    </div>
  )
}
