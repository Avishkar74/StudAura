import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => vi.unstubAllGlobals())

describe('App', () => {
  it('shows the brand and an online status when /health succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok' }) }),
    )
    render(<App />)
    expect(screen.getByRole('heading', { name: 'StudAura' })).toBeInTheDocument()
    expect(await screen.findByText('API online')).toBeInTheDocument()
  })

  it('shows an offline status when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    render(<App />)
    expect(await screen.findByText('API offline')).toBeInTheDocument()
  })
})
