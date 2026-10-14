import { useState } from 'react'
import type { BoardState } from '@/keyboard'
import type { LightingControls } from '@/profiles'
import { formatHexColor, parseHexColor } from '@/protocol/bytes'
import { FIXED_ON, MAX_BRIGHTNESS, effectByValue, type Effect } from '@/protocol/effects'
import { liveEffect, readEffectState, type LightingChoice } from '@/protocol/lighting'

const DEFAULT_SPEED = 2

/**
 * The lighting being edited: an effect with its brightness, speed and colour.
 *
 * Every new read of the board loads the effect it shows, with that effect's
 * values and colour. Picking another effect loads that effect's brightness,
 * speed and colourful setting from the board, but keeps the colour picked, so
 * Send changes only what the user changed.
 */
export function useLighting(board: BoardState | null) {
  const [effect, setEffect] = useState<Effect>(() => effectByValue(FIXED_ON))
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
    if (board) load(liveEffect(board.settings) ?? effectByValue(FIXED_ON), board, true)
  }

  // Controls the effect doesn't have are ignored by the plan (colorSetting in protocol/lighting.ts).
  const choice: LightingChoice = { effect, brightness, speed, colorful, color: parseHexColor(color) }

  return {
    effect,
    selectEffect: (value: number) => load(effectByValue(value), board, false),
    /** The controls as plain values, for a profile. */
    controls: { effect: effect.value, brightness, speed, colorful, color } satisfies LightingControls,
    /** Fills the controls, from a saved profile. */
    loadControls: (c: LightingControls) => {
      setEffect(effectByValue(c.effect))
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
