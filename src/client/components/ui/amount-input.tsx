// Amount entry (spec 12.4): numeric keypad, live thousand grouping, Rp prefix.
import { useState } from 'react'
import { formatDigitsGrouping, parseRupiahInput } from '@shared/domain/money'

export function AmountInput({
  value,
  onChange,
  allowNegative = false,
  placeholder = '0',
  autoFocus = false,
}: {
  value: number | null
  onChange: (v: number | null) => void
  allowNegative?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState(() => (value == null ? '' : String(value)))

  function handleInput(raw: string) {
    let cleaned = raw.replace(/[^\d-]/g, '')
    if (!allowNegative) cleaned = cleaned.replace(/-/g, '')
    // Only keep leading minus.
    const negative = cleaned.startsWith('-')
    const digits = cleaned.replace(/-/g, '')
    setText((negative ? '-' : '') + formatDigitsGrouping(digits))
    onChange(parseRupiahInput(cleaned === '-' || cleaned === '' ? '0' : cleaned))
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 focus-within:border-ink">
      <span className="font-display text-lg font-semibold text-muted">Rp</span>
      <input
        dir="ltr"
        inputMode={allowNegative ? 'text' : 'numeric'}
        enterKeyHint="done"
        autoComplete="off"
        className="w-full bg-transparent text-right font-display text-2xl font-semibold tabular-nums text-ink outline-none"
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => handleInput(e.target.value)}
        aria-label="Nominal"
      />
    </div>
  )
}
