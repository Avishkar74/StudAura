import { describe, expect, it } from 'vitest'
import { resolveApiBase } from './client'

describe('resolveApiBase', () => {
  it('is empty (same origin) when nothing is configured', () => {
    // Request paths already start with /api/v1, so a "/api" default would double the prefix.
    expect(resolveApiBase(undefined)).toBe('')
    expect(resolveApiBase('')).toBe('')
    expect(resolveApiBase('   ')).toBe('')
  })

  it('keeps an absolute origin as is', () => {
    expect(resolveApiBase('http://localhost:8000')).toBe('http://localhost:8000')
  })

  it('drops trailing slashes so paths do not get a double slash', () => {
    expect(resolveApiBase('https://api.example.test/')).toBe('https://api.example.test')
    expect(resolveApiBase('https://api.example.test///')).toBe('https://api.example.test')
  })
})
