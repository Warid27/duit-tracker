import { describe, expect, it } from 'vitest'
import {
  changePasswordSchema,
  createRecurringSchema,
  createTagSchema,
  createTransactionSchema,
  createWalletSchema,
  emailSchema,
  listTransactionsQuerySchema,
  loginSchema,
  passwordSchema,
  registerSchema,
  trendQuerySchema,
  updateTransactionSchema,
  upsertBudgetSchema,
} from '@shared/schemas'
import { MAX_AMOUNT, MAX_TAGS_PER_TX } from '@shared/constants'

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    const r = emailSchema.parse('  User@Example.COM ')
    expect(r).toBe('user@example.com')
  })

  it('rejects invalid emails', () => {
    expect(emailSchema.safeParse('').success).toBe(false)
    expect(emailSchema.safeParse('nope').success).toBe(false)
    expect(emailSchema.safeParse('a@b').success).toBe(false)
  })
})

describe('passwordSchema / register / login', () => {
  it('enforces 8..128 length', () => {
    expect(passwordSchema.safeParse('short7!').success).toBe(false)
    expect(passwordSchema.safeParse('exactly8').success).toBe(true)
  })

  it('register accepts optional name, rejects bad email', () => {
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'longenough' }).success).toBe(true)
    expect(registerSchema.safeParse({ email: 'bad', password: 'longenough' }).success).toBe(false)
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'x'.repeat(200) }).success).toBe(false)
  })

  it('login requires non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false)
  })

  it('changePassword validates both fields', () => {
    expect(changePasswordSchema.safeParse({ currentPassword: 'oldpass', newPassword: '1234567' }).success).toBe(false)
    expect(changePasswordSchema.safeParse({ currentPassword: 'oldpass', newPassword: 'newpassword' }).success).toBe(true)
  })
})

describe('createWalletSchema', () => {
  it('applies defaults for kind and balance', () => {
    const parsed = createWalletSchema.parse({ name: 'Bank BCA', color: 'indigo' })
    expect(parsed.kind).toBe('other')
    expect(parsed.currentBalance).toBe(0)
  })

  it('allows negative balances (credit cards) but not floats', () => {
    expect(createWalletSchema.safeParse({ name: 'CC', kind: 'bank', currentBalance: -1_500_000, color: 'clay' }).success).toBe(true)
    expect(createWalletSchema.safeParse({ name: 'CC', currentBalance: 1.5, color: 'clay' }).success).toBe(false)
  })

  it('rejects unknown colors/kinds and empty names', () => {
    expect(createWalletSchema.safeParse({ name: 'X', color: 'neonpink' }).success).toBe(false)
    expect(createWalletSchema.safeParse({ name: 'X', kind: 'crypto', color: 'sage' }).success).toBe(false)
    expect(createWalletSchema.safeParse({ name: '   ', color: 'sage' }).success).toBe(false)
  })
})

describe('createTransactionSchema', () => {
  const base = { type: 'expense', amount: 25_000, walletId: 'w1', occurredOn: '2026-09-30' }

  it('accepts a valid expense with defaults', () => {
    const parsed = createTransactionSchema.parse(base)
    expect(parsed.note).toBe('')
    expect(parsed.tagIds).toBeUndefined()
  })

  it('rejects zero/negative/float amounts and bad dates', () => {
    expect(createTransactionSchema.safeParse({ ...base, amount: 0 }).success).toBe(false)
    expect(createTransactionSchema.safeParse({ ...base, amount: -100 }).success).toBe(false)
    expect(createTransactionSchema.safeParse({ ...base, amount: 2500.5 }).success).toBe(false)
    expect(createTransactionSchema.safeParse({ ...base, amount: MAX_AMOUNT + 1 }).success).toBe(false)
    expect(createTransactionSchema.safeParse({ ...base, occurredOn: '2026-9-3' }).success).toBe(false)
  })

  it('rejects more than the tag limit', () => {
    const manyTags = Array.from({ length: MAX_TAGS_PER_TX + 1 }, (_, i) => `t${i}`)
    expect(createTransactionSchema.safeParse({ ...base, tagIds: manyTags }).success).toBe(false)
    const okTags = Array.from({ length: MAX_TAGS_PER_TX }, (_, i) => `t${i}`)
    expect(createTransactionSchema.safeParse({ ...base, tagIds: okTags }).success).toBe(true)
  })

  it('requires transfer destination to be validated downstream; schema keeps shape', () => {
    expect(updateTransactionSchema.safeParse({ amount: 10_000 }).success).toBe(true)
    expect(updateTransactionSchema.safeParse({ amount: 0 }).success).toBe(false)
  })
})

describe('listTransactionsQuerySchema', () => {
  it('coerces and defaults pagination', () => {
    const parsed = listTransactionsQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(30)
  })

  it('caps pageSize at MAX_PAGE_SIZE and rejects page 0', () => {
    expect(listTransactionsQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false)
    expect(listTransactionsQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(50)
  })

  it('validates filter formats', () => {
    expect(listTransactionsQuerySchema.safeParse({ from: '2026-09-01', type: 'income' }).success).toBe(true)
    expect(listTransactionsQuerySchema.safeParse({ type: 'refund' }).success).toBe(false)
    expect(listTransactionsQuerySchema.safeParse({ from: 'yesterday' }).success).toBe(false)
  })
})

describe('budget & recurring schemas', () => {
  it('budget requires positive integer', () => {
    expect(upsertBudgetSchema.safeParse({ amount: 500_000 }).success).toBe(true)
    expect(upsertBudgetSchema.safeParse({ amount: 0 }).success).toBe(false)
  })

  it('recurring validates endDate >= startDate', () => {
    const base = {
      type: 'expense',
      amount: 150_000,
      walletId: 'w1',
      frequency: 'monthly',
      startDate: '2026-01-01',
    }
    expect(createRecurringSchema.safeParse({ ...base, endDate: '2026-12-31' }).success).toBe(true)
    const bad = createRecurringSchema.safeParse({ ...base, endDate: '2025-12-31' })
    expect(bad.success).toBe(false)
    if (!bad.success) {
      expect(bad.error.issues[0]?.path).toEqual(['endDate'])
    }
  })

  it('recurring rejects unknown frequency', () => {
    expect(
      createRecurringSchema.safeParse({
        type: 'expense',
        amount: 1,
        walletId: 'w',
        frequency: 'fortnightly',
        startDate: '2026-01-01',
      }).success,
    ).toBe(false)
  })
})

describe('trendQuerySchema', () => {
  it('defaults to 6 months, bounds 2..24', () => {
    expect(trendQuerySchema.parse({}).months).toBe(6)
    expect(trendQuerySchema.safeParse({ months: '1' }).success).toBe(false)
    expect(trendQuerySchema.safeParse({ months: '25' }).success).toBe(false)
  })
})

describe('tag schema', () => {
  it('trims and rejects blank names', () => {
    const parsed = createTagSchema.parse({ name: '  groceries  ' })
    expect(parsed.name).toBe('groceries')
    expect(createTagSchema.safeParse({ name: '   ' }).success).toBe(false)
  })
})
