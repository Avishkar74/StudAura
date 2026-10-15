import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, configureApiAuth } from './client'

function response(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, statusText: 'x', json: async () => body }
}

function authHeader(call: unknown[]): string | null {
  const init = call[1] as RequestInit
  return new Headers(init.headers).get('Authorization')
}

afterEach(() => {
  configureApiAuth(null)
  vi.unstubAllGlobals()
})

describe('apiFetch', () => {
  it('sends the access token as a bearer header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    configureApiAuth({
      getToken: async () => 'tok-1',
      refreshToken: async () => null,
      onUnauthorized: vi.fn(),
    })

    await apiFetch('/api/v1/me')
    expect(authHeader(fetchMock.mock.calls[0])).toBe('Bearer tok-1')
  })

  it('sends no Authorization header when signed out', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(200))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/health')
    expect(authHeader(fetchMock.mock.calls[0])).toBeNull()
  })

  it('refreshes the token and retries once after a 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, { id: 'u' }))
    vi.stubGlobal('fetch', fetchMock)
    const onUnauthorized = vi.fn()
    configureApiAuth({
      getToken: async () => 'old',
      refreshToken: async () => 'fresh',
      onUnauthorized,
    })

    await expect(apiFetch('/api/v1/me')).resolves.toEqual({ id: 'u' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(authHeader(fetchMock.mock.calls[1])).toBe('Bearer fresh')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('signs out and throws when the retry is also rejected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(401, { error: { code: 'UNAUTHORIZED', message: 'Nope' } }))
    vi.stubGlobal('fetch', fetchMock)
    const onUnauthorized = vi.fn()
    configureApiAuth({
      getToken: async () => 'old',
      refreshToken: async () => 'fresh',
      onUnauthorized,
    })

    await expect(apiFetch('/api/v1/me')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2) // retried exactly once
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('signs out without retrying when no fresh token is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(401))
    vi.stubGlobal('fetch', fetchMock)
    const onUnauthorized = vi.fn()
    configureApiAuth({ getToken: async () => 'old', refreshToken: async () => null, onUnauthorized })

    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('maps the backend error envelope onto ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(response(422, { error: { code: 'VALIDATION_ERROR', message: 'Bad' } })),
    )
    await expect(apiFetch('/x')).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Bad',
    })
  })
})
