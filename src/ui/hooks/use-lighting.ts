import { useState } from 'react'
import type { BoardState } from '@/keyboard'
import type { Profile } from '@/profiles'
import { formatHexColor, parseHexColor } from '@/protocol/bytes'
import { FIXED_ON, MAX_BRIGHTNESS, effectByValue, findEffect, type Effect } from '@/protocol/effects'
import { readEffectState, type LightingChoice } from '@/protocol/lighting'
import { SettingsOffset } from '@/protocol/settings'

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
    if (board) load(findEffect(board.settings[SettingsOffset.effect]) ?? effectByValue(FIXED_ON), board, true)
  }

  // Only an effect with the control can be colourful; the board may hold nibble 7 for others too.
  const isColorful = effect.colorful && colorful
  const choice: LightingChoice = {
    effect,
    brightness,
    speed,
    color: isColorful ? 'colorful' : effect.color ? parseHexColor(color) : 'own',
  }

  return {
    effect,
    selectEffect: (value: number) => load(effectByValue(value), board, false),
    /** Fills the controls from a saved profile. */
    loadProfile: (p: Pick<Profile, 'effect' | 'brightness' | 'speed' | 'colorful' | 'color'>) => {
      setEffect(effectByValue(p.effect))
      setBrightness(p.brightness)
      setSpeed(p.speed)
      setColorful(p.colorful)
      setColor(p.color)
    },
    brightness,
    setBrightness,
    speed,
    setSpeed,
    colorful: isColorful,
    setColorful,
    color,
    setColor,
    choice,
  }
}

export type Lighting = ReturnType<typeof useLighting>
