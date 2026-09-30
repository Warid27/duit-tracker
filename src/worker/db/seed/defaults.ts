// Default data seeded atomically with user creation (spec 11).
import { PALETTE_COLORS, type PaletteColor, type CategoryKind, type WalletKind } from '@shared/constants'

export type DefaultWallet = { name: string; kind: WalletKind; color: PaletteColor }
export type DefaultCategory = { name: string; kind: CategoryKind; color: PaletteColor }

/** Spec 11.2 — initialBalance is always 0 for defaults. */
export const DEFAULT_WALLETS: readonly DefaultWallet[] = [
  { name: 'Tunai', kind: 'cash', color: 'sage' },
  { name: 'Rekening Bank', kind: 'bank', color: 'indigo' },
  { name: 'E-Wallet', kind: 'ewallet', color: 'ochre' },
]

/** Spec 11.3 — colors rotate through the palette by index. */
const EXPENSE_NAMES = [
  'Makan & Minum',
  'Transportasi',
  'Belanja Harian',
  'Tagihan & Utilitas',
  'Sewa / Cicilan',
  'Kesehatan',
  'Hiburan',
  'Belanja Lainnya',
  'Pendidikan',
  'Sosial & Donasi',
  'Lainnya',
] as const

const INCOME_NAMES = ['Gaji', 'Bonus', 'Usaha / Freelance', 'Hadiah', 'Lainnya'] as const

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  ...EXPENSE_NAMES.map((name, i) => ({
    name,
    kind: 'expense' as CategoryKind,
    color: PALETTE_COLORS[i % PALETTE_COLORS.length] as PaletteColor,
  })),
  ...INCOME_NAMES.map((name, i) => ({
    name,
    kind: 'income' as CategoryKind,
    color: PALETTE_COLORS[i % PALETTE_COLORS.length] as PaletteColor,
  })),
]

/** Spec 11.4 */
export const DEFAULT_TAGS = ['Kebutuhan', 'Keinginan', 'Impulsif', 'Langganan'] as const

import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '../client'
import { categories, tags, wallets } from '../schema'

/**
 * Seed default wallets/categories/tags for a new user. Must run inside the
 * same db.batch as the user insert so registration is atomic (spec 11.1).
 * Returns SQL statements (not executed here) for batch composition.
 */
export function seedUserDefaultsStatements(db: Db, userId: string) {
  const walletStmts = DEFAULT_WALLETS.map((w, i) =>
    db.insert(wallets).values({
      id: crypto.randomUUID(),
      userId,
      name: w.name,
      kind: w.kind,
      color: w.color,
      sortOrder: i,
      initialBalance: 0,
    }),
  )
  const categoryStmts = DEFAULT_CATEGORIES.map((c, i) =>
    db
      .insert(categories)
      .values({ id: crypto.randomUUID(), userId, name: c.name, kind: c.kind, color: c.color, sortOrder: i }),
  )
  const tagStmt = db
    .insert(tags)
    .values(DEFAULT_TAGS.map((name) => ({ id: crypto.randomUUID(), userId, name })))
  return [...walletStmts, ...categoryStmts, tagStmt]
}

/** Convenience for scripts/tests: execute the seed immediately. */
export async function seedUserDefaults(db: Db, userId: string): Promise<void> {
  await db.batch(seedUserDefaultsStatements(db, userId) as unknown as Parameters<Db['batch']>[0])
}

/** Find-or-create a tag by exact name (used when transactions reference tags). */
export async function ensureTagsExist(db: Db, userId: string, names: readonly string[]): Promise<string[]> {
  if (names.length === 0) return []
  const existing = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.name, [...names])))
  const found = new Map(existing.map((r) => [r.name.toLowerCase(), r.id]))
  const ids: string[] = []
  for (const n of names) {
    const hit = found.get(n.toLowerCase())
    if (hit) ids.push(hit)
  }
  return ids
}
