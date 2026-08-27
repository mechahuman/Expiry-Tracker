import { describe, expect, it } from 'vitest'
import { categoriesInUse, expiryBand, groupByExpiry, matchesFilter } from './itemFilters'

/** Builds an item whose expiry is `offset` days from today. */
function itemDueIn(offset, extra = {}) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    name: 'Milk',
    category_id: 1,
    expiry_date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    ...extra,
  }
}

describe('matchesFilter', () => {
  it('keeps everything under "all"', () => {
    expect(matchesFilter(itemDueIn(-5), 'all')).toBe(true)
    expect(matchesFilter(itemDueIn(0), 'all')).toBe(true)
    expect(matchesFilter(itemDueIn(400), 'all')).toBe(true)
  })

  it('excludes already-expired items from "expiring soon"', () => {
    // The original inline version got this wrong: `days <= 7` is also true at
    // -5, so expired items showed under both chips at once.
    expect(matchesFilter(itemDueIn(-5), 'soon')).toBe(false)
    expect(matchesFilter(itemDueIn(-1), 'soon')).toBe(false)
  })

  it('treats today and the next seven days as "expiring soon"', () => {
    expect(matchesFilter(itemDueIn(0), 'soon')).toBe(true)
    expect(matchesFilter(itemDueIn(7), 'soon')).toBe(true)
    expect(matchesFilter(itemDueIn(8), 'soon')).toBe(false)
  })

  it('counts only past dates as expired', () => {
    expect(matchesFilter(itemDueIn(-1), 'expired')).toBe(true)
    expect(matchesFilter(itemDueIn(0), 'expired')).toBe(false) // still good today
    expect(matchesFilter(itemDueIn(3), 'expired')).toBe(false)
  })

  it('never places one item under both "soon" and "expired"', () => {
    for (const offset of [-10, -1, 0, 3, 7, 8, 60]) {
      const item = itemDueIn(offset)
      const both = matchesFilter(item, 'soon') && matchesFilter(item, 'expired')
      expect(both).toBe(false)
    }
  })

  it('filters by category id', () => {
    expect(matchesFilter(itemDueIn(5, { category_id: 2 }), 2)).toBe(true)
    expect(matchesFilter(itemDueIn(5, { category_id: 3 }), 2)).toBe(false)
    expect(matchesFilter(itemDueIn(5, { category_id: null }), 2)).toBe(false)
  })

  it('searches the name case-insensitively, ignoring surrounding spaces', () => {
    const item = itemDueIn(5, { name: 'Amul Milk' })
    expect(matchesFilter(item, 'all', 'milk')).toBe(true)
    expect(matchesFilter(item, 'all', '  AMUL ')).toBe(true)
    expect(matchesFilter(item, 'all', 'paneer')).toBe(false)
    expect(matchesFilter(item, 'all', '')).toBe(true)
  })

  it('applies chip and search together', () => {
    const soonMilk = itemDueIn(3, { name: 'Milk' })
    expect(matchesFilter(soonMilk, 'soon', 'milk')).toBe(true)
    expect(matchesFilter(soonMilk, 'soon', 'rice')).toBe(false)
    expect(matchesFilter(itemDueIn(-3, { name: 'Milk' }), 'soon', 'milk')).toBe(false)
  })
})

describe('categoriesInUse', () => {
  it('lists each present category once', () => {
    const items = [
      { category_id: 1, category: { name: 'Snacks' } },
      { category_id: 2, category: { name: 'Dairy' } },
      { category_id: 1, category: { name: 'Snacks' } },
    ]
    expect(categoriesInUse(items)).toEqual([
      { id: 1, name: 'Snacks' },
      { id: 2, name: 'Dairy' },
    ])
  })

  it('skips uncategorised items and copes with no items at all', () => {
    expect(categoriesInUse([{ category_id: null, category: null }])).toEqual([])
    expect(categoriesInUse([])).toEqual([])
    expect(categoriesInUse(null)).toEqual([])
  })
})

describe('expiry bands', () => {
  it('assigns each item to exactly one band', () => {
    expect(expiryBand(itemDueIn(-1))).toBe('expired')
    expect(expiryBand(itemDueIn(0))).toBe('today')
    expect(expiryBand(itemDueIn(1))).toBe('week')
    expect(expiryBand(itemDueIn(7))).toBe('week')
    expect(expiryBand(itemDueIn(8))).toBe('later')
  })

  it('partitions the list -- every item lands in one group, none in two', () => {
    const items = [itemDueIn(-3), itemDueIn(0), itemDueIn(2), itemDueIn(40)]
    const groups = groupByExpiry(items)
    const flattened = groups.flatMap((g) => g.items)

    expect(flattened).toHaveLength(items.length)
    expect(new Set(flattened).size).toBe(items.length)
  })

  it('omits empty bands rather than rendering a bare heading', () => {
    const groups = groupByExpiry([itemDueIn(0)])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Expiring Today')
  })

  it('orders bands most urgent first', () => {
    const groups = groupByExpiry([itemDueIn(40), itemDueIn(-2), itemDueIn(3), itemDueIn(0)])
    expect(groups.map((g) => g.band)).toEqual(['expired', 'today', 'week', 'later'])
  })

  it('matches the chips to the bands they name', () => {
    // A chip and its band must agree, or filtering to "Today" would show a
    // heading of items the chip itself excludes.
    for (const offset of [-2, 0, 3, 40]) {
      const item = itemDueIn(offset)
      const band = expiryBand(item)
      expect(matchesFilter(item, band)).toBe(true)
    }
  })
})
