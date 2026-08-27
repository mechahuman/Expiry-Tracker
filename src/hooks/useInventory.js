import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/authStore'
import { loadItems, saveItems } from '../lib/offlineCache'
import { useOnlineStatus } from './useOnlineStatus'

/**
 * The active inventory, plus the offline-cache fallback around it.
 *
 * Extracted from Home when the design split it into two screens: Home (a
 * dashboard) and My Food (the list) now need the same data, and duplicating
 * the fetch would mean duplicating the cache write, the stale-data fallback
 * and the refetch-on-reconnect -- three things that have to stay in step.
 *
 * @returns {{items: Array|null, error: string, staleSince: number|null,
 *            online: boolean, markUsed: (id: string) => Promise<boolean>,
 *            refetch: () => void}}
 *          `items` is null while loading, which is deliberately distinct from
 *          an empty array meaning "loaded, and you own nothing".
 */
export function useInventory() {
  const session = useAuthStore((s) => s.session)
  const online = useOnlineStatus()

  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [staleSince, setStaleSince] = useState(null)

  const fetchItems = useCallback(() => {
    if (!session) return undefined
    let cancelled = false

    // .eq('user_id', ...) is redundant with RLS (which already scopes every
    // query to the caller) but it's what lets this query match the
    // (user_id, status) index added in 002_hardening.sql, and it documents
    // intent inline rather than relying on RLS to explain itself.
    supabase
      .from('inventory_items')
      .select('id, name, quantity, unit, expiry_date, category_id, category:categories(name)')
      .eq('user_id', session.user.id)
      .eq('status', 'active')
      .order('expiry_date', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return

        if (!fetchError) {
          setError('')
          setStaleSince(null)
          setItems(data ?? [])
          // Keeps the offline fallback current. Only ever written from a
          // successful response, so the cache can't be poisoned by a failure.
          saveItems(session.user.id, data ?? [])
          return
        }

        // A failed fetch with no connection isn't really an error to report --
        // it's the expected outcome, and the cached list is a better answer
        // than an empty screen. A failure while online is a real error.
        const cached = loadItems(session.user.id)
        if (cached) {
          setItems(cached.items)
          setStaleSince(cached.savedAt)
          setError('')
        } else {
          setError(fetchError.message)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(fetchItems, [fetchItems])

  // Coming back online while showing cached data: refresh silently, so the
  // stale banner clears itself rather than waiting for the user to navigate.
  useEffect(() => {
    if (!online || !staleSince) return undefined
    return fetchItems()
  }, [online, staleSince, fetchItems])

  /** Returns true on success, so callers can decide whether to resync rewards. */
  const markUsed = useCallback(async (id) => {
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('id', id)

    if (updateError) {
      setError(updateError.message)
      return false
    }
    setItems((prev) => (prev ?? []).filter((it) => it.id !== id))
    return true
  }, [])

  return { items, error, staleSince, online, markUsed, refetch: fetchItems }
}
