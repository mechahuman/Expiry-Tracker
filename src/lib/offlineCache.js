/**
 * Keeps the last successfully fetched inventory so the app can show something
 * useful with no connection, rather than an empty list.
 *
 * Deliberately stored client-side and keyed by user id, rather than letting
 * Workbox runtime-cache Supabase's REST responses. That alternative looks
 * tidier but is unsafe here: the auth token travels in a header, not the URL,
 * so a URL-keyed HTTP cache would happily serve one account's inventory to
 * whoever signs in next on a shared device. Keying by user and clearing on
 * sign-out avoids the problem entirely.
 *
 * Every access is guarded -- localStorage throws rather than returning null
 * when storage is unavailable (Safari private mode, blocked site data), the
 * same hazard already handled in store/authStore.js. A missing cache is a
 * fine outcome; a crash is not.
 */

const KEY_PREFIX = 'expiry-tracker:items:'

const keyFor = (userId) => `${KEY_PREFIX}${userId}`

export function saveItems(userId, items, storage = globalThis.localStorage) {
  if (!userId || !storage) return
  try {
    storage.setItem(keyFor(userId), JSON.stringify({ savedAt: Date.now(), items }))
  } catch {
    /* Storage full or unavailable -- the app works fine without the cache. */
  }
}

/** @returns {{items: Array, savedAt: number}|null} */
export function loadItems(userId, storage = globalThis.localStorage) {
  if (!userId || !storage) return null
  try {
    const raw = storage.getItem(keyFor(userId))
    if (!raw) return null

    const parsed = JSON.parse(raw)
    // Anything not matching the expected shape is treated as absent. Cached
    // data outlives deploys, so a stale format from an older build shouldn't
    // be handed to a component that no longer understands it.
    if (!parsed || !Array.isArray(parsed.items)) return null

    return { items: parsed.items, savedAt: parsed.savedAt ?? null }
  } catch {
    return null
  }
}

export function clearItems(userId, storage = globalThis.localStorage) {
  if (!userId || !storage) return
  try {
    storage.removeItem(keyFor(userId))
  } catch {
    /* Nothing to do -- see note above. */
  }
}

/**
 * Drops every cached inventory, whoever it belongs to. Used on sign-out, where
 * the point is that the next person at this device sees nothing of the last.
 */
export function clearAllItems(storage = globalThis.localStorage) {
  if (!storage) return
  try {
    const keys = []
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (key?.startsWith(KEY_PREFIX)) keys.push(key)
    }
    // Collected first, then removed: deleting while iterating shifts the
    // indices and would skip entries.
    keys.forEach((key) => storage.removeItem(key))
  } catch {
    /* Nothing to do -- see note above. */
  }
}
