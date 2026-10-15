import { vi } from 'vitest'

/** Emulates the desktop (>= 1024px) or mobile breakpoint for `useMediaQuery`. */
export function setViewport(kind: 'desktop' | 'mobile') {
  const desktop = kind === 'desktop'
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width') ? desktop : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}
