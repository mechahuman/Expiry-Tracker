import { toISODateString } from './date'

/**
 * Pulls an expiry date out of the raw text Tesseract reads off a package.
 *
 * Deliberately does NOT try to guess the product name. OCR of packaging picks
 * up marketing copy, nutrition tables and legal small print, and a confidently
 * wrong name is worse than an empty field the user fills in themselves. The
 * barcode path (phase 2) is the reliable name source -- barcodes carry the
 * product identity even when the printed date is unreadable.
 */

const MONTHS = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}

const EXPIRY_LABEL = /(?:BEST\s*BEFORE(?:\s*END)?|USE\s*BY|EXPIRY|EXPIRES|EXP(?:\.|\s|:)|EXP$|BBE|B\.B)/g
const MFG_LABEL = /(?:MANUFACTUR\w*|DATE\s*OF\s*MFG|MFG|MFD|PKD|PACKED|PACKING|PKG\s*DATE)/g

// "Best before 6 months from manufacture" and its many phrasings. The window
// between the number and the manufacturing word is kept tight so it can't
// accidentally bridge two unrelated lines of packaging text.
const MONTHS_FROM_MFG =
  /(\d{1,2})\s*MONTHS?\s*(?:FROM|AFTER)?\s*(?:THE\s*)?(?:DATE\s*OF\s*)?(?:MANUFACTUR\w*|MFG|MFD|PACKAGING|PACKING|PACKED)/
// "BEST BEFORE 6 MONTHS" with the manufacturing reference left implied.
const BEST_BEFORE_MONTHS = /BEST\s*BEFORE\s*(\d{1,2})\s*MONTHS?/

// Baked into the date patterns rather than validated afterwards: matching any
// three letters would let "MFG 01/2026 EXP 01/2028" parse as "26 EXP 01",
// reading the label itself as a month name and swallowing both real dates.
const MONTH_ALT = Object.keys(MONTHS).join('|')

const clamp = (n, lo, hi) => n >= lo && n <= hi

/** Two-digit years on food packaging are always 20xx in practice. */
const fullYear = (raw) => (raw.length === 2 ? 2000 + Number(raw) : Number(raw))

const lastDayOfMonth = (year, month) => new Date(year, month, 0).getDate()

/**
 * Adds months while clamping the day, so 31 Jan + 1 month is 28 Feb rather
 * than JS's default roll-over to 3 March.
 */
function addMonths({ y, m, d }, months) {
  const total = (y * 12) + (m - 1) + months
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return { y: year, m: month, d: Math.min(d, lastDayOfMonth(year, month)) }
}

// Ordered most-specific first; earlier patterns win over later ones on the
// same span of text, so "15 MAR 2027" isn't also read as a bare "MAR 2027".
const DATE_PATTERNS = [
  {
    // ISO: 2027-03-15
    re: /(\d{4})-(\d{1,2})-(\d{1,2})/g,
    build: (m) => ({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }),
  },
  {
    // 15 MAR 2027 / 15MAR27 / 15 MARCH 2027
    re: new RegExp(`(\\d{1,2})\\s*(${MONTH_ALT})[A-Z]*\\s*'?\\s*(\\d{2,4})`, 'g'),
    build: (m) => ({ y: fullYear(m[3]), m: MONTHS[m[2]], d: Number(m[1]) }),
  },
  {
    // 15/03/2027, 15-03-27, 15.03.2027
    re: /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/g,
    build: (m) => {
      const a = Number(m[1])
      const b = Number(m[2])
      // Indian packaging is DD/MM; only flip when the first number can't be a
      // month and the second can't be a day.
      const dayFirst = a > 12 || b <= 12
      return { y: fullYear(m[3]), m: dayFirst ? b : a, d: dayFirst ? a : b }
    },
  },
  {
    // MAR 2027 -- month precision only
    re: new RegExp(`(${MONTH_ALT})[A-Z]*\\s*'?\\s*(\\d{4})`, 'g'),
    build: (m) => ({ y: Number(m[2]), m: MONTHS[m[1]], d: null }),
  },
  {
    // 03/2027 -- month precision only
    re: /(\d{1,2})[/\-.](\d{4})/g,
    build: (m) => ({ y: Number(m[2]), m: Number(m[1]), d: null }),
  },
]

