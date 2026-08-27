/**
 * How long ago the cached inventory was last synced, in words.
 *
 * Kept deliberately coarse. "Synced 3 hours ago" is the useful signal -- it
 * tells you roughly how much to trust what's on screen. Minute-level precision
 * would imply an accuracy the cache doesn't have.
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function describeSyncAge(savedAt, now = Date.now()) {
  const then = typeof savedAt === 'number' ? savedAt : Date.parse(savedAt)
  if (!Number.isFinite(then)) return 'some time ago'

  const elapsed = now - then

  // Clock skew, or a device whose time moved backwards. "just now" is a
  // better lie than "in -3 hours".
  if (elapsed < MINUTE) return 'just now'

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE)
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }

  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }

  const days = Math.floor(elapsed / DAY)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return 'over a week ago'
}
