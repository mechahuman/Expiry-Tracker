import { toISODateString } from './date'

/**
 * Turns a spoken sentence like "two packs of milk expiring 25th August" into
 * { name: 'Milk', quantity: 2, unit: 'packs', expiry_date: '2026-08-25' }.
 *
 * Guiding rule from the roadmap: a blank field is safer than a wrong one.
 * Anything this can't confidently extract is left null for the user to fill
 * in on the Verify screen, rather than guessed.
 */

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
}

// Maps everything a person might say onto the six units the DB accepts
// (see UNITS in components/ItemForm.jsx).
const UNIT_SYNONYMS = {
  pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', ltr: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  pack: 'packs', packs: 'packs', packet: 'packs', packets: 'packs',
}

// Words that carry no product meaning, trimmed off the ends of the name.
// Only stripped from the edges, never the middle -- "oil of olay" should keep
// its "of", but "of milk expiring" should lose both.
const FILLERS = new Set([
  'add', 'a', 'an', 'the', 'of', 'i', 'have', 'got', 'there', 'is', 'are',
  'this', 'that', 'some', 'my', 'expiring', 'expires', 'expire', 'expired',
  'expiry', 'best', 'before', 'by', 'on', 'at', 'in', 'until', 'till', 'date',
  'and', 'with', 'it', 'to',
])

// Longest-first so "kilograms" can't be shadowed by "kg" in the alternation.
const byLengthDesc = (a, b) => b.length - a.length
const NUMBER_ALT = Object.keys(NUMBER_WORDS).sort(byLengthDesc).join('|')
const UNIT_ALT = Object.keys(UNIT_SYNONYMS).sort(byLengthDesc).join('|')

const QTY_UNIT_RE = new RegExp(`\\b(\\d+(?:\\.\\d+)?|${NUMBER_ALT})\\s*(?:x\\s*)?(${UNIT_ALT})\\b`, 'i')

// Standalone quantity, for when the unit isn't one the DB knows ("three
// bottles"). "a"/"an" are excluded: alone they're almost always articles
// rather than counts, and FILLERS strips them from the name anyway. They
// still count when bound to a real unit above, as in "a packet of bread".
const BARE_NUMBER_ALT = Object.keys(NUMBER_WORDS)
  .filter((word) => word !== 'a' && word !== 'an')
  .sort(byLengthDesc)
  .join('|')
const BARE_QTY_RE = new RegExp(`\\b(\\d+(?:\\.\\d+)?|${BARE_NUMBER_ALT})\\b`, 'i')

// chrono-node is ~60kB gzipped and only voice/OCR need it, so it's loaded on
// first parse rather than bundled into the app shell (same principle as the
// Module 0 decision about the OCR/Voice WASM libraries).
let chronoPromise
function loadChrono() {
  if (!chronoPromise) chronoPromise = import('chrono-node')
  return chronoPromise
}

function toNumber(token) {
  const word = NUMBER_WORDS[token.toLowerCase()]
  if (word !== undefined) return word
  const n = Number(token)
  return Number.isFinite(n) ? n : null
}

const overlaps = ([s1, e1], [s2, e2]) => s1 < e2 && s2 < e1

/** Cuts the matched spans out of the transcript, leaving the name behind. */
function removeSpans(text, spans) {
  const sorted = [...spans].sort((a, b) => a[0] - b[0])
  let out = ''
  let pos = 0
  for (const [start, end] of sorted) {
    if (start > pos) out += text.slice(pos, start)
    pos = Math.max(pos, end)
  }
  return out + text.slice(pos)
}

function cleanName(text) {
  const words = text
    .replace(/[^\p{L}\p{N}\s%.-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

  let start = 0
  let end = words.length
  while (start < end && FILLERS.has(words[start].toLowerCase())) start += 1
  while (end > start && FILLERS.has(words[end - 1].toLowerCase())) end -= 1

  const name = words.slice(start, end).join(' ')
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : ''
}

/**
 * @param {string} transcript raw text from the speech recogniser
 * @param {Date} [refDate] "now" for relative dates -- injectable so tests are deterministic
 * @returns {Promise<{name, quantity, unit, expiry_date, detected, transcript}>}
 *          `detected` flags which fields were auto-filled, for the Verify screen's tags.
 */
export async function parseTranscript(transcript, refDate = new Date()) {
  const raw = (transcript ?? '').trim()
  const parsed = { name: '', quantity: null, unit: null, expiry_date: null }
  const detected = {}

  if (!raw) return { ...parsed, detected, transcript: raw }

  // Lowercased only (never re-spaced) so indices stay aligned with `raw`,
  // which is what chrono sees and what the name is cut out of.
  const lower = raw.toLowerCase()
  const spans = []

  // 1. Quantity + unit together, e.g. "two packs" / "500 g". Done before the
  //    date so a matched quantity can veto a chrono hit on the same words.
  const qtyUnit = lower.match(QTY_UNIT_RE)
  if (qtyUnit) {
    const value = toNumber(qtyUnit[1])
    if (value !== null && value > 0) {
      parsed.quantity = value
      parsed.unit = UNIT_SYNONYMS[qtyUnit[2].toLowerCase()]
      detected.quantity = true
      detected.unit = true
      spans.push([qtyUnit.index, qtyUnit.index + qtyUnit[0].length])
    }
  }

  // 2. Date. Any chrono hit overlapping the quantity is discarded -- otherwise
  //    "two packs" gets read as 2 o'clock and the quantity disappears.
  const chrono = await loadChrono()
  let chronoHits = []
  try {
    chronoHits = chrono.parse(raw, refDate, { forwardDate: true })
  } catch {
    chronoHits = []
  }

  const dateHit = chronoHits.find(
    (hit) => !spans.some((span) => overlaps([hit.index, hit.index + hit.text.length], span)),
  )
  if (dateHit) {
    const date = dateHit.start?.date?.()
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      parsed.expiry_date = toISODateString(date)
      detected.expiry_date = true
      spans.push([dateHit.index, dateHit.index + dateHit.text.length])
    }
  }

  // 3. A bare number ("3 milk") only counts as quantity if step 1 found
  //    nothing and it isn't part of the date we just matched.
  if (parsed.quantity === null) {
    const bare = lower.match(BARE_QTY_RE)
    if (bare) {
      const span = [bare.index, bare.index + bare[0].length]
      if (!spans.some((s) => overlaps(span, s))) {
        const value = toNumber(bare[1])
        if (value !== null && value > 0) {
          parsed.quantity = value
          detected.quantity = true
          spans.push(span)
        }
      }
    }
  }

  // 4. Whatever's left, minus edge filler words, is the product name.
  const name = cleanName(removeSpans(raw, spans))
  if (name) {
    parsed.name = name
    detected.name = true
  }

  return { ...parsed, detected, transcript: raw }
}
