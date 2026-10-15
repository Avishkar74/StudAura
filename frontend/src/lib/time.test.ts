import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatDate,
  formatDue,
  formatWeekday,
  formatDuration,
  formatRelative,
  greetingFor,
} from './time'

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

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [59, '0 min'],
    [60, '1 min'],
    [2520, '42 min'],
    [3600, '1 h'],
    [3900, '1 h 5 min'],
    [-30, '0 min'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

describe('addDays', () => {
  it.each([
    ['2026-10-15', 1, '2026-10-16'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-02-28', 1, '2028-02-29'], // leap year
    ['2026-10-15', 0, '2026-10-15'],
  ])('%s plus %i days is %s', (from, days, expected) => {
    expect(addDays(from, days)).toBe(expected)
  })
})

describe('formatDue', () => {
  const today = '2026-10-15'
  it.each([
    ['2026-10-12', 'Overdue by 3 days'],
    ['2026-10-14', 'Overdue by 1 day'],
    ['2026-10-15', 'Due today'],
    ['2026-10-16', 'Due tomorrow'],
    ['2026-10-20', 'Due Oct 20'],
    ['2027-01-05', 'Due Jan 5'],
  ])('%s reads %s', (due, expected) => {
    expect(formatDue(due, today)).toBe(expected)
  })
})

describe('formatDate and formatWeekday', () => {
  it('formats calendar days without drifting across timezones', () => {
    expect(formatDate('2026-10-20')).toBe('Oct 20, 2026')
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026')
    expect(formatWeekday('2026-10-15')).toBe('Thu')
    expect(formatWeekday('2026-10-18')).toBe('Sun')
  })
})
