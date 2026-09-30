// Laporan page (spec 12.6): monthly summary, category breakdown bars, trend sparkline, budgets, CSV export.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { PALETTE } from '@shared/constants'
import { monthKeyOf, shortMonthName, todayIn } from '@shared/domain/dates'
import { formatRupiah, formatRupiahCompact } from '@shared/domain/money'
import { api } from '@/lib/api'
import { Button, CategoryDot, EmptyState, PageSpinner } from '@/components/ui/primitives'
import type { ReportSummary, TrendPoint } from '@/lib/types'

export function LaporanPage() {
  const [month, setMonth] = useState(() => monthKeyOf(todayIn('Asia/Jakarta')))

  const summary = useQuery({
    queryKey: ['report', month],
    queryFn: () => api.get<ReportSummary>(`/reports/summary?month=${month}`),
  })
  const trend = useQuery({
    queryKey: ['trend'],
    queryFn: () => api.get<{ items: TrendPoint[] }>('/reports/trend?months=6'),
  })

  if (summary.isPending) return <PageSpinner />
  if (summary.isError || !summary.data) return <p className="text-sm text-clay">Gagal memuat laporan.</p>
  const r = summary.data

  const maxExpense = Math.max(1, ...r.byCategory.map((c) => c.total))
  const trendMax = Math.max(1, ...(trend.data?.items ?? []).flatMap((t) => [t.income, t.expense]))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Laporan {shortMonthName(month)}</h1>
        <select
          aria-label="Pilih bulan"
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          {(trend.data?.items ?? []).map((t) => (
            <option key={t.month} value={t.month}>
              {shortMonthName(t.month)}
            </option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Masuk</p>
          <p className="font-display text-sm font-semibold tabular-nums text-sage">
            {formatRupiahCompact(r.income)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Keluar</p>
          <p className="font-display text-sm font-semibold tabular-nums text-clay">
            {formatRupiahCompact(r.expense)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Sisa</p>
          <p className="font-display text-sm font-semibold tabular-nums text-ink">
            {formatRupiahCompact(r.net)}
          </p>
        </div>
      </section>

      {/* Insight line */}
      <p className="text-xs text-muted">
        Rata-rata harian {formatRupiah(r.avgDailyExpense)}
        {r.projectedExpense != null ? <> · proyeksi akhir bulan {formatRupiah(r.projectedExpense)}</> : null}
        {r.expenseChangePercent != null ? (
          <>
            {' '}
            · {r.expenseChangePercent > 0 ? '+' : ''}
            {r.expenseChangePercent}% vs bulan lalu
          </>
        ) : null}
      </p>

      {/* Trend bars */}
      {trend.data && trend.data.items.length > 0 && (
        <section aria-label="Tren 6 bulan">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Tren 6 bulan</h2>
          <div
            className="flex items-end gap-2 rounded-xl border border-line bg-surface p-3"
            style={{ height: 120 }}
          >
            {trend.data.items.map((t) => (
              <div key={t.month} className="flex flex-1 flex-col items-center gap-1 self-stretch justify-end">
                <div className="flex w-full items-end justify-center gap-0.5 self-stretch">
                  <div
                    className="w-1/3 rounded-t bg-sage/70"
                    style={{ height: `${Math.max(2, (t.income / trendMax) * 100)}%` }}
                    title={`Masuk ${formatRupiah(t.income)}`}
                  />
                  <div
                    className="w-1/3 rounded-t bg-clay/70"
                    style={{ height: `${Math.max(2, (t.expense / trendMax) * 100)}%` }}
                    title={`Keluar ${formatRupiah(t.expense)}`}
                  />
                </div>
                <span className="text-[10px] text-muted">{t.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* By category */}
      <section aria-label="Pengeluaran per jenis">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Pengeluaran per jenis</h2>
        {r.byCategory.length === 0 ? (
          <EmptyState title="Belum ada pengeluaran bulan ini" />
        ) : (
          <ul className="space-y-2">
            {r.byCategory.map((c) => (
              <li key={c.categoryId} className="rounded-xl border border-line bg-surface p-3">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <CategoryDot color={c.color} /> {c.name}
                  </span>
                  <span className="tabular-nums font-medium text-ink">{formatRupiah(c.total)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-linen">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(c.total / maxExpense) * 100}%`,
                      backgroundColor: PALETTE[c.color as keyof typeof PALETTE] ?? '#8C8880',
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Budgets */}
      {r.budgets.length > 0 && (
        <section aria-label="Anggaran">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Anggaran</h2>
          <ul className="space-y-2">
            {r.budgets.map((b) => (
              <li key={b.categoryId} className="rounded-xl border border-line bg-surface p-3">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink">
                    <CategoryDot color={b.color} /> {b.name}
                  </span>
                  <span
                    className={`tabular-nums ${b.status === 'over' ? 'text-clay' : b.status === 'warning' ? 'text-ochre' : 'text-muted'}`}
                  >
                    {formatRupiah(b.spent)} / {formatRupiah(b.limit)} ({b.percent}%)
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-linen">
                  <div
                    className={`h-full rounded-full ${b.status === 'over' ? 'bg-clay' : b.status === 'warning' ? 'bg-ochre' : 'bg-sage'}`}
                    style={{ width: `${Math.min(100, b.percent)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Top expenses */}
      {r.topExpenses.length > 0 && (
        <section aria-label="Pengeluaran terbesar">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Terbesar bulan ini</h2>
          <ul className="space-y-1.5">
            {r.topExpenses.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-ink">
                  <CategoryDot color={t.categoryColor} /> {t.categoryName ?? '—'}
                  {t.note ? <span className="text-muted"> · {t.note}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums font-medium">{formatRupiah(t.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <a href={`/api/export/transactions.csv?from=${month}-01&to=${month}-28`} download>
        <Button variant="secondary" className="w-full">
          <Download className="size-4" /> Unduh CSV bulan ini
        </Button>
      </a>
    </div>
  )
}
