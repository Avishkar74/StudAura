import { useCallback, useState } from 'react'

const storageFor = (kind: 'local' | 'session') =>
  kind === 'session' ? window.sessionStorage : window.localStorage

/**
 * useState backed by localStorage (or sessionStorage). Storage can throw (private mode,
 * blocked), so never rely on it.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  kind: 'local' | 'session' = 'local',
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = storageFor(kind).getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        try {
          storageFor(kind).setItem(key, JSON.stringify(resolved))
        } catch {
          /* keep the in-memory value */
        }
        return resolved
      })
    },
    [key, kind],
  )

  return [value, update] as const
}
