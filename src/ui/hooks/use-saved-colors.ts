import { useCallback } from 'react'
import { isHexColor } from '@/protocol/bytes'
import { useStoredList } from '@/ui/hooks/use-stored-list'

const LIMIT = 16
const parseColor = (value: unknown) => (isHexColor(value) ? value.toLowerCase() : null)

/** The user's own colours, newest first, kept in this browser's localStorage. */
export function useSavedColors() {
  const [colors, update] = useStoredList('open-f75:saved-colors', parseColor, LIMIT)
  const save = useCallback((hex: string) => update((c) => [hex, ...c.filter((x) => x !== hex)]), [update])
  const remove = useCallback((hex: string) => update((c) => c.filter((x) => x !== hex)), [update])
  return { colors, save, remove, limit: LIMIT }
}
