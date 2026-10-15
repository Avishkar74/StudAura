import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import { authMock } from './supabaseMock'
import { setViewport } from './viewport'

// Keep this file free of app imports: modules loaded here are cached before a test file's
// vi.mock('@/app/supabase') can replace them.
configure({ asyncUtilTimeout: 4000 })

// jsdom has no layout engine. ProseMirror (the note editor) measures ranges when it scrolls the
// cursor into view, so give it empty measurements instead of letting it throw.
const emptyRects = Object.assign([] as unknown as DOMRectList, { item: () => null })
Range.prototype.getClientRects = () => emptyRects
Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
Element.prototype.getClientRects = () => emptyRects
document.elementFromPoint = () => null

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
