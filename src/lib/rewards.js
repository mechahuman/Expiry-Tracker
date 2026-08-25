import { supabase } from './supabaseClient'

/**
 * Asks the database to re-evaluate the current user's points and badges.
 *
 * Replaces the checkBadgeProgress() no-op stubbed in Module 4.
 *
 * Note there's no userId argument. The database function reads auth.uid() from
 * the JWT, and the client has no say in who gets awarded -- that's the whole
 * security property of Module 9. It also can't supply the counts: the function
 * derives them from the user's actual items, so a tampered client can't inflate
 * a score. Direct writes to profiles.points and user_badges are revoked
 * outright (see supabase/005_rewards.sql).
 *
 * Safe to call redundantly: points are recomputed from scratch rather than
 * incremented, so repeat calls converge instead of accumulating.
 *
 * @returns {Promise<{points: number, progress: Record<string, number>,
 *                    newly_earned: Array<{id: number, name: string, icon: string}>} | null>}
 *          null on failure -- rewards must never break the action the user
 *          actually took. Saving an item matters; gamification doesn't.
 */
export async function syncRewards() {
  const { data, error } = await supabase.rpc('sync_rewards')

  if (error) {
    console.error('Could not sync rewards:', error.message)
    return null
  }
  return data
}

/** "Badge unlocked: First Item Added" — or a combined line for several. */
export function describeNewBadges(newlyEarned) {
  if (!newlyEarned || newlyEarned.length === 0) return ''
  if (newlyEarned.length === 1) {
    const badge = newlyEarned[0]
    return `Badge unlocked: ${badge.icon ?? ''} ${badge.name}`.trim()
  }
  return `${newlyEarned.length} badges unlocked: ${newlyEarned.map((b) => b.name).join(', ')}`
}
