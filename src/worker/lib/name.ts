// BR-07: master-data names are unique per user (case-insensitive). Services
// compare trimmed lowercase names before hitting the DB unique index.
export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}
