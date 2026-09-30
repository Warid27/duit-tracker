// Dompet page (spec 12.7): wallet list with balances, add/edit/set-balance/archive/delete.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Wallet as WalletIcon } from 'lucide-react'
import { PALETTE, WALLET_KINDS, WALLET_KIND_LABELS } from '@shared/constants'
import type { PaletteColor, WalletKind } from '@shared/constants'
import { formatRupiah } from '@shared/domain/money'
import { ApiError, api } from '@/lib/api'
import { Button, Field, Input, Modal, PageSpinner, Select } from '@/components/ui/primitives'
import { AmountInput } from '@/components/ui/amount-input'
import { useApp } from '@/lib/app-context'
import type { Wallet } from '@/lib/types'

export function DompetPage() {
  const { pushToast } = useApp()
  const queryClient = useQueryClient()
  const wallets = useQuery({
    queryKey: ['wallets'],
    queryFn: () => api.get<{ items: Wallet[]; total: number }>('/wallets?includeArchived=true'),
  })

  const [editing, setEditing] = useState<Wallet | 'new' | null>(null)

  if (wallets.isPending) return <PageSpinner />
  if (wallets.isError || !wallets.data) return <p className="text-sm text-clay">Gagal memuat dompet.</p>

  const active = wallets.data.items.filter((w) => !w.isArchived)
  const archived = wallets.data.items.filter((w) => w.isArchived)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Dompet</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Tambah
        </Button>
      </div>

      <div className="rounded-2xl bg-ink p-4 text-paper">
        <p className="text-[11px] uppercase tracking-wide opacity-70">Total saldo</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums">
          {formatRupiah(wallets.data.total)}
        </p>
      </div>

      <ul className="space-y-2">
        {active.map((w) => (
          <WalletRow key={w.id} wallet={w} onEdit={() => setEditing(w)} />
        ))}
      </ul>

      {archived.length > 0 && (
        <section aria-label="Dompet arsip">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Arsip</h2>
          <ul className="space-y-2 opacity-60">
            {archived.map((w) => (
              <WalletRow key={w.id} wallet={w} onEdit={() => setEditing(w)} />
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Dompet baru' : 'Ubah dompet'}
      >
        {editing && (
          <WalletForm
            wallet={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null)
              queryClient.invalidateQueries()
            }}
            onError={(m) => pushToast('error', m)}
          />
        )}
      </Modal>
    </div>
  )
}

function WalletRow({ wallet, onEdit }: { wallet: Wallet; onEdit: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-3">
      <span
        className="flex size-9 items-center justify-center rounded-full"
        style={{
          backgroundColor: `var(--color-${wallet.color}, #8C8880)22`,
          color: `var(--color-${wallet.color})`,
        }}
      >
        <WalletIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{wallet.name}</p>
        <p className="text-xs text-muted">
          {WALLET_KIND_LABELS[wallet.kind as WalletKind] ?? wallet.kind}
          {wallet.isArchived ? ' · diarsipkan' : ''}
        </p>
      </div>
      <span className="tabular-nums text-sm font-semibold text-ink">{formatRupiah(wallet.balance)}</span>
      <button
        onClick={onEdit}
        aria-label={`Ubah ${wallet.name}`}
        className="rounded-lg p-1.5 text-muted hover:bg-linen hover:text-ink"
      >
        <Pencil className="size-4" />
      </button>
    </li>
  )
}

function WalletForm({
  wallet,
  onSaved,
  onError,
}: {
  wallet: Wallet | null
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const { pushToast } = useApp()
  const queryClient = useQueryClient()
  const [name, setName] = useState(wallet?.name ?? '')
  const [kind, setKind] = useState<string>(wallet?.kind ?? 'cash')
  const [color, setColor] = useState<string>(wallet?.color ?? 'sage')
  const [balance, setBalance] = useState<number | null>(wallet ? wallet.balance : 0)
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (wallet) {
        await api.patch(`/wallets/${wallet.id}`, { name, kind, color, isArchived: wallet.isArchived })
        if (balance != null && balance !== wallet.balance) {
          await api.put(`/wallets/${wallet.id}/balance`, { currentBalance: balance })
        }
      } else {
        await api.post('/wallets', { name, kind, color, currentBalance: balance ?? 0 })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries()
      pushToast('success', 'Tersimpan.')
      onSaved()
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Gagal menyimpan.'
      setError(msg)
      onError(msg)
    },
  })

  const archive = useMutation({
    mutationFn: () => api.del(`/wallets/${wallet!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries()
      pushToast('success', 'Dompet dihapus.')
      onSaved()
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'Gagal menghapus (masih dipakai transaksi?).'),
  })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) save.mutate()
      }}
    >
      <Field label="Nama">
        <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Jenis">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {WALLET_KINDS.map((k) => (
              <option key={k} value={k}>
                {WALLET_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Warna">
          <Select value={color} onChange={(e) => setColor(e.target.value)}>
            {(Object.keys(PALETTE) as PaletteColor[]).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={wallet ? 'Saldo saat ini' : 'Saldo awal'}>
        <AmountInput value={balance} onChange={setBalance} allowNegative />
      </Field>

      {error ? <p className="text-sm text-clay">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={save.isPending}>
          {save.isPending ? 'Menyimpan…' : 'Simpan'}
        </Button>
        {wallet && (
          <Button
            type="button"
            variant="danger"
            disabled={archive.isPending}
            onClick={() => archive.mutate()}
          >
            Hapus
          </Button>
        )}
      </div>
    </form>
  )
}
