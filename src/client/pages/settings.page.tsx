// Pengaturan page: jenis (categories), tag, anggaran bulanan, recurring rules, ganti password.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { FREQUENCY_LABELS, PALETTE } from '@shared/constants'
import type { PaletteColor } from '@shared/constants'
import { monthKeyOf, todayIn } from '@shared/domain/dates'
import { formatRupiah } from '@shared/domain/money'
import { ApiError, api } from '@/lib/api'
import { Button, CategoryDot, Field, Input, PageSpinner, Select } from '@/components/ui/primitives'
import { AmountInput } from '@/components/ui/amount-input'
import { useApp } from '@/lib/app-context'
import type { BudgetRow, Category, RecurringRule, Tag } from '@/lib/types'

export function PengaturanPage() {
  return (
    <div className="space-y-8">
      <h1 className="font-display text-xl font-semibold text-ink">Pengaturan</h1>
      <CategoriesSection />
      <TagsSection />
      <BudgetsSection />
      <RecurringSection />
      <PasswordSection />
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">{children}</h2>
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Gagal, coba lagi.'
}

// ---------------------------------------------------------------- Categories
function CategoriesSection() {
  const { pushToast } = useApp()
  const queryClient = useQueryClient()
  const cats = useQuery({
    queryKey: ['categories-all'],
    queryFn: () => api.get<{ items: Category[] }>('/categories?includeArchived=true'),
  })
  const [name, setName] = useState('')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [color, setColor] = useState<PaletteColor>('sage')

  const add = useMutation({
    mutationFn: () => api.post('/categories', { name, kind, color }),
    onSuccess: () => {
      setName('')
      queryClient.invalidateQueries()
      pushToast('success', 'Jenis ditambahkan.')
    },
    onError: (e) => pushToast('error', errMessage(e)),
  })

  const toggleArchive = useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) =>
      api.patch(`/categories/${id}`, { isArchived: !isArchived }),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (e) => pushToast('error', errMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries()
      pushToast('success', 'Jenis dihapus.')
    },
    onError: (e) => pushToast('error', errMessage(e)),
  })

  if (cats.isPending) return <PageSpinner />
  const items = cats.data?.items ?? []

  return (
    <section aria-label="Jenis">
      <SectionTitle>Jenis (kategori)</SectionTitle>
      <ul className="mb-3 space-y-1.5">
        {items.map((c) => (
          <li
            key={c.id}
            className={`flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 ${c.isArchived ? 'opacity-50' : ''}`}
          >
            <CategoryDot color={c.color} />
            <span className="flex-1 truncate text-sm text-ink">{c.name}</span>
            <span className="text-[11px] uppercase text-muted">
              {c.kind === 'income' ? 'masuk' : 'keluar'}
            </span>
            <button
              onClick={() => toggleArchive.mutate({ id: c.id, isArchived: c.isArchived })}
              className="rounded-lg p-1.5 text-xs text-muted hover:text-ink"
            >
              {c.isArchived ? 'Pulihkan' : 'Arsip'}
            </button>
            <button
              onClick={() => remove.mutate(c.id)}
              aria-label={`Hapus ${c.name}`}
              className="rounded-lg p-1.5 text-muted hover:text-clay"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-[1fr_90px_100px_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) add.mutate()
        }}
      >
        <Input
          placeholder="Nama jenis baru"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as 'expense' | 'income')}
          aria-label="Tipe jenis"
        >
          <option value="expense">Keluar</option>
          <option value="income">Masuk</option>
        </Select>
        <Select
          value={color}
          onChange={(e) => setColor(e.target.value as PaletteColor)}
          aria-label="Warna jenis"
        >
          {(Object.keys(PALETTE) as PaletteColor[]).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Button type="submit" disabled={add.isPending}>
          <Plus className="size-4" />
        </Button>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------- Tags
function TagsSection() {
  const { pushToast } = useApp()
  const queryClient = useQueryClient()
  const tags = useQuery({ queryKey: ['tags'], queryFn: () => api.get<{ items: Tag[] }>('/tags') })
  const [name, setName] = useState('')

  const add = useMutation({
    mutationFn: () => api.post('/tags', { name }),
    onSuccess: () => {
      setName('')
      queryClient.invalidateQueries()
    },
    onError: (e) => pushToast('error', errMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/tags/${id}`),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (e) => pushToast('error', errMessage(e)),
  })

  return (
    <section aria-label="Tag">
      <SectionTitle>Tag</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(tags.data?.items ?? []).map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink"
          >
            #{t.name}
            <button
              onClick={() => remove.mutate(t.id)}
              aria-label={`Hapus tag ${t.name}`}
              className="text-muted hover:text-clay"
            >
              ×
            </button>
          </span>
        ))}
        {(tags.data?.items ?? []).length === 0 && <p className="text-xs text-muted">Belum ada tag.</p>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) add.mutate()
        }}
      >
        <Input placeholder="Tag baru" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={add.isPending}>
          Tambah
        </Button>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------- Budgets
function BudgetsSection() {
  const { pushToast } = useApp()
  const queryClient = useQueryClient()
  const month = monthKeyOf(todayIn('Asia/Jakarta'))
  const budgets = useQuery({
    queryKey: ['budgets', month],
    queryFn: () => api.get<{ items: BudgetRow[] }>(`/budgets?month=${month}`),
  })
  const cats = useQuery({
    queryKey: ['categories-all'],
    queryFn: () => api.get<{ items: Category[] }>('/categories?includeArchived=false&kind=expense'),
  })
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState<number | null>(null)

  const upsert = useMutation({
    mutationFn: () => api.put(`/budgets/${categoryId}`, { amount }),
    onSuccess: () => {
      setCategoryId('')
      setAmount(null)
      queryClient.invalidateQueries()
      pushToast('success', 'Anggaran disimpan.')
    },
    onError: (e) => pushToast('error', errMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (catId: string) => api.del(`/budgets/${catId}`),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (e) => pushToast('error', errMessage(e)),
  })

  const budgetedIds = new Set((budgets.data?.items ?? []).map((b) => b.categoryId))
  const selectable = (cats.data?.items ?? []).filter((c) => !budgetedIds.has(c.id))

  return (
    <section aria-label="Anggaran">
      <SectionTitle>Anggaran bulanan</SectionTitle>
      <ul className="mb-3 space-y-1.5">
        {(budgets.data?.items ?? []).map((b) => (
          <li
            key={b.categoryId}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm"
          >
            <CategoryDot color={b.color} />
            <span className="flex-1 truncate text-ink">{b.name}</span>
            <span
              className={`tabular-nums ${b.status === 'over' ? 'text-clay' : b.status === 'warning' ? 'text-ochre' : 'text-muted'}`}
            >
              {formatRupiah(b.spent)} / {formatRupiah(b.limit)}
            </span>
            <button
              onClick={() => remove.mutate(b.categoryId)}
              aria-label={`Hapus anggaran ${b.name}`}
              className="p-1 text-muted hover:text-clay"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {(budgets.data?.items ?? []).length === 0 && (
          <p className="text-xs text-muted">Belum ada anggaran.</p>
        )}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Jenis untuk anggaran"
        >
          <option value="">Pilih jenis…</option>
          {selectable.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <AmountInput value={amount} onChange={setAmount} />
      </div>
      <Button
        className="mt-2 w-full"
        variant="secondary"
        disabled={!categoryId || !amount || amount <= 0 || upsert.isPending}
        onClick={() => upsert.mutate()}
      >
        Simpan anggaran
      </Button>
    </section>
  )
}

// ---------------------------------------------------------------- Recurring
function RecurringSection() {
  const { pushToast } = useApp()
  const queryClient = useQueryClient()
  const rules = useQuery({
    queryKey: ['recurring'],
    queryFn: () => api.get<{ items: RecurringRule[] }>('/recurring'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/recurring/${id}`, { isActive: !isActive }),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (e) => pushToast('error', errMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/recurring/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries()
      pushToast('success', 'Aturan berulang dihapus.')
    },
    onError: (e) => pushToast('error', errMessage(e)),
  })
  const runNow = useMutation({
    mutationFn: () => api.post<{ created: number }>('/recurring/process'),
    onSuccess: (res) => {
      queryClient.invalidateQueries()
      pushToast(
        'success',
        res.created > 0 ? `${res.created} transaksi dibuat.` : 'Tidak ada yang jatuh tempo.',
      )
    },
    onError: (e) => pushToast('error', errMessage(e)),
  })

  return (
    <section aria-label="Transaksi berulang">
      <div className="mb-3 flex items-center justify-between">
        <SectionTitle>Transaksi berulang</SectionTitle>
        <button
          onClick={() => runNow.mutate()}
          className="text-xs text-indigo underline-offset-2 hover:underline"
        >
          Proses sekarang
        </button>
      </div>
      <ul className="space-y-1.5">
        {(rules.data?.items ?? []).map((r) => (
          <li
            key={r.id}
            className={`flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm ${r.isActive ? '' : 'opacity-50'}`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-ink">
                {FREQUENCY_LABELS[r.frequency]} · {formatRupiah(r.amount)}
              </p>
              <p className="text-xs text-muted">Berikutnya: {r.nextRunDate}</p>
            </div>
            <button
              onClick={() => toggle.mutate({ id: r.id, isActive: r.isActive })}
              className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-linen hover:text-ink"
            >
              {r.isActive ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
            <button
              onClick={() => remove.mutate(r.id)}
              aria-label="Hapus aturan"
              className="p-1 text-muted hover:text-clay"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {(rules.data?.items ?? []).length === 0 && (
          <p className="text-xs text-muted">Belum ada aturan berulang.</p>
        )}
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- Password
function PasswordSection() {
  const { pushToast } = useApp()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)

  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setError(null)
      pushToast('success', 'Password diganti.')
    },
    onError: (e) => setError(errMessage(e)),
  })

  return (
    <section aria-label="Ganti password">
      <SectionTitle>Ganti password</SectionTitle>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (current && next.length >= 8) change.mutate()
        }}
      >
        <Field label="Password saat ini">
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field label="Password baru (min. 8 karakter)">
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={8}
          />
        </Field>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <Button type="submit" variant="secondary" disabled={change.isPending}>
          {change.isPending ? 'Menyimpan…' : 'Ganti password'}
        </Button>
      </form>
    </section>
  )
}
