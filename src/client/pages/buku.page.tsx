// Buku page (spec 12.5): month navigation, filters, grouped transaction list, edit/delete modal.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { daysInMonth, monthKeyOf, shortMonthName, todayIn } from '@shared/domain/dates'
import { formatRupiah } from '@shared/domain/money'
import { api } from '@/lib/api'
import { Button, EmptyState, Input, Modal, PageSpinner, Select } from '@/components/ui/primitives'
import { TransactionItem } from '@/features/transactions/transaction-item'
import { TransactionForm } from '@/features/transactions/transaction-form'
import { useBootstrap } from '@/lib/bootstrap'
import { useApp } from '@/lib/app-context'
import type { TransactionListResult, TxDetail } from '@/lib/types'

export function BukuPage() {
  const timezone = 'Asia/Jakarta'
  const { pushToast } = useApp()
  const queryClient = useQueryClient()
  const bootstrap = useBootstrap()

  const [month, setMonth] = useState(() => monthKeyOf(todayIn(timezone)))
  const [typeFilter, setTypeFilter] = useState('')
  const [walletFilter, setWalletFilter] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<TxDetail | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TxDetail | null>(null)

  function shiftMonth(key: string, delta: number): string {
    const y = Number(key.slice(0, 4))
    const m = Number(key.slice(5, 7)) + delta
    return `${String(y + Math.floor((m - 1) / 12)).padStart(4, '0')}-${String(((m - 1) % 12) + 1).padStart(2, '0')}`
  }

  const first = `${month}-01`
  const last = `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))).padStart(2, '0')}`

  const list = useQuery({
    queryKey: ['transactions', { month, typeFilter, walletFilter, q, page }],
    queryFn: () => {
      const params = new URLSearchParams({ from: first, to: last, page: String(page), pageSize: '30' })
      if (typeFilter) params.set('type', typeFilter)
      if (walletFilter) params.set('walletId', walletFilter)
      if (q.trim()) params.set('q', q.trim())
      return api.get<TransactionListResult>(`/transactions?${params.toString()}`)
    },
  })

  const del = useMutation({
    mutationFn: (id: string) => api.del(`/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries()
      setConfirmDelete(null)
      pushToast('success', 'Transaksi dihapus.')
    },
    onError: () => pushToast('error', 'Gagal menghapus.'),
  })

  // Group items by date desc.
  const groups: [string, TxDetail[]][] = []
  if (list.data) {
    let current: string | null = null
    for (const tx of list.data.items) {
      if (tx.occurredOn !== current) {
        current = tx.occurredOn
        groups.push([current, []])
      }
      groups[groups.length - 1]?.[1].push(tx)
    }
  }

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button
          aria-label="Bulan sebelumnya"
          className="rounded-lg p-2 text-muted hover:bg-linen hover:text-ink"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
        >
          <ChevronLeft className="size-5" />
        </button>
        <h1 className="font-display text-lg font-semibold text-ink">{shortMonthName(month)}</h1>
        <button
          aria-label="Bulan berikutnya"
          className="rounded-lg p-2 text-muted hover:bg-linen hover:text-ink disabled:opacity-30"
          disabled={month >= monthKeyOf(todayIn(timezone))}
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Totals */}
      {list.data && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Masuk</p>
            <p className="font-display text-base font-semibold tabular-nums text-sage">
              {formatRupiah(list.data.totals.income)}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Keluar</p>
            <p className="font-display text-base font-semibold tabular-nums text-clay">
              {formatRupiah(list.data.totals.expense)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value)
            setPage(1)
          }}
          aria-label="Filter tipe"
        >
          <option value="">Semua tipe</option>
          <option value="income">Masuk</option>
          <option value="expense">Keluar</option>
          <option value="transfer">Pindah</option>
        </Select>
        <Select
          value={walletFilter}
          onChange={(e) => {
            setWalletFilter(e.target.value)
            setPage(1)
          }}
          aria-label="Filter dompet"
        >
          <option value="">Semua dompet</option>
          {bootstrap.data?.wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Cari catatan…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          aria-label="Cari"
        />
      </div>

      {/* List */}
      {list.isPending ? (
        <PageSpinner />
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyState title="Tidak ada transaksi" hint="Ubah filter atau bulan, atau catat di tab Catat." />
      ) : (
        <div className="space-y-4">
          {groups.map(([date, items]) => (
            <section key={date} aria-label={`Tanggal ${date}`}>
              <h2 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted">{date}</h2>
              <ul className="space-y-1.5">
                {items.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    tx={tx}
                    onEdit={(t) => setEditing(t)}
                    onDelete={(t) => setConfirmDelete(t)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Sebelumnya
          </Button>
          <span className="text-sm text-muted tabular-nums">
            {page}/{totalPages}
          </span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Berikutnya
          </Button>
        </div>
      )}

      {/* Edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Ubah transaksi">
        {editing && bootstrap.data && (
          <TransactionForm
            data={bootstrap.data}
            timezone={timezone}
            editing={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Hapus transaksi?">
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm text-ink">
              {formatRupiah(confirmDelete.amount)} · {confirmDelete.categoryName ?? confirmDelete.type} ·{' '}
              {confirmDelete.occurredOn}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>
                Batal
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={del.isPending}
                onClick={() => del.mutate(confirmDelete.id)}
              >
                {del.isPending ? 'Menghapus…' : 'Hapus'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
