import { describe, expect, it } from 'vitest'
import { parseTranscript } from './voiceParser'

// Fixed reference date so relative phrases ("tomorrow") are deterministic.
const REF = new Date(2026, 7, 20, 12, 0, 0) // 20 Aug 2026, local noon

const parse = (text) => parseTranscript(text, REF)

describe('parseTranscript', () => {
  it('handles the roadmap example: quantity + unit + name + date', async () => {
    const r = await parse('two packs of milk expiring 25th August')
    expect(r.quantity).toBe(2)
    expect(r.unit).toBe('packs')
    expect(r.name).toBe('Milk')
    expect(r.expiry_date).toBe('2026-08-25')
  })

  it('maps spoken unit synonyms onto the units the DB accepts', async () => {
    const grams = await parse('500 grams of rice')
    expect(grams.quantity).toBe(500)
    expect(grams.unit).toBe('g')
    expect(grams.name).toBe('Rice')

    const kilos = await parse('2 kilograms atta')
    expect(kilos.unit).toBe('kg')

    const litres = await parse('one litre buttermilk')
    expect(litres.quantity).toBe(1)
    expect(litres.unit).toBe('l')
  })

  it('resolves relative dates against the reference date', async () => {
    const r = await parse('curd expiring tomorrow')
    expect(r.expiry_date).toBe('2026-08-21')
    expect(r.name).toBe('Curd')
  })

  it('does not mistake a spoken quantity for a clock time', async () => {
    // The bug this guards: chrono reads "two" as 2 o'clock, eats the number,
    // and the quantity silently vanishes.
    const r = await parse('two packs of biscuits')
    expect(r.quantity).toBe(2)
    expect(r.unit).toBe('packs')
    expect(r.name).toBe('Biscuits')
    expect(r.expiry_date).toBeNull()
  })

  it('leaves fields blank rather than guessing them', async () => {
    const nameOnly = await parse('paneer')
    expect(nameOnly.name).toBe('Paneer')
    expect(nameOnly.quantity).toBeNull()
    expect(nameOnly.unit).toBeNull()
    expect(nameOnly.expiry_date).toBeNull()

    // No product word at all -- name stays empty instead of absorbing filler.
    const noName = await parse('two packs')
    expect(noName.quantity).toBe(2)
    expect(noName.name).toBe('')
  })

  it('returns an all-blank result for empty or whitespace input', async () => {
    for (const input of ['', '   ', null, undefined]) {
      const r = await parse(input)
      expect(r.name).toBe('')
      expect(r.quantity).toBeNull()
      expect(r.unit).toBeNull()
      expect(r.expiry_date).toBeNull()
    }
  })

  it('strips filler words from the ends of the name but not the middle', async () => {
    const trailing = await parse('add a packet of bread best before 30th August')
    expect(trailing.name).toBe('Bread')
    expect(trailing.unit).toBe('packs')

    // "of" in the middle of a real product name survives.
    const middle = await parse('oil of olay')
    expect(middle.name).toBe('Oil of olay')
  })

  it('still catches a spoken quantity when the unit is one the DB has no column for', async () => {
    const r = await parse('three bottles')
    // "bottles" isn't one of the six DB units, so it falls through to the
    // bare-number rule: keep the 3, leave the unit alone, let "bottles"
    // become the name for the user to correct.
    expect(r.quantity).toBe(3)
    expect(r.unit).toBeNull()
    expect(r.name).toBe('Bottles')
  })

  it('treats a bare article as filler, not as the number one', async () => {
    // "a"/"an" alone are too weak a signal to be a count -- but they still
    // count when bound to a real unit, as in the "a packet of bread" case.
    const r = await parse('a paneer block')
    expect(r.quantity).toBeNull()
    expect(r.name).toBe('Paneer block')
  })

  it('reports which fields it filled in, for the Verify screen tags', async () => {
    const r = await parse('two packs of milk expiring 25th August')
    expect(r.detected).toEqual({
      quantity: true,
      unit: true,
      expiry_date: true,
      name: true,
    })

    const sparse = await parse('paneer')
    expect(sparse.detected.name).toBe(true)
    expect(sparse.detected.quantity).toBeUndefined()
    expect(sparse.detected.expiry_date).toBeUndefined()
  })

  it('keeps the original transcript for display', async () => {
    const r = await parse('Two Packs Of Milk')
    expect(r.transcript).toBe('Two Packs Of Milk')
  })
})
