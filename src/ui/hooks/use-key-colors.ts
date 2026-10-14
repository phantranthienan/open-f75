import { useState } from 'react'
import type { BoardState } from '@/keyboard'
import { formatHexColor, parseHexColor, sameBytes } from '@/protocol/bytes'
import { decodePerKey, type KeyColors } from '@/protocol/per-key'
import { F75_KEYS } from '@/protocol/keys'

/** led index -> #rrggbb; keys not in the map are off. */
export type KeyHexColors = ReadonlyMap<number, string>

const fromBoard = (perKey: Uint8Array): KeyHexColors =>
  new Map([...decodePerKey(perKey)].map(([led, rgb]) => [led, formatHexColor(rgb)]))

/**
 * The per-key colours being painted. They start from the board's stored
 * colours, and a read that finds different colours on the board replaces
 * them; a read that finds the same ones keeps the painting in progress.
 */
export function useKeyColors(board: BoardState | null) {
  const [colors, setColors] = useState<KeyHexColors>(new Map())
  const [loadedFrom, setLoadedFrom] = useState<Uint8Array | null>(null)
  const stored = board?.perKey ?? null
  if (stored && (!loadedFrom || !sameBytes(stored, loadedFrom))) {
    setLoadedFrom(stored)
    setColors(fromBoard(stored))
  }

  const update = (change: (next: Map<number, string>) => void) =>
    setColors((current) => {
      const next = new Map(current)
      change(next)
      return next
    })

  return {
    colors,
    /** Sets one key; null turns it off. */
    paint: (led: number, hex: string | null) => update((next) => (hex ? next.set(led, hex) : next.delete(led))),
    fill: (hex: string) => setColors(new Map(F75_KEYS.map((k) => [k.led, hex]))),
    clear: () => setColors(new Map()),
    /** Back to what the board stores, when it could be read. */
    revert: stored ? () => setColors(fromBoard(stored)) : null,
    replace: setColors,
    /** For the keyboard: the same colours as RGB. */
    toRgb: (): KeyColors => new Map([...colors].map(([led, hex]) => [led, parseHexColor(hex)])),
  }
}

export type KeyColorsDraft = ReturnType<typeof useKeyColors>
