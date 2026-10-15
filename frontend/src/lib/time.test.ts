import { describe, expect, it } from 'vitest'
import { formatRelative, greetingFor } from './time'

const NOW = new Date('2026-10-15T12:00:00Z')
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString()

describe('formatRelative', () => {
  it.each([
    [10, 'just now'],
    [44, 'just now'],
    [60, '1 minute ago'],
    [5 * 60, '5 minutes ago'],
    [2 * 3600, '2 hours ago'],
    [24 * 3600, 'yesterday'],
    [3 * 24 * 3600, '3 days ago'],
    [7 * 24 * 3600, 'last week'],
    [60 * 24 * 3600, '2 months ago'],
  ])('%i seconds ago -> %s', (seconds, expected) => {
    expect(formatRelative(ago(seconds), NOW)).toBe(expected)
  })

  it('handles times slightly in the future (clock skew) as "just now"', () => {
    expect(formatRelative(ago(-20), NOW)).toBe('just now')
  })
})

describe('greetingFor', () => {
  it.each([
    [5, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('%i:00 -> %s', (hour, expected) => {
    expect(greetingFor(new Date(2026, 9, 15, hour))).toBe(expected)
  })
})
