// Quick-pick chips for the Catat page (spec 12.4): categories sorted by usage count desc.
import { CategoryDot } from '@/components/ui/primitives'
import type { Category } from '@/lib/types'

export function CategoryChips({
  categories,
  selectedId,
  onSelect,
}: {
  categories: Category[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const sorted = [...categories].sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0)).slice(0, 12)
  if (sorted.length === 0)
    return <p className="text-xs text-muted">Belum ada jenis. Tambahkan di halaman Pengaturan.</p>
  return (
    <div className="flex flex-wrap gap-1.5" role="listbox" aria-label="Pilih jenis">
      {sorted.map((cat) => {
        const active = cat.id === selectedId
        return (
          <button
            key={cat.id}
            role="option"
            aria-selected={active}
            onClick={() => onSelect(cat.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              active ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-ink hover:border-ink/40'
            }`}
          >
            <CategoryDot color={cat.color} />
            {cat.name}
          </button>
        )
      })}
    </div>
  )
}
