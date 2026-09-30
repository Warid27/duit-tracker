# duit-tracker

Pencatat keuangan pribadi (buku kas) — single-user, mobile-first PWA.
Dibangun dengan **Cloudflare Workers + Hono + D1 (SQLite) + React (Vite) + Tailwind v4**.

Live: https://duit-tracker.warid27.workers.dev

## Fitur (lihat `spec.md` untuk detail lengkap)

- 💰 Dompet (cash / bank / e-wallet / kartu), saldo dihitung dari transaksi + set-balance manual
- ✍️ Catat pemasukan / pengeluaran / transfer, kategori & tag, catatan, tanggal
- 📊 Laporan bulanan: ringkasan, tren 6 bulan, breakdown kategori, export CSV
- 🔁 Transaksi berulang (harian/mingguan/bulanan/tahunan) dengan generate idempotent
- 🎯 Budget per kategori + peringatan saat mendekati/melewati batas
- 🔐 Login single-user (password di-hash bcrypt-like + pepper), rate limiting
- 📱 PWA: installable, offline shell, desain Japandi

## Stack

| Layer   | Teknologi                                      |
| ------- | ---------------------------------------------- |
| Runtime | Cloudflare Workers (`wrangler`)                |
| API     | Hono + Drizzle ORM + D1 (SQLite)               |
| Client  | React 19 + Vite + TanStack Query + Tailwind v4 |
| Tests   | Vitest (58 unit test domain layer)             |
| CI/CD   | GitHub Actions → quality, build, deploy        |

## Development

```bash
pnpm install
pnpm dev          # vite dev server (worker + client, hot reload)
pnpm typecheck    # tsc -b
pnpm lint         # eslint
pnpm test         # vitest
pnpm build        # produksi (dist/)
```

Konfigurasi yang dibutuhkan:

- `wrangler.jsonc` → `database_id` D1 (sudah diisi: `duit-db`)
- Secret `PASSWORD_PEPPER` → `npx wrangler secret put PASSWORD_PEPPER`
- Migration D1 → `pnpm db:migrate` (= `wrangler d1 migrations apply duit-db --remote`)

## Struktur

```
src/
  client/       # React SPA (halaman: Catat, Buku, Dompet, Laporan, Pengaturan)
  worker/       # Hono API (routes/, services/, db/schema.ts, middleware auth)
  shared/       # Domain murni: dates, money, recurrence, schemas (diverifikasi unit test)
migrations/     # SQL migrasi Drizzle untuk D1
.github/        # Workflow CI (quality+build pada PR, deploy pada push main)
spec.md         # Spesifikasi lengkap aplikasi
```

## Deployment

Push ke `main` → GitHub Actions otomatis: typecheck, lint, prettier, test, build, lalu `wrangler deploy`.
Branch preview tidak di-deploy; seluruh konfigurasi environment ada di repository ini.
