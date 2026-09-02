import { describe, expect, it } from 'vitest'
import { KEYWORD_MAP, suggestCategory } from './categorise'

describe('suggestCategory', () => {
  it('matches the plain cases', () => {
    expect(suggestCategory('milk')).toBe('Dairy')
    expect(suggestCategory('yogurt')).toBe('Dairy')
    expect(suggestCategory('chips')).toBe('Snacks')
    expect(suggestCategory('apples')).toBe('Other')
  })

  it('handles a brand in front of the noun', () => {
    expect(suggestCategory('Amul milk')).toBe('Dairy')
    expect(suggestCategory('Lays chips')).toBe('Snacks')
    expect(suggestCategory('Maggi noodles')).toBe('Ready-to-eat')
  })

  it('takes the LAST keyword, because the head noun comes last', () => {
    // The pair that makes longest-match-wins the wrong rule: "chocolate" is
    // the longer word in both, but it is only the head noun in one of them.
    expect(suggestCategory('chocolate milk')).toBe('Dairy')
    expect(suggestCategory('milk chocolate')).toBe('Snacks')
    expect(suggestCategory('apple juice')).toBe('Beverages')
  })

  it('does not match a keyword buried inside another word', () => {
    // Each of these is a real false positive that plain substring matching
    // produces, and the reason normalise() pads with spaces.
    expect(suggestCategory('Milky Bar')).toBeNull() // contains "milk"
    expect(suggestCategory('steak')).toBeNull() // contains "tea"
    expect(suggestCategory('coconut water')).toBe('Beverages') // not "nuts"
  })

  it('treats buttermilk as its own word, not butter or milk', () => {
    // All three are Dairy, so the category is unsurprising -- the point is
    // that it matches as a whole word rather than by accident.
    expect(suggestCategory('buttermilk')).toBe('Dairy')
  })

  it('returns null rather than guessing when nothing matches', () => {
    expect(suggestCategory('Britannia 50-50')).toBeNull()
    expect(suggestCategory('mlik')).toBeNull() // typo
    expect(suggestCategory('xyz')).toBeNull()
  })

  it('survives empty, missing and punctuation-only input', () => {
    expect(suggestCategory('')).toBeNull()
    expect(suggestCategory('   ')).toBeNull()
    expect(suggestCategory(null)).toBeNull()
    expect(suggestCategory(undefined)).toBeNull()
    expect(suggestCategory('---')).toBeNull()
  })

  it('ignores case, punctuation and extra whitespace', () => {
    expect(suggestCategory('  MILK  ')).toBe('Dairy')
    expect(suggestCategory('Milk!')).toBe('Dairy')
    expect(suggestCategory('curd, fresh')).toBe('Dairy')
    expect(suggestCategory('2L Milk')).toBe('Dairy')
  })

  it('matches multi-word keywords', () => {
    expect(suggestCategory('energy drink')).toBe('Beverages')
    expect(suggestCategory('frozen paratha')).toBe('Ready-to-eat')
  })

  it('handles a voice transcript, which arrives lowercased and unpunctuated', () => {
    // The path that would break silently if this only ran on keystrokes.
    expect(suggestCategory('two packs of amul milk')).toBe('Dairy')
    expect(suggestCategory('a packet of chips')).toBe('Snacks')
  })
})

describe('the keyword table', () => {
  it('lists no keyword under two categories', () => {
    // A duplicate would resolve by object key order, which is invisible at the
    // call site and would look like a random mis-categorisation.
    const seen = new Map()
    const clashes = []

    for (const [category, words] of Object.entries(KEYWORD_MAP)) {
      for (const word of words) {
        if (seen.has(word)) clashes.push(`"${word}": ${seen.get(word)} vs ${category}`)
        else seen.set(word, category)
      }
    }

    expect(clashes).toEqual([])
  })

  it('uses only lowercase keywords, since matching lowercases the input', () => {
    const wrong = Object.values(KEYWORD_MAP)
      .flat()
      .filter((word) => word !== word.toLowerCase())
    expect(wrong).toEqual([])
  })

  it('names only categories that exist in the database', () => {
    // Mirrors the seed list in supabase/schema.sql. A name that isn't there
    // would resolve to nothing in ItemForm and silently do no work.
    expect(Object.keys(KEYWORD_MAP).sort()).toEqual(
      ['Beverages', 'Dairy', 'Other', 'Ready-to-eat', 'Snacks'].sort(),
    )
  })
})
