import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { syncRewards } from '../lib/rewards'
import { badgeProgress, progressLabel } from '../lib/rewardProgress'
import BottomNav from '../components/BottomNav'
import './Rewards.css'

export default function Rewards() {
  const session = useAuthStore((s) => s.session)

  const [badges, setBadges] = useState(null)
  const [earnedIds, setEarnedIds] = useState(new Set())
  const [points, setPoints] = useState(null)
  const [progress, setProgress] = useState({})
  const [savedCount, setSavedCount] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false

    // Sync first so the counts shown are current, then read back the badge
    // catalogue and what's been earned. Running the sync here too means the
    // screen can't show progress that's a save behind.
    ;(async () => {
      const [rewards, badgeRes, earnedRes, savedRes] = await Promise.all([
        syncRewards(),
        supabase.from('badges').select('id, name, description, icon, criteria_type, criteria_value'),
        supabase.from('user_badges').select('badge_id'),
        supabase
          .from('inventory_items')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id)
          .eq('status', 'used'),
      ])

      if (cancelled) return

      if (badgeRes.error) {
        setError(badgeRes.error.message)
        setBadges([])
        return
      }

      setBadges(badgeRes.data ?? [])
      setEarnedIds(new Set((earnedRes.data ?? []).map((row) => row.badge_id)))
      if (!savedRes.error) setSavedCount(savedRes.count ?? 0)

      if (rewards) {
        setPoints(rewards.points)
        setProgress(rewards.progress ?? {})
      } else {
        setError('Could not refresh your progress.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session])

  // Locked badges sort to the end, so what's been achieved reads first and the
  // nearest targets sit just below it.
  const sorted = [...(badges ?? [])].sort((a, b) => {
    const aEarned = earnedIds.has(a.id)
    const bEarned = earnedIds.has(b.id)
    if (aEarned !== bEarned) return aEarned ? -1 : 1
    return a.criteria_value - b.criteria_value
  })

  const streak = progress?.streak_days ?? 0

  return (
    <div className="rewards has-nav">
      <header className="page-header">
        <h1>Your Impact</h1>
        <p className="eyebrow">Waste reduction report</p>
      </header>

      <div className="rewards-body">
        {error && <p className="form-banner error">{error}</p>}

        {streak > 0 && (
          <section className="streak-card">
            <span className="streak-emoji" role="presentation">
              🔥
            </span>
            <div>
              <p className="streak-title">
                {streak}-Day Zero-Waste Streak
              </p>
              <p className="streak-sub">Keep it up! You’re doing amazing.</p>
            </div>
          </section>
        )}

        {/* The design's third stat is "kg Avoided". We store no weights, and a
            fabricated kilo figure is exactly the kind of number people quote
            elsewhere -- badges unlocked is real and needs no invention. */}
        <div className="stat-row">
          <Stat value={points ?? '…'} label="Points" />
          <Stat value={savedCount ?? '…'} label="Food Saved" />
          <Stat value={`${earnedIds.size}/${badges?.length ?? 0}`} label="Badges" />
        </div>

        <section className="section">
          <h3 className="section-title">Achievements</h3>

          {badges === null ? (
            <p className="rewards-loading">Loading your rewards…</p>
          ) : (
            <ul className="badge-grid">
              {sorted.map((badge) => {
                const state = badgeProgress(badge, progress, earnedIds)
                return (
                  <li key={badge.id} className={`badge-card ${state.earned ? 'earned' : 'locked'}`}>
                    <span className="badge-icon" role="presentation">
                      {badge.icon}
                    </span>
                    <p className="badge-name">{badge.name}</p>
                    <p className="badge-description">{badge.description}</p>

                    {state.earned ? (
                      <span className="badge-status earned">Unlocked</span>
                    ) : (
                      <>
                        <div
                          className="badge-bar"
                          role="progressbar"
                          aria-valuenow={state.percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${badge.name} progress`}
                        >
                          <div className="badge-bar-fill" style={{ width: `${state.percent}%` }} />
                        </div>
                        <span className="badge-status">{progressLabel(state)}</span>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
