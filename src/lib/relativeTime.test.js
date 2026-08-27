import { describe, expect, it } from 'vitest'
import { describeSyncAge } from './relativeTime'

const NOW = new Date('2026-08-27T12:00:00Z').getTime()
const ago = (ms) => NOW - ms

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('describeSyncAge', () => {
  it('reads as "just now" within the first minute', () => {
    expect(describeSyncAge(ago(0), NOW)).toBe('just now')
    expect(describeSyncAge(ago(59 * 1000), NOW)).toBe('just now')
  })

  it('counts minutes, then hours', () => {
    expect(describeSyncAge(ago(MINUTE), NOW)).toBe('1 minute ago')
    expect(describeSyncAge(ago(12 * MINUTE), NOW)).toBe('12 minutes ago')
    expect(describeSyncAge(ago(HOUR), NOW)).toBe('1 hour ago')
    expect(describeSyncAge(ago(3 * HOUR), NOW)).toBe('3 hours ago')
  })

  it('switches to days, with "yesterday" as a special case', () => {
    expect(describeSyncAge(ago(DAY), NOW)).toBe('yesterday')
    expect(describeSyncAge(ago(3 * DAY), NOW)).toBe('3 days ago')
  })

  it('stops being precise past a week', () => {
    expect(describeSyncAge(ago(30 * DAY), NOW)).toBe('over a week ago')
  })

  it('accepts an ISO string as well as a timestamp', () => {
    expect(describeSyncAge('2026-08-27T09:00:00Z', NOW)).toBe('3 hours ago')
  })

  it('says "just now" rather than a negative age if the clock moved backwards', () => {
    // Device clock skew shouldn't surface as "in -3 hours".
    expect(describeSyncAge(NOW + 5 * HOUR, NOW)).toBe('just now')
  })

  it('falls back to a vague phrase for an unparseable value', () => {
    expect(describeSyncAge(null, NOW)).toBe('some time ago')
    expect(describeSyncAge('not a date', NOW)).toBe('some time ago')
    expect(describeSyncAge(undefined, NOW)).toBe('some time ago')
  })
})
