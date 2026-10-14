import { useCallback } from 'react'
import { mergeProfiles, parseProfile, type Profile } from '@/profiles'
import { useStoredList } from '@/ui/hooks/use-stored-list'

/** Named lighting profiles, newest first, kept in this browser's localStorage. */
export function useProfiles() {
  const [profiles, update] = useStoredList('open-f75:profiles', parseProfile)
  /** Adds profiles, replacing any with the same name. */
  const add = useCallback((incoming: Profile[]) => update((c) => mergeProfiles(c, incoming)), [update])
  const remove = useCallback((name: string) => update((c) => c.filter((p) => p.name !== name)), [update])
  return { profiles, add, remove }
}
