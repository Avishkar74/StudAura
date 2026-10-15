import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { authMock } from './supabaseMock'
import { setViewport } from './viewport'

// Keep this file free of app imports: modules loaded here are cached before a test file's
// vi.mock('@/app/supabase') can replace them.
configure({ asyncUtilTimeout: 4000 })

beforeEach(() => {
  window.localStorage.clear()
  setViewport('desktop')
})

afterEach(() => {
  cleanup()
  authMock.reset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
