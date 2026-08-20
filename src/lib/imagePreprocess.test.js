import { describe, expect, it } from 'vitest'
import { contrastBounds } from './imagePreprocess'

// preprocessForOcr itself needs a real canvas, so only the pure histogram
// maths is unit-tested here; the drawing path is covered by browser testing.
describe('contrastBounds', () => {
  it('ignores outliers at both ends', () => {
    // 1000 mid-grey pixels, plus a handful of pure black and pure white that
    // a naive min/max would let flatten the whole stretch.
    const values = [
      ...Array(5).fill(0),
      ...Array(500).fill(100),
      ...Array(500).fill(150),
      ...Array(5).fill(255),
    ]
    const { low, high } = contrastBounds(values)
    expect(low).toBeGreaterThan(0)
    expect(high).toBeLessThan(255)
  })

  it('leaves near-flat images alone instead of amplifying noise', () => {
    // A blank wall: stretching this would turn sensor noise into fake edges.
    const values = Array(1000).fill(128)
    expect(contrastBounds(values)).toEqual({ low: 0, high: 255 })
  })

  it('spans a genuinely full-range image', () => {
    const values = Array.from({ length: 2560 }, (_, i) => i % 256)
    const { low, high } = contrastBounds(values)
    expect(low).toBeLessThan(20)
    expect(high).toBeGreaterThan(235)
  })
})
