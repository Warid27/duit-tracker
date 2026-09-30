// Transaction row item used in Buku and Catat recent list.
import { Pencil, Trash2 } from 'lucide-react'
import { formatRupiah } from '@shared/domain/money'
import { shortDateLabel } from '@shared/domain/dates'
import { TRANSACTION_TYPE_LABELS } from '@shared/constants'
import { CategoryDot } from '@/components/ui/primitives'
import type { TxDetail } from '@/lib/types'

export function TransactionItem({
  tx,
  onEdit,
  onDelete,
}: {
  tx: TxDetail
  onEdit?: (tx: TxDetail) => void
  onDelete?: (tx: TxDetail) => void
}) {
  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''
  const amountClass = tx.type === 'income' ? 'text-sage' : tx.type === 'expense' ? 'text-ink' : 'text-indigo'
  return (
    <li className="group flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <CategoryDot color={tx.categoryColor} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {tx.categoryName ?? TRANSACTION_TYPE_LABELS[tx.type]}
          {tx.note ? <span className="ml-1.5 font-normal text-muted">· {tx.note}</span> : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted tabular-nums">
          {shortDateLabel(tx.occurredOn)} · {tx.walletName}
          {tx.toWalletName ? ` → ${tx.toWalletName}` : ''}
          {tx.tagNames.length > 0 ? ` · ${tx.tagNames.map((t) => `#${t}`).join(' ')}` : ''}
        </p>
      </div>
      <span className={`shrink-0 text-right text-sm font-semibold tabular-nums ${amountClass}`}>
        {sign}
        {formatRupiah(tx.amount)}
      </span>
      {(onEdit || onDelete) && (
        <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
          {onEdit && (
            <button
              onClick={() => onEdit(tx)}
              aria-label="Ubah transaksi"
              className="rounded-lg p-1.5 text-muted hover:bg-linen hover:text-ink"
            >
              <Pencil className="size-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(tx)}
              aria-label="Hapus transaksi"
              className="rounded-lg p-1.5 text-muted hover:bg-linen hover:text-clay"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      )}
    </li>
  )
}
