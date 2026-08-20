import { describe, expect, it } from 'vitest'
import { parseOcrText } from './ocrParser'

describe('parseOcrText', () => {
  it('reads a labelled expiry date', () => {
    expect(parseOcrText('EXP 15/03/2027').expiry_date).toBe('2027-03-15')
    expect(parseOcrText('USE BY 15 MAR 2027').expiry_date).toBe('2027-03-15')
    expect(parseOcrText('BEST BEFORE 15-03-2027').expiry_date).toBe('2027-03-15')
  })

  it('assumes DD/MM, but flips when the numbers rule it out', () => {
    // 15 can't be a month, so it's the day (Indian convention anyway).
    expect(parseOcrText('EXP 15/03/2027').expiry_date).toBe('2027-03-15')
    // 03/15 -- 15 can't be a month, so this must be MM/DD.
    expect(parseOcrText('EXP 03/15/2027').expiry_date).toBe('2027-03-15')
    // Genuinely ambiguous: 05/03 -> DD/MM, so 5 March.
    expect(parseOcrText('EXP 05/03/2027').expiry_date).toBe('2027-03-05')
  })

  it('treats a month-only expiry as the end of that month', () => {
    // "EXP 03/2027" means good through March, not until 1 March.
    expect(parseOcrText('EXP 03/2027').expiry_date).toBe('2027-03-31')
    expect(parseOcrText('BEST BEFORE FEB 2028').expiry_date).toBe('2028-02-29')
  })

  it('computes "X months from manufacturing" against the MFG date', () => {
    const r = parseOcrText('MFG 03/2026 BEST BEFORE 6 MONTHS FROM MANUFACTURE')
    expect(r.expiry_date).toBe('2026-09-01')
    expect(r.source).toBe('months-from-manufacture')
  })

  it('handles the implied form, without the word "manufacture"', () => {
    const r = parseOcrText('MFD 15/01/2026 BEST BEFORE 9 MONTHS')
    expect(r.expiry_date).toBe('2026-10-15')
    expect(r.source).toBe('months-from-manufacture')
  })

  it('clamps the day when adding months overflows a short month', () => {
    // 31 Dec + 2 months is 28 Feb, not 3 March (JS Date rolls over by default).
    const r = parseOcrText('PKD 31/12/2026 BEST BEFORE 2 MONTHS')
    expect(r.expiry_date).toBe('2027-02-28')
  })

  it('prefers the labelled expiry over the manufacturing date', () => {
    const r = parseOcrText('MFG 01/2026 EXP 01/2028')
    expect(r.expiry_date).toBe('2028-01-31')
    expect(r.source).toBe('labelled-expiry')
  })

  it('falls back to the latest non-MFG date when nothing is labelled', () => {
    const r = parseOcrText('MFG 01/01/2026 01/01/2028')
    expect(r.expiry_date).toBe('2028-01-01')
    expect(r.source).toBe('unlabelled-date')
  })

  it('finds the date inside surrounding packaging noise', () => {
    const packet = `
      TASTY CRUNCHY SNACKS
      NET WT 200g
      NUTRITIONAL INFORMATION PER 100g
      ENERGY 520 KCAL PROTEIN 7.2g
      BEST BEFORE 20/11/2027
      MRP Rs. 45.00 INCL OF ALL TAXES
    `
    expect(parseOcrText(packet).expiry_date).toBe('2027-11-20')
  })

  it('matches a label split across an OCR line break', () => {
    expect(parseOcrText('BEST\nBEFORE\n20/11/2027').expiry_date).toBe('2027-11-20')
  })

  it('returns nothing rather than guessing when there is no date', () => {
    for (const input of ['', '   ', null, undefined, 'TASTY SNACKS NET WT 200g']) {
      const r = parseOcrText(input)
      expect(r.expiry_date).toBeNull()
      expect(r.detected.expiry_date).toBeUndefined()
      expect(r.source).toBeNull()
    }
  })

  it('rejects impossible dates rather than accepting OCR garbage', () => {
    expect(parseOcrText('EXP 45/99/2027').expiry_date).toBeNull()
    expect(parseOcrText('EXP 31/02/2027').expiry_date).toBeNull() // Feb has no 31st
    expect(parseOcrText('EXP 15/03/1850').expiry_date).toBeNull()
  })

  it('keeps the raw text for display on the Verify screen', () => {
    expect(parseOcrText('  EXP 15/03/2027  ').text).toBe('EXP 15/03/2027')
  })
})
