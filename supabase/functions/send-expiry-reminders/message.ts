/**
 * Builds the reminder text.
 *
 * Deliberately free of imports and of Deno/Node specifics: the Edge Function
 * runs on Deno, but this is the only part with real logic worth testing, and
 * keeping it dependency-free lets the Vitest suite import it directly.
 */

export interface ExpiringItem {
  name: string
  expiry_date: string // y-m-d
}

/** Whole days between two y-m-d strings. Both parse as UTC midnight, so the
 *  offset cancels and the difference is a clean calendar-day count. */
export function daysBetween(fromIso: string, toIso: string): number {
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / msPerDay)
}

function relativeDay(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/**
 * @param items   items expiring within the reminder window, any order
 * @param todayIso today's date in the user's timezone
 * @returns null when there's nothing to say -- callers should send nothing
 *          rather than a notification saying zero items need attention.
 */
export function buildReminder(
  items: ExpiringItem[],
  todayIso: string,
): { title: string; body: string } | null {
  if (!items || items.length === 0) return null

  // Soonest first: the most urgent thing should survive truncation.
  const sorted = [...items].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))

  if (sorted.length === 1) {
    const item = sorted[0]
    return {
      title: 'Expiring soon',
      body: `${item.name} expires ${relativeDay(daysBetween(todayIso, item.expiry_date))}.`,
    }
  }

  // Notification bodies get truncated by the OS, so name a few and count the
  // rest rather than listing everything and having it cut off mid-word.
  const shown = sorted.slice(0, 3)
  const listed = shown
    .map((item) => `${item.name} (${relativeDay(daysBetween(todayIso, item.expiry_date))})`)
    .join(', ')
  const remaining = sorted.length - shown.length

  return {
    title: `${sorted.length} items expiring soon`,
    body: remaining > 0 ? `${listed} and ${remaining} more.` : `${listed}.`,
  }
}
