import { beforeEach, describe, expect, it } from 'vitest'
import { clearAllItems, clearItems, loadItems, saveItems } from './offlineCache'

/** Minimal localStorage stand-in -- Vitest runs in node, which has none. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  }
}

const USER = 'user-a'
const ITEMS = [{ id: '1', name: 'Milk' }]

let storage
beforeEach(() => {
  storage = fakeStorage()
})

describe('saveItems / loadItems', () => {
  it('round-trips the items with a timestamp', () => {
    saveItems(USER, ITEMS, storage)
    const result = loadItems(USER, storage)
    expect(result.items).toEqual(ITEMS)
    expect(typeof result.savedAt).toBe('number')
  })

  it('returns null when nothing has been cached', () => {
    expect(loadItems(USER, storage)).toBeNull()
  })

  it('keeps each user separate', () => {
    saveItems('user-a', [{ id: '1', name: 'A milk' }], storage)
    saveItems('user-b', [{ id: '2', name: 'B chips' }], storage)
    expect(loadItems('user-a', storage).items[0].name).toBe('A milk')
    expect(loadItems('user-b', storage).items[0].name).toBe('B chips')
  })

  it('treats a stale or malformed entry as absent', () => {
    // Cached data outlives deploys, so an older build's shape must not be
    // handed to a component that no longer understands it.
    storage.setItem('expiry-tracker:items:user-a', 'not json')
    expect(loadItems(USER, storage)).toBeNull()

    storage.setItem('expiry-tracker:items:user-a', JSON.stringify({ items: 'nope' }))
    expect(loadItems(USER, storage)).toBeNull()
  })

  it('does nothing without a user id', () => {
    saveItems(null, ITEMS, storage)
    expect(storage._map.size).toBe(0)
    expect(loadItems(undefined, storage)).toBeNull()
  })
})

describe('clearing', () => {
  it('clears one user without touching another', () => {
    saveItems('user-a', ITEMS, storage)
    saveItems('user-b', ITEMS, storage)
    clearItems('user-a', storage)
    expect(loadItems('user-a', storage)).toBeNull()
    expect(loadItems('user-b', storage)).not.toBeNull()
  })

  it('clears every cached inventory on sign-out', () => {
    saveItems('user-a', ITEMS, storage)
    saveItems('user-b', ITEMS, storage)
    storage.setItem('unrelated-key', 'keep me')

    clearAllItems(storage)

    expect(loadItems('user-a', storage)).toBeNull()
    expect(loadItems('user-b', storage)).toBeNull()
    // Only our own keys -- this must not wipe the onboarding flag or session.
    expect(storage.getItem('unrelated-key')).toBe('keep me')
  })

  it('removes all entries even though deleting shifts the indices', () => {
    for (const user of ['a', 'b', 'c', 'd']) saveItems(user, ITEMS, storage)
    clearAllItems(storage)
    expect(storage._map.size).toBe(0)
  })
})

describe('when storage is unavailable', () => {
  // Safari private mode throws on access rather than returning null.
  const throwingStorage = {
    get length() {
      throw new Error('denied')
    },
    key: () => {
      throw new Error('denied')
    },
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
    removeItem: () => {
      throw new Error('denied')
    },
  }

  it('degrades quietly instead of crashing the app', () => {
    expect(() => saveItems(USER, ITEMS, throwingStorage)).not.toThrow()
    expect(loadItems(USER, throwingStorage)).toBeNull()
    expect(() => clearItems(USER, throwingStorage)).not.toThrow()
    expect(() => clearAllItems(throwingStorage)).not.toThrow()
  })

  it('copes with no storage object at all', () => {
    expect(() => saveItems(USER, ITEMS, null)).not.toThrow()
    expect(loadItems(USER, null)).toBeNull()
  })
})
