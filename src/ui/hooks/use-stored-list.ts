import { useCallback, useState } from 'react'

function load<T>(key: string, parse: (value: unknown) => T | null, limit: number): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(parsed) ? parsed.map(parse).filter((item): item is T => item !== null).slice(0, limit) : []
  } catch {
    return [] // private mode, blocked storage or a damaged entry
  }
}

function store(key: string, items: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // storage unavailable: the list still works for this visit
  }
}

/**
 * A list kept in this browser's localStorage. Every stored item goes through
 * `parse`, so a damaged or hand-edited entry is dropped, never used. Changes
 * are saved as they happen and kept to `limit` items.
 */
export function useStoredList<T>(key: string, parse: (value: unknown) => T | null, limit = Infinity) {
  const [items, setItems] = useState(() => load(key, parse, limit))
  const update = useCallback(
    (next: (current: T[]) => T[]) => {
      setItems((current) => {
        const result = next(current).slice(0, limit)
        store(key, result)
        return result
      })
    },
    [key, limit],
  )
  return [items, update] as const
}
