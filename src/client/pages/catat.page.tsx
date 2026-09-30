// Catat page (spec 12.4): the default screen — quick entry form + today summary + recent list.
import { formatRupiah } from '@shared/domain/money'
import { PageSpinner } from '@/components/ui/primitives'
import { TransactionForm } from '@/features/transactions/transaction-form'
import { TransactionItem } from '@/features/transactions/transaction-item'
import { useBootstrap } from '@/lib/bootstrap'

export function CatatPage() {
  const { data, isPending, isError } = useBootstrap()

  if (isPending) return <PageSpinner />
  if (isError || !data) return <p className="text-sm text-clay">Gagal memuat data. Muat ulang halaman.</p>

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <section className="grid grid-cols-3 gap-2" aria-label="Ringkasan">
        <div className="rounded-xl bg-surface border border-line p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Saldo</p>
          <p className="mt-1 truncate font-display text-base font-semibold tabular-nums text-ink">
            {formatRupiah(data.totalBalance)}
          </p>
        </div>
        <div className="rounded-xl bg-surface border border-line p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Hari ini</p>
          <p className="mt-1 truncate font-display text-base font-semibold tabular-nums text-clay">
            {formatRupiah(data.todayExpense)}
          </p>
        </div>
        <div className="rounded-xl bg-surface border border-line p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Bulan ini</p>
          <p className="mt-1 truncate font-display text-base font-semibold tabular-nums text-ink">
            {formatRupiah(data.monthExpense)}
          </p>
        </div>
      </section>

      {/* Entry form */}
      <section aria-label="Catat transaksi baru">
        <TransactionForm data={data} timezone="Asia/Jakarta" />
      </section>

      {/* Recent transactions */}
      <section aria-label="Transaksi terakhir">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Terakhir dicatat</h2>
        {data.recent.length === 0 ? (
          <p className="text-sm text-muted">Belum ada transaksi. Mulai catat di atas ✍️</p>
        ) : (
          <ul className="space-y-1.5">
            {data.recent.map((tx) => (
              <TransactionItem key={tx.id} tx={tx} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
