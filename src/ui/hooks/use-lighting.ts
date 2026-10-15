import { useState } from 'react'
import type { BoardState } from '@/keyboard'
import type { LightingControls } from '@/profiles'
import { formatHexColor, parseHexColor } from '@/protocol/bytes'
import { EFFECTS, FIXED_ON, MAX_BRIGHTNESS, PER_KEY, type Effect } from '@/protocol/effects'
import { liveEffect, readEffectState, type LightingChoice } from '@/protocol/lighting'

const DEFAULT_SPEED = 2

/**
 * What Send makes live. The board shows one effect at a time: a whole-board
 * effect, or per-key, where every key shows its own stored colour.
 */
export type LightingMode = 'effect' | 'perKey'

/** The effects Effect mode offers: every effect AULA offers on the F75 but per-key, which is a mode of its own. */
export const LIGHTING_EFFECTS = EFFECTS.filter((e) => e.supported && e.value !== PER_KEY)

/** Effect mode's effect for a 0x0a value: Fixed on for per-key and for any value it doesn't offer. */
function lightingEffect(value: number | undefined): Effect {
  return LIGHTING_EFFECTS.find((e) => e.value === value) ?? LIGHTING_EFFECTS.find((e) => e.value === FIXED_ON)!
}

/**
 * The lighting being edited: the mode, and for Effect mode a whole-board
 * effect with its brightness, speed and colour. The colour is also the one
 * Per-key mode paints with.
 *
 * Every new read of the board loads what it shows: per-key opens Per-key mode
 * and keeps the effect being edited; an effect opens Effect mode with that
 * effect's values and colour. Picking another effect loads its brightness,
 * speed and colourful setting from the board, but keeps the colour picked, so
 * Send changes only what the user changed. Switching mode sends nothing.
 */
export function useLighting(board: BoardState | null) {
  const [mode, setMode] = useState<LightingMode>('effect')
  const [effect, setEffect] = useState<Effect>(() => lightingEffect(FIXED_ON))
  const [brightness, setBrightness] = useState(MAX_BRIGHTNESS)
  const [speed, setSpeed] = useState(DEFAULT_SPEED)
  const [colorful, setColorful] = useState(false)
  const [color, setColor] = useState('#ff0000')

  function load(next: Effect, from: BoardState | null, withColor: boolean) {
    setEffect(next)
    const state = from && readEffectState(from.settings, from.colorTable, next)
    if (!state) return
    setBrightness(state.brightness)
    setSpeed(state.speed)
    setColorful(state.colorful)
    if (withColor && state.color) setColor(formatHexColor(state.color))
  }

  // A new read of the board replaces the draft (React's "adjust state while rendering" pattern).
  const [loaded, setLoaded] = useState(board)
  if (board !== loaded) {
    setLoaded(board)
    const live = board && liveEffect(board.settings)
    if (live && LIGHTING_EFFECTS.includes(live)) {
      setMode('effect')
      load(live, board, true)
    } else if (board) {
      // Per-key, or an effect AULA hides or doesn't list: keep the effect and colour being edited.
      if (live?.value === PER_KEY) setMode('perKey')
      load(effect, board, false)
    }
  }

  // Controls the effect doesn't have are ignored by the plan (colorSetting in protocol/lighting.ts).
  const choice: LightingChoice = { effect, brightness, speed, colorful, color: parseHexColor(color) }

  return {
    mode,
    setMode,
    effect,
    selectEffect: (value: number) => load(lightingEffect(value), board, false),
    /** The controls as plain values, for a profile. In Per-key mode the effect saved is per-key. */
    controls: { effect: mode === 'perKey' ? PER_KEY : effect.value, brightness, speed, colorful, color } satisfies LightingControls,
    /** Fills the controls, from a saved profile. */
    loadControls: (c: LightingControls) => {
      setMode(c.effect === PER_KEY ? 'perKey' : 'effect')
      if (c.effect !== PER_KEY) setEffect(lightingEffect(c.effect))
      setBrightness(c.brightness)
      setSpeed(c.speed)
      setColorful(c.colorful)
      setColor(c.color)
    },
    brightness,
    setBrightness,
    speed,
    setSpeed,
    colorful,
    setColorful,
    color,
    setColor,
    choice,
  }
}

export type Lighting = ReturnType<typeof useLighting>
