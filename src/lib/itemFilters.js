import { daysUntil } from './date'

/** Days from expiry at which an item counts as "expiring soon". */
export const SOON_WINDOW_DAYS = 7

/**
 * Whether an item survives the current filter chip and search box.
 *
 * Lives here rather than inline in Home.jsx specifically so it can be tested:
 * the original inline version treated every expired item as "expiring soon"
 * too, because `days <= 7` is also true for negative day counts, and nothing
 * could catch it.
 *
 * @param {{name: string, expiry_date: string, category_id: number|null}} item
 * @param {'all'|'soon'|'expired'|number} filter chip; a number means category id
 * @param {string} query free-text search over the item name
 */
export function matchesFilter(item, filter, query = '') {
  const days = daysUntil(item.expiry_date)

  // "Expiring soon" is deliberately exclusive of items that have already gone
  // -- those belong to the "Expired" chip, and showing them under both makes
  // the two chips indistinguishable on a shelf that's overdue a clear-out.
  if (filter === 'soon' && !(days >= 0 && days <= SOON_WINDOW_DAYS)) return false
  if (filter === 'expired' && !(days < 0)) return false
  // The finer bands the My Food screen offers. Each is exclusive of the
  // others, so the four together partition the list exactly once.
  if (filter === 'today' && days !== 0) return false
  if (filter === 'week' && !(days >= 1 && days <= SOON_WINDOW_DAYS)) return false
  if (filter === 'later' && !(days > SOON_WINDOW_DAYS)) return false
  if (typeof filter === 'number' && item.category_id !== filter) return false

  const q = query.trim().toLowerCase()
  if (q && !item.name.toLowerCase().includes(q)) return false

  return true
}

/**
 * The band an item falls into, used both by the filter chips and by the
 * headings the My Food list is grouped under.
 *
 * @returns {'expired'|'today'|'week'|'later'}
 */
export function expiryBand(item) {
  const days = daysUntil(item.expiry_date)
  if (days < 0) return 'expired'
  if (days === 0) return 'today'
  if (days <= SOON_WINDOW_DAYS) return 'week'
  return 'later'
}

/** Human heading per band, in the order the design lists them. */
export const BAND_LABELS = {
  expired: 'Expired',
  today: 'Expiring Today',
  week: 'Expiring This Week',
  later: 'Later',
}

/**
 * Splits items into the four bands, dropping any that are empty so the list
 * never renders a heading with nothing under it.
 *
 * @returns {Array<{band: string, label: string, items: Array}>}
 */
export function groupByExpiry(items) {
  const buckets = { expired: [], today: [], week: [], later: [] }
  for (const item of items ?? []) buckets[expiryBand(item)].push(item)

  return Object.keys(BAND_LABELS)
    .filter((band) => buckets[band].length > 0)
    .map((band) => ({ band, label: BAND_LABELS[band], items: buckets[band] }))
}

/** Category chips, one per category actually present in the current items. */
export function categoriesInUse(items) {
  const seen = new Map()
  for (const item of items ?? []) {
    if (item.category_id && item.category?.name && !seen.has(item.category_id)) {
      seen.set(item.category_id, item.category.name)
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }))
}
