import { daysUntil } from './date'
import { SOON_WINDOW_DAYS } from './itemFilters'

/**
 * The three counters across the top of the Home dashboard.
 *
 * Pure so it can be tested directly. The bug this guards against is the same
 * one itemFilters already had once: `days <= 7` is also true for negative day
 * counts, so a naive "expiring soon" count silently swallows every expired
 * item and the two figures stop adding up.
 *
 * @param {Array<{expiry_date: string}>|null} items
 * @returns {{total: number, soon: number, expired: number}}
 */
export function summarise(items) {
  const list = items ?? []
  let soon = 0
  let expired = 0

  for (const item of list) {
    const days = daysUntil(item.expiry_date)
    if (days < 0) expired += 1
    else if (days <= SOON_WINDOW_DAYS) soon += 1
  }

  return { total: list.length, soon, expired }
}

/**
 * The single most urgent item, or null when nothing needs attention.
 *
 * Drives the priority card at the top of Home. Already-expired items outrank
 * everything -- the list arrives sorted by expiry_date ascending, so the first
 * entry is the answer, but this doesn't assume that ordering holds.
 */
export function mostUrgent(items) {
  let best = null
  let bestDays = Infinity

  for (const item of items ?? []) {
    const days = daysUntil(item.expiry_date)
    if (days > SOON_WINDOW_DAYS) continue
    if (days < bestDays) {
      best = item
      bestDays = days
    }
  }

  return best
}

/* Emoji per category, derived rather than stored. The design shows a glyph on
   every item card; adding an `emoji` column would mean a migration plus a
   picker in every entry path, for decoration. Mapping the five seeded
   categories covers it, and unknown categories get a neutral fallback. */
const CATEGORY_EMOJI = {
  Snacks: '🍪',
  Dairy: '🥛',
  Beverages: '🧃',
  'Ready-to-eat': '🍱',
  Other: '🍽️',
}

/** Best-effort glyph for an item, falling back to a plain plate. */
export function itemEmoji(item) {
  return CATEGORY_EMOJI[item?.category?.name] ?? '🍽️'
}
