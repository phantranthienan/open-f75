import { useState } from 'react'
import type { BoardState } from '@/keyboard'
import type { LightingControls } from '@/profiles'
import { formatHexColor, parseHexColor } from '@/protocol/bytes'
import { EFFECTS, FIXED_ON, MAX_BRIGHTNESS, PER_KEY, type Effect } from '@/protocol/effects'
import { liveEffect, readEffectState, type LightingChoice } from '@/protocol/lighting'

const DEFAULT_SPEED = 2

/**
 * The effects the lighting pane offers: every effect AULA offers on the F75
 * but per-key. The board shows one effect at a time, and per-key belongs to
 * the keys pane, whose Send writes the key colours and makes it live; the
 * lighting pane's Send makes a whole-board effect live again.
 */
export const LIGHTING_EFFECTS = EFFECTS.filter((e) => e.supported && e.value !== PER_KEY)

/** The lighting pane's effect for a 0x0a value: Fixed on for per-key and for any value it doesn't offer. */
function lightingEffect(value: number | undefined): Effect {
  return LIGHTING_EFFECTS.find((e) => e.value === value) ?? LIGHTING_EFFECTS.find((e) => e.value === FIXED_ON)!
}

/**
 * The lighting being edited: a whole-board effect with its brightness, speed
 * and colour.
 *
 * Every new read of the board loads the effect it shows, with that effect's
 * values and colour. While the board shows per-key, the draft keeps its
 * effect and colour (the colour is also the keys pane's paint colour) and
 * only reloads that effect's values. Picking another effect loads its
 * brightness, speed and colourful setting from the board, but keeps the
 * colour picked, so Send changes only what the user changed.
 */
export function useLighting(board: BoardState | null) {
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
    if (live && LIGHTING_EFFECTS.includes(live)) load(live, board, true)
    else if (board) load(effect, board, false)
  }

  // Controls the effect doesn't have are ignored by the plan (colorSetting in protocol/lighting.ts).
  const choice: LightingChoice = { effect, brightness, speed, colorful, color: parseHexColor(color) }

  return {
    effect,
    selectEffect: (value: number) => load(lightingEffect(value), board, false),
    /** The controls as plain values, for a profile. */
    controls: { effect: effect.value, brightness, speed, colorful, color } satisfies LightingControls,
    /** Fills the controls, from a saved profile. */
    loadControls: (c: LightingControls) => {
      setEffect(lightingEffect(c.effect))
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
