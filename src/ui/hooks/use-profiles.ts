import { useCallback, useState } from 'react'
import { mergeProfiles, parseProfile, type Profile } from '@/profiles'

const KEY = 'open-f75:profiles'

function load(): Profile[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.map(parseProfile).filter((p): p is Profile => p !== null) : []
  } catch {
    return [] // private mode, blocked storage or a damaged entry
  }
}

function store(profiles: Profile[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profiles))
  } catch {
    // storage unavailable: the list still works for this visit
  }
}

/** Named lighting profiles, newest first, kept in this browser's localStorage. */
export function useProfiles() {
  const [profiles, setProfiles] = useState(load)

  const update = useCallback((next: (current: Profile[]) => Profile[]) => {
    setProfiles((current) => {
      const result = next(current)
      store(result)
      return result
    })
  }, [])

  const save = useCallback((profile: Profile) => update((c) => mergeProfiles(c, [profile])), [update])
  const remove = useCallback((name: string) => update((c) => c.filter((p) => p.name !== name)), [update])
  const add = useCallback((incoming: Profile[]) => update((c) => mergeProfiles(c, incoming)), [update])

  return { profiles, save, remove, add }
}
