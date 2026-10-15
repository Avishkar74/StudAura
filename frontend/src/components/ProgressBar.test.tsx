import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProgressBar } from './ProgressBar'

describe('ProgressBar', () => {
  it.each([
    [40, '40'],
    [0, '0'],
    [100, '100'],
    [150, '100'], // clamped
    [-20, '0'], // clamped
    [33.4, '33'],
  ])('value %s exposes aria-valuenow %s', (value, expected) => {
    render(<ProgressBar value={value} label="Progress" />)
    expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute(
      'aria-valuenow',
      expected,
    )
  })
})
