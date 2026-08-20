import { describe, expect, it } from 'vitest'
import { buildReminder, daysBetween } from '../../supabase/functions/send-expiry-reminders/message.ts'

// The Edge Function runs on Deno and can't be exercised here, but its message
// building is pure and is the only part with logic worth getting wrong.

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-08-20', '2026-08-20')).toBe(0)
    expect(daysBetween('2026-08-20', '2026-08-21')).toBe(1)
    expect(daysBetween('2026-08-20', '2026-08-23')).toBe(3)
  })

  it('handles month and year boundaries', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })
})

describe('buildReminder', () => {
  const TODAY = '2026-08-20'

  it('sends nothing when there is nothing to report', () => {
    expect(buildReminder([], TODAY)).toBeNull()
    expect(buildReminder(null, TODAY)).toBeNull()
  })

  it('names the item directly when there is only one', () => {
    const r = buildReminder([{ name: 'Milk', expiry_date: '2026-08-21' }], TODAY)
    expect(r.title).toBe('Expiring soon')
    expect(r.body).toBe('Milk expires tomorrow.')
  })

  it('uses "today" for something expiring today', () => {
    const r = buildReminder([{ name: 'Curd', expiry_date: TODAY }], TODAY)
    expect(r.body).toBe('Curd expires today.')
  })

  it('reads "today" for anything already overdue rather than "in -2 days"', () => {
    const r = buildReminder([{ name: 'Bread', expiry_date: '2026-08-18' }], TODAY)
    expect(r.body).toBe('Bread expires today.')
  })

  it('counts and lists when there are several', () => {
    const r = buildReminder(
      [
        { name: 'Milk', expiry_date: '2026-08-21' },
        { name: 'Curd', expiry_date: '2026-08-20' },
      ],
      TODAY,
    )
    expect(r.title).toBe('2 items expiring soon')
    // Soonest first, so the most urgent survives OS truncation.
    expect(r.body).toBe('Curd (today), Milk (tomorrow).')
  })

  it('truncates long lists instead of letting the OS cut them mid-word', () => {
    const items = [
      { name: 'A', expiry_date: '2026-08-20' },
      { name: 'B', expiry_date: '2026-08-21' },
      { name: 'C', expiry_date: '2026-08-22' },
      { name: 'D', expiry_date: '2026-08-23' },
      { name: 'E', expiry_date: '2026-08-23' },
    ]
    const r = buildReminder(items, TODAY)
    expect(r.title).toBe('5 items expiring soon')
    expect(r.body).toBe('A (today), B (tomorrow), C (in 2 days) and 2 more.')
  })

  it('does not mutate the array it is given', () => {
    const items = [
      { name: 'Milk', expiry_date: '2026-08-23' },
      { name: 'Curd', expiry_date: '2026-08-20' },
    ]
    buildReminder(items, TODAY)
    expect(items[0].name).toBe('Milk')
  })
})
