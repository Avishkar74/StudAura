import { useEffect } from 'react'

/** Sets the browser tab title so screen-reader and history users can tell pages apart. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = title ? `${title} · StudAura` : 'StudAura'
    return () => {
      document.title = previous
    }
  }, [title])
}
