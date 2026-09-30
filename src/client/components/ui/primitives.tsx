// Shared small UI primitives (spec 12): Button, Input, Select, Badge, Spinner, Modal.
import {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { X } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none min-h-11'
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-ink text-paper hover:bg-ink/90',
    secondary: 'bg-surface border border-line text-ink hover:bg-linen',
    ghost: 'text-ink hover:bg-linen',
    danger: 'bg-clay text-white hover:bg-clay/90',
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-clay">{error}</span> : null}
    </label>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none min-h-11 ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none min-h-11 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function Badge({ color, children }: { color?: string | null; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      style={
        color
          ? { backgroundColor: `var(--c-${color}, #8C8880)20`, color: `var(--c-${color}, #8C8880)` }
          : undefined
      }
    >
      {children}
    </span>
  )
}

export function CategoryDot({ color }: { color?: string | null }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: `var(--c-${color ?? 'stone'}, #8C8880)` }}
    />
  )
}

export function Spinner() {
  return (
    <span
      className="inline-block size-5 animate-spin rounded-full border-2 border-line border-t-ink"
      role="status"
      aria-label="Memuat"
    />
  )
}

export function PageSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/50 p-6 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Tutup" className="rounded-lg p-2 text-muted hover:bg-linen">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
