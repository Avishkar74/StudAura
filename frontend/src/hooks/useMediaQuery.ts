import { useEffect, useState } from 'react'

/** Tracks a CSS media query. Falls back to `fallback` where matchMedia is unavailable (tests). */
export function useMediaQuery(query: string, fallback = true): boolean {
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : fallback

  const [matches, setMatches] = useState(get)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
