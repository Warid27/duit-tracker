// CSV export (spec §9.2). Pure: BOM, RFC 4180 quoting, formula-injection guard.

export type CsvCell = string | number

const BOM = '\uFEFF'

/** Guard against CSV formula injection: prefix dangerous leading chars with '. */
function escapeCell(value: CsvCell): string {
  const s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) {
    return quote("'" + s)
  }
  return quote(s)
}

function quote(s: string): string {
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  const body = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n')
  return BOM + body + '\r\n'
}

export type CsvTransactionRow = {
  occurredOn: string
  typeLabel: string // Masuk | Keluar | Pindah
  walletName: string
  toWalletName: string // '' unless transfer
  categoryName: string // '' for transfers / uncategorized
  tags: string // joined with "; "
  amount: number // plain integer, no thousand separators
  note: string
}

export const CSV_HEADERS = [
  'Tanggal',
  'Tipe',
  'Dompet',
  'Ke Dompet',
  'Jenis',
  'Tag',
  'Jumlah',
  'Catatan',
] as const

export function transactionsToCsv(rows: readonly CsvTransactionRow[]): string {
  const data = rows.map((r) => [
    r.occurredOn,
    r.typeLabel,
    r.walletName,
    r.toWalletName,
    r.categoryName,
    r.tags,
    r.amount,
    r.note,
  ])
  return toCsv([CSV_HEADERS, ...data])
}

export function csvFileName(from: string, to: string): string {
  return `duit-transaksi_${from}_${to}.csv`
}
