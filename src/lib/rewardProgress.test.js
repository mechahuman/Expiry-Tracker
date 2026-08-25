import { describe, expect, it } from 'vitest'
import { badgeProgress, progressLabel } from './rewardProgress'

const badge = { id: 3, criteria_type: 'items_added', criteria_value: 50 }

describe('badgeProgress', () => {
  it('reports partial progress toward a locked badge', () => {
    const r = badgeProgress(badge, { items_added: 12 }, [])
    expect(r).toEqual({ earned: false, current: 12, target: 50, percent: 24 })
  })

  it('treats a badge the user holds as complete', () => {
    const r = badgeProgress(badge, { items_added: 50 }, [3])
    expect(r.earned).toBe(true)
    expect(r.percent).toBe(100)
  })

  it('accepts earned ids as a Set as well as an array', () => {
    expect(badgeProgress(badge, {}, new Set([3])).earned).toBe(true)
    expect(badgeProgress(badge, {}, new Set([99])).earned).toBe(false)
  })

  it('never un-earns a badge whose counter has since dropped', () => {
    // Counters are derived from live data, so a count can legitimately fall
    // below the threshold after the badge was awarded.
    const r = badgeProgress(badge, { items_added: 4 }, [3])
    expect(r.earned).toBe(true)
    expect(r.percent).toBe(100)
    expect(r.current).toBe(50)
  })

  it('caps the bar at 100% when the count overshoots', () => {
    const r = badgeProgress(badge, { items_added: 500 }, [])
    expect(r.percent).toBe(100)
  })

  it('counts a missing or unknown criteria type as zero, not as complete', () => {
    // This is what keeps a future 'streak_days' badge from unlocking itself
    // before the data behind it exists.
    const future = { id: 9, criteria_type: 'streak_days', criteria_value: 7 }
    const r = badgeProgress(future, { items_added: 100 }, [])
    expect(r.current).toBe(0)
    expect(r.percent).toBe(0)
    expect(r.earned).toBe(false)
  })

  it('copes with no progress object at all', () => {
    expect(badgeProgress(badge, undefined, []).percent).toBe(0)
    expect(badgeProgress(badge, null, []).current).toBe(0)
  })

  it('treats a zero target as unreachable rather than already met', () => {
    // A badge with no threshold is a data error; awarding it silently would be
    // the worse of the two failures.
    const broken = { id: 8, criteria_type: 'items_added', criteria_value: 0 }
    const r = badgeProgress(broken, { items_added: 5 }, [])
    expect(r.earned).toBe(false)
    expect(r.percent).toBe(0)
  })

  it('ignores a non-numeric counter', () => {
    expect(badgeProgress(badge, { items_added: 'twelve' }, []).current).toBe(0)
  })
})

describe('progressLabel', () => {
  it('reads as a count toward the target', () => {
    expect(progressLabel({ current: 12, target: 50 })).toBe('12 of 50')
  })
})
