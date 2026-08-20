/**
 * Local calendar date as y-m-d, not UTC -- new Date().toISOString() would
 * drift a day around midnight in IST. expiry_date is a `date` column on
 * purpose (see supabase/002_hardening.sql), so dates stay plain strings
 * rather than Date objects wherever possible.
 */
export function todayISO() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** A Date object as a local y-m-d string (same local-vs-UTC caveat as above). */
export function toISODateString(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Whole days between two y-m-d strings (positive = dateStr is in the future).
 * `new Date('2026-08-20')` parses as UTC midnight for that calendar date --
 * doing this for both sides means the local timezone offset cancels out of
 * the subtraction, so the day count is correct regardless of where the
 * browser is, even though neither Date's absolute instant reflects "now" here.
 */
export function daysUntil(dateStr) {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((new Date(dateStr) - new Date(todayISO())) / msPerDay)
}