function isPlausible(date) {
  if (!date || !date.m || !date.y) return false
  if (!clamp(date.m, 1, 12)) return false
  if (!clamp(date.y, 2000, 2100)) return false
  if (date.d !== null && !clamp(date.d, 1, lastDayOfMonth(date.y, date.m))) return false
  return true
}

/** Every date-looking substring, with its position, non-overlapping. */
function findDates(text) {
  const found = []
  const taken = []
  const overlapsTaken = (start, end) => taken.some(([s, e]) => start < e && s < end)

  for (const { re, build } of DATE_PATTERNS) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(text)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (overlapsTaken(start, end)) continue

      // Claim the span even when the date turns out to be impossible. A
      // garbled "31/02/2027" should block the looser month-year pattern from
      // scavenging "02/2027" out of the middle of it -- salvaging a fragment
      // of text we've just judged invalid is how you get a confident wrong
      // date instead of an honest blank one.
      taken.push([start, end])

      const date = build(match)
      if (isPlausible(date)) found.push({ date, index: start, end, raw: match[0] })
    }
  }
  return found.sort((a, b) => a.index - b.index)
}

/** First date appearing shortly after a label -- same line, in practice. */
function dateNearLabel(text, labelRe, dates, window = 24) {
  labelRe.lastIndex = 0
  let match
  while ((match = labelRe.exec(text)) !== null) {
    const from = match.index + match[0].length
    const hit = dates.find((d) => d.index >= match.index && d.index <= from + window)
    if (hit) return hit
  }
  return null
}

/** Month-only dates resolve to the end of the month for expiry (the product
 *  is good through it) and the start for manufacture (earliest plausible
 *  make-date, so a computed expiry errs on the safe side). */
function resolve(date, kind) {
  const d = date.d ?? (kind === 'expiry' ? lastDayOfMonth(date.y, date.m) : 1)
  return new Date(date.y, date.m - 1, d)
}

/**
 * @param {string} rawText text as read by Tesseract
 * @returns {{expiry_date: string|null, detected: object, source: string|null, text: string}}
 *          `source` names the rule that fired, which is what makes a wrong
 *          read debuggable rather than mysterious.
 */
export function parseOcrText(rawText) {
  const result = { expiry_date: null, detected: {}, source: null, text: (rawText ?? '').trim() }
  if (!result.text) return result

  // Uppercase and collapse runs of whitespace, but keep single spaces so
  // labels split across OCR line breaks ("BEST\nBEFORE") still match.
  const text = result.text.toUpperCase().replace(/\s+/g, ' ')
  const dates = findDates(text)

  const setExpiry = (date, kind, source) => {
    result.expiry_date = toISODateString(resolve(date, kind))
    result.detected.expiry_date = true
    result.source = source
  }

  // 1. Relative shelf life -- "6 months from manufacture" plus an MFG date.
  //    chrono can't do this: it's arithmetic against another date on the pack,
  //    not a phrase relative to today.
  const relative = text.match(MONTHS_FROM_MFG) || text.match(BEST_BEFORE_MONTHS)
  if (relative) {
    const mfgHit = dateNearLabel(text, MFG_LABEL, dates)
    if (mfgHit) {
      const months = Number(relative[1])
      const base = mfgHit.date.d === null ? { ...mfgHit.date, d: 1 } : mfgHit.date
      setExpiry(addMonths(base, months), 'expiry', 'months-from-manufacture')
      return result
    }
  }

  // 2. An explicitly labelled expiry date.
  const expiryHit = dateNearLabel(text, EXPIRY_LABEL, dates)
  if (expiryHit) {
    setExpiry(expiryHit.date, 'expiry', 'labelled-expiry')
    return result
  }

  // 3. Nothing labelled. Fall back to the latest date on the pack that isn't
  //    the manufacturing date -- on a two-date package that's the expiry.
  const mfgHit = dateNearLabel(text, MFG_LABEL, dates)
  const candidates = dates.filter((d) => d !== mfgHit)
  if (candidates.length > 0) {
    const latest = candidates.reduce((best, d) =>
      resolve(d.date, 'expiry') > resolve(best.date, 'expiry') ? d : best,
    )
    setExpiry(latest.date, 'expiry', 'unlabelled-date')
  }

  return result
}
