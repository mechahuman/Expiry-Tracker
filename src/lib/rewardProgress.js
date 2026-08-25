/**
 * Turns a badge plus the progress object from sync_rewards() into what the
 * Rewards screen renders.
 *
 * Split out from the component purely so it can be unit-tested -- the same
 * discipline that caught real bugs in the voice and OCR parsers. The rest of
 * this module's logic lives in SQL, which Vitest can't reach, so the parts
 * that can be tested should be.
 */

/**
 * @param {{id: number, criteria_type: string, criteria_value: number}} badge
 * @param {Record<string, number>} progress  counters keyed by criteria_type
 * @param {Set<number>|number[]} earnedIds   badge ids the user already holds
 */
export function badgeProgress(badge, progress = {}, earnedIds = []) {
  const earned = earnedIds instanceof Set
    ? earnedIds.has(badge.id)
    : earnedIds.includes(badge.id)

  const target = badge.criteria_value
  const raw = progress?.[badge.criteria_type]
  const current = Number.isFinite(raw) ? raw : 0

  // An earned badge always reads as complete. Counters are derived from live
  // data, so one can legitimately fall below its target later -- an item
  // deleted after the badge unlocked, say -- and a badge you've been awarded
  // shouldn't visibly un-earn itself.
  if (earned) return { earned: true, current: Math.max(current, target), target, percent: 100 }

  // A zero or missing target would divide by zero. Treat it as unreachable
  // rather than trivially complete -- a badge with no threshold is a data
  // error, and silently awarding it is the worse failure.
  if (!target || target <= 0) return { earned: false, current, target: target ?? 0, percent: 0 }

  return {
    earned: false,
    current,
    target,
    percent: Math.min(100, Math.round((current / target) * 100)),
  }
}

/** "12 of 50" — the count under a locked badge. */
export function progressLabel({ current, target }) {
  return `${current} of ${target}`
}
