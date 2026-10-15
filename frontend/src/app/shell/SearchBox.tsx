import { Search } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

/** Global search. For now it opens the learning paths list filtered by title. */
export function SearchBox() {
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  // Ctrl/Cmd+K focuses the search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const q = value.trim()
    navigate(q ? `/learning-paths?q=${encodeURIComponent(q)}` : '/learning-paths')
  }

  return (
    <form role="search" onSubmit={onSubmit} className="relative w-full min-w-0 max-w-xl">
      <label htmlFor="global-search" className="sr-only">
        Search learning paths, videos, or notes
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-text-muted"
        aria-hidden
      />
      <input
        ref={input}
        id="global-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search paths, videos, notes…"
        className="w-full min-w-0 rounded-full border border-border bg-surface-1 py-2.5 pr-4 pl-11 text-sm md:pr-16 text-text-primary placeholder:text-text-muted"
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-xs text-text-muted md:block"
      >
        Ctrl K
      </kbd>
    </form>
  )
}
