import { describe, expect, it } from 'vitest'
import { itemEmoji, mostUrgent, summarise } from './dashboardStats'
import { todayISO, toISODateString } from './date'

/** A y-m-d string `offset` days from today. */
function inDays(offset) {
  const d = new Date(todayISO())
  d.setDate(d.getDate() + offset)
  return toISODateString(d)
}

const item = (offset, extra = {}) => ({ expiry_date: inDays(offset), ...extra })

describe('summarise', () => {
  it('counts nothing for an empty or absent list', () => {
    expect(summarise([])).toEqual({ total: 0, soon: 0, expired: 0 })
    expect(summarise(null)).toEqual({ total: 0, soon: 0, expired: 0 })
  })

  it('separates expired from expiring, rather than double-counting', () => {
    // The regression this exists for: `days <= 7` also matches -3, so an
    // expired item can end up counted as "expiring soon" as well.
    const stats = summarise([item(-3), item(2), item(30)])
    expect(stats).toEqual({ total: 3, soon: 1, expired: 1 })
    expect(stats.soon + stats.expired).toBeLessThanOrEqual(stats.total)
  })

  it('treats today as expiring, not expired', () => {
    expect(summarise([item(0)])).toEqual({ total: 1, soon: 1, expired: 0 })
  })

  it('includes the last day of the window but not the day after', () => {
    expect(summarise([item(7)]).soon).toBe(1)
    expect(summarise([item(8)]).soon).toBe(0)
  })
})

describe('mostUrgent', () => {
  it('returns null when nothing is close to expiring', () => {
    expect(mostUrgent([item(30), item(90)])).toBeNull()
    expect(mostUrgent([])).toBeNull()
  })

  it('prefers an expired item over one merely expiring', () => {
    const expired = item(-2, { name: 'Old milk' })
    expect(mostUrgent([item(1), expired])).toBe(expired)
  })

  it('does not assume the list arrives sorted', () => {
    const soonest = item(1, { name: 'Bread' })
    expect(mostUrgent([item(5), soonest, item(3)])).toBe(soonest)
  })
})

describe('itemEmoji', () => {
  it('maps a known category', () => {
    expect(itemEmoji({ category: { name: 'Dairy' } })).toBe('🥛')
  })

  it('falls back for unknown, missing, or absent categories', () => {
    expect(itemEmoji({ category: { name: 'Frozen' } })).toBe('🍽️')
    expect(itemEmoji({})).toBe('🍽️')
    expect(itemEmoji(null)).toBe('🍽️')
  })
})
