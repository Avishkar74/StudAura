import { describe, expect, it } from 'vitest'
import config from '../../vercel.json'

describe('vercel.json', () => {
  it('proxies /api to the backend before the single-page-app fallback', () => {
    const [api, spa] = config.rewrites
    expect(api.source).toBe('/api/:path*')
    expect(api.destination).toMatch(/^https?:\/\/[^/]+\/api\/:path\*$/)
    expect(spa.destination).toBe('/index.html')
  })

  it('does not send API paths to index.html', () => {
    const spa = config.rewrites[1]
    const pattern = new RegExp(`^${spa.source}$`)
    expect(pattern.test('/api/v1/me')).toBe(false)
    expect(pattern.test('/learn/saved/abc')).toBe(true)
    expect(pattern.test('/')).toBe(true)
  })
})
