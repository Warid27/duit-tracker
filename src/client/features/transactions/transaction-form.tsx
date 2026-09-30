// Transaction form (Catat + edit modal). Implements spec 12.4 & BR-01..04.
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MAX_NOTE_LENGTH, MAX_TAGS_PER_TX, TRANSACTION_TYPE_LABELS } from '@shared/constants'
import type { TransactionType } from '@shared/constants'
import { todayIn } from '@shared/domain/dates'
import { ApiError, api } from '@/lib/api'
import { AmountInput } from '@/components/ui/amount-input'
import { Button, Field, Input, Select } from '@/components/ui/primitives'
import { CategoryChips } from '@/features/categories/category-chips'
import { useApp } from '@/lib/app-context'
import type { BootstrapData, CreateTxResult, TxDetail } from '@/lib/types'

type Props = {
  data: BootstrapData
  timezone: string
  editing?: TxDetail | null
  onDone?: () => void
}

type FormState = {
  type: TransactionType
  amount: number | null
  walletId: string
  toWalletId: string
  categoryId: string | null
  tagIds: string[]
  note: string
  occurredOn: string
}

export function TransactionForm({ data, timezone, editing, onDone }: Props) {
  const initial: FormState = editing
    ? {
        type: editing.type,
        amount: editing.amount,
        walletId: editing.walletId,
        toWalletId: editing.toWalletId ?? '',
        categoryId: editing.categoryId,
        tagIds: editing.tagIds,
        note: editing.note,
        occurredOn: editing.occurredOn,
      }
    : {
        type: 'expense',
        amount: null,
        walletId: data.wallets[0]?.id ?? '',
        toWalletId: '',
        categoryId: null,
        tagIds: [],
        note: '',
        occurredOn: todayIn(timezone),
      }

  const { pushToast } = useApp()
  const queryClient = useQueryClient()

  const [type, setType] = useState<TransactionType>(initial.type)
  const [amount, setAmount] = useState<number | null>(initial.amount)
  const [walletId, setWalletId] = useState<string>(initial.walletId)
  const [toWalletId, setToWalletId] = useState<string>(initial.toWalletId)
  const [categoryId, setCategoryId] = useState<string | null>(initial.categoryId)
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds)
  const [note, setNote] = useState(initial.note)
  const [occurredOn, setOccurredOn] = useState<string>(initial.occurredOn)
  const [formError, setFormError] = useState<string | null>(null)

  const categoriesForType = useMemo(
    () => data.categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense')),
    [data.categories, type],
  )

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        type,
        amount,
        walletId,
        toWalletId: type === 'transfer' ? toWalletId : undefined,
        categoryId: type === 'transfer' ? undefined : (categoryId ?? undefined),
        tagIds,
        note,
        occurredOn,
      }
      if (editing) {
        await api.patch(`/transactions/${editing.id}`, payload)
        return null as CreateTxResult | null
      }
      return api.post<CreateTxResult>('/transactions', payload)
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries()
      if (!editing) {
        resetForm()
        pushToast('success', 'Tersimpan.')
        if (res?.budgetAlert) {
          const a = res.budgetAlert
          pushToast(
            a.status === 'over' ? 'error' : 'info',
            a.status === 'over'
              ? `Melebihi anggaran ${a.categoryName}: ${a.percent}% terpakai.`
              : `Anggaran ${a.categoryName} hampir habis (${a.percent}%).`,
          )
        }
      } else {
        pushToast('success', 'Perubahan tersimpan.')
        onDone?.()
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof ApiError ? e.message : 'Gagal menyimpan, coba lagi.'
      setFormError(msg)
      pushToast('error', msg)
    },
  })

  function resetForm() {
    setAmount(null)
    setCategoryId(null)
    setTagIds([])
    setNote('')
    setFormError(null)
  }

  function toggleTag(id: string) {
    setTagIds((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id)
      if (prev.length >= MAX_TAGS_PER_TX) {
        pushToast('info', `Maksimal ${MAX_TAGS_PER_TX} tag per transaksi.`)
        return prev
      }
      return [...prev, id]
    })
  }

  const activeWallets = data.wallets.filter((w) => !w.isArchived)
  const canSubmit =
    amount != null &&
    amount > 0 &&
    walletId &&
    (type === 'transfer' ? toWalletId && toWalletId !== walletId : !!categoryId) &&
    !save.isPending

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) save.mutate()
      }}
    >
      {/* Type segmented control */}
      <div
        className="grid grid-cols-3 gap-1 rounded-xl bg-linen p-1"
        role="tablist"
        aria-label="Tipe transaksi"
      >
        {(['expense', 'income', 'transfer'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={type === t}
            onClick={() => {
              setType(t)
              setCategoryId(null)
            }}
            className={`rounded-lg py-2 text-sm font-medium transition-colors ${
              type === t ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {TRANSACTION_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <AmountInput value={amount} onChange={setAmount} autoFocus={!editing} />

      <div className="grid grid-cols-2 gap-3">
        <Field label={type === 'transfer' ? 'Dari dompet' : 'Dompet'}>
          <Select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            {activeWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
        {type === 'transfer' ? (
          <Field label="Ke dompet">
            <Select value={toWalletId} onChange={(e) => setToWalletId(e.target.value)}>
              <option value="">Pilih…</option>
              {activeWallets
                .filter((w) => w.id !== walletId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field label="Tanggal">
            <Input
              type="date"
              value={occurredOn}
              max={todayIn(timezone)}
              onChange={(e) => setOccurredOn(e.target.value)}
            />
          </Field>
        )}
      </div>

      {type === 'transfer' ? (
        <Field label="Tanggal">
          <Input
            type="date"
            value={occurredOn}
            max={todayIn(timezone)}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </Field>
      ) : (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Jenis</p>
          <CategoryChips categories={categoriesForType} selectedId={categoryId} onSelect={setCategoryId} />
        </div>
      )}

      {data.tags.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Tag ({tagIds.length}/{MAX_TAGS_PER_TX})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((t) => {
              const on = tagIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    on
                      ? 'border-indigo bg-indigo/10 text-indigo'
                      : 'border-line text-muted hover:border-ink/40'
                  }`}
                >
                  #{t.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <Field label="Catatan">
        <Input
          value={note}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Misal: makan siang"
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {formError ? <p className="text-sm text-clay">{formError}</p> : null}

      <Button type="submit" className="w-full" disabled={!canSubmit}>
        {save.isPending ? 'Menyimpan…' : editing ? 'Simpan perubahan' : 'Catat'}
      </Button>
    </form>
  )
}
