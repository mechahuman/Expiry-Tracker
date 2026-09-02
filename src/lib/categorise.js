/**
 * Guesses an item's category from its name.
 *
 * Returns the category *name*, not an id. Category ids are `serial` values
 * assigned by Postgres (see supabase/schema.sql), so hardcoding "2 is Dairy"
 * would break silently and mis-file everything if that table were ever
 * reseeded in a different order. Callers resolve the name against the
 * categories they already fetched.
 *
 * Used by ItemForm, which every entry path goes through -- manual, voice and
 * OCR alike. Putting it in voiceParser instead would leave manual entry with
 * nothing.
 */

/**
 * Keyword to category. Weighted toward Indian groceries, since the app runs on
 * IST and the name placeholder is already "Amul milk".
 *
 * Anything not listed stays uncategorised on purpose: a blank field reads as
 * "your turn", where a confidently wrong category is quietly misleading. Same
 * reasoning as the OCR parser's refusal to guess implausible dates.
 */
const KEYWORDS = {
  Dairy: [
    'milk',
    'curd',
    'dahi',
    'yogurt',
    'yoghurt',
    'paneer',
    'cheese',
    'butter',
    'ghee',
    'cream',
    'buttermilk',
    'chaas',
    'lassi',
    'khoya',
    'malai',
  ],
  Snacks: [
    'chips',
    'wafers',
    'biscuit',
    'biscuits',
    'cookie',
    'cookies',
    'namkeen',
    'bhujia',
    'mixture',
    'chocolate',
    'candy',
    'popcorn',
    'kurkure',
    'rusk',
    'crackers',
    'nuts',
    'chikki',
  ],
  Beverages: [
    'juice',
    'cola',
    'soda',
    'water',
    'tea',
    'coffee',
    'squash',
    'sharbat',
    'drink',
    'soft drink',
    'energy drink',
  ],
  'Ready-to-eat': [
    'noodles',
    'maggi',
    'pasta',
    'frozen',
    'paratha',
    'curry',
    'soup',
    'canned',
    'instant',
    'poha',
    'upma',
    'pizza',
    'sandwich',
    'ready meal',
  ],
  Other: [
    'apple',
    'apples',
    'banana',
    'bananas',
    'fruit',
    'fruits',
    'vegetable',
    'vegetables',
    'rice',
    'atta',
    'flour',
    'dal',
    'oil',
    'sugar',
    'salt',
    'egg',
    'eggs',
    'bread',
    'onion',
    'potato',
    'tomato',
  ],
}

/** Flattened keyword -> category, built once at module load. */
const LOOKUP = Object.entries(KEYWORDS).flatMap(([category, words]) =>
  words.map((word) => [word, category]),
)

/**
 * Lowercased, punctuation flattened to spaces, and wrapped in spaces.
 *
 * The wrapping is what gives word-boundary matching for free: searching for
 * " milk " cannot match inside "milky" or "buttermilk". Without it, plain
 * substring matching files "Milky Bar" as Dairy and matches "tea" inside
 * "steak".
 */
function normalise(name) {
  const cleaned = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return cleaned ? ` ${cleaned} ` : ''
}

/**
 * @param {string} name  the item name, as typed or as transcribed
 * @returns {string|null} a category name, or null when nothing matches
 */
export function suggestCategory(name) {
  const haystack = normalise(name)
  if (!haystack) return null

  // Last match wins, because English puts the head noun last: "chocolate milk"
  // is a milk, "milk chocolate" is a chocolate. Longest-match-wins -- the more
  // obvious rule -- gets that pair exactly backwards, since "chocolate" is the
  // longer word in both.
  let best = null
  let bestIndex = -1

  for (const [word, category] of LOOKUP) {
    const at = haystack.lastIndexOf(` ${word} `)
    if (at > bestIndex) {
      bestIndex = at
      best = category
    }
  }

  return best
}

/** Exposed for the test that guards against a keyword being listed twice. */
export const KEYWORD_MAP = KEYWORDS
