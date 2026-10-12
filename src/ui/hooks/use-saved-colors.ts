import { useCallback, useState } from 'react'

const KEY = 'open-f75:saved-colors'
const LIMIT = 16

function load(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((c): c is string => /^#[0-9a-f]{6}$/.test(c)).slice(0, LIMIT) : []
  } catch {
    return [] // private mode, blocked storage or a damaged entry
  }
}

function store(colors: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(colors))
  } catch {
    // storage unavailable: the list still works for this visit
  }
}

/** The user's own colours, newest first, kept in this browser's localStorage. */
export function useSavedColors() {
  const [colors, setColors] = useState(load)

  const update = useCallback((next: (current: string[]) => string[]) => {
    setColors((current) => {
      const result = next(current).slice(0, LIMIT)
      store(result)
      return result
    })
  }, [])

  const save = useCallback((hex: string) => update((c) => [hex, ...c.filter((x) => x !== hex)]), [update])
  const remove = useCallback((hex: string) => update((c) => c.filter((x) => x !== hex)), [update])

  return { colors, save, remove, limit: LIMIT }
}
