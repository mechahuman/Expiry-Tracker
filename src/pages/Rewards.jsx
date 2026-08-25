import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { syncRewards } from '../lib/rewards'
import { badgeProgress, progressLabel } from '../lib/rewardProgress'
import './Rewards.css'

export default function Rewards() {
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)

  const [badges, setBadges] = useState(null)
  const [earnedIds, setEarnedIds] = useState(new Set())
  const [points, setPoints] = useState(null)
  const [progress, setProgress] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session) return undefined
    let cancelled = false

    // Sync first so the counts shown are current, then read back the badge
    // catalogue and what's been earned. Running the sync here too means the
    // screen can't show progress that's a save behind.
    ;(async () => {
      const [rewards, badgeRes, earnedRes] = await Promise.all([
        syncRewards(),
        supabase.from('badges').select('id, name, description, icon, criteria_type, criteria_value'),
        supabase.from('user_badges').select('badge_id'),
      ])

      if (cancelled) return

      if (badgeRes.error) {
        setError(badgeRes.error.message)
        setBadges([])
        return
      }

      setBadges(badgeRes.data ?? [])
      setEarnedIds(new Set((earnedRes.data ?? []).map((row) => row.badge_id)))

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

  return (
    <div className="rewards">
      <header className="rewards-header">
        <button type="button" className="btn-text" onClick={() => navigate('/home')}>
          Back
        </button>
        <h2>Rewards</h2>
        <span className="header-spacer" aria-hidden="true" />
      </header>

      <div className="rewards-score">
        <span className="rewards-points">{points ?? '…'}</span>
        <span className="rewards-points-label">points</span>
        <p className="rewards-earned-count">
          {earnedIds.size} of {badges?.length ?? 0} badges unlocked
        </p>
      </div>

      {error && <p className="form-banner error rewards-error">{error}</p>}

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
    </div>
  )
}
