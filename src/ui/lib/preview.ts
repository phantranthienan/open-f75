import { formatHexColor, type Rgb } from '@/protocol/bytes'
import { MAX_BRIGHTNESS, OFF } from '@/protocol/effects'
import { F75_KEYS, type Key } from '@/protocol/keys'
import { colorSetting, type LightingChoice } from '@/protocol/lighting'
import type { KeyHexColors } from '@/ui/hooks/use-key-colors'
import { hsvToRgb } from '@/ui/lib/color'

// The key map's width in its own units (KEYS_VIEW_BOX), for the rainbow.
const LEFT = 17
const WIDTH = 646

/** A rainbow from left to right, standing in for effects that pick their own colours. */
const rainbow = (k: Key): Rgb => hsvToRgb({ h: ((k.x + k.w / 2 - LEFT) / WIDTH) * 300, s: 1, v: 1 })

const dim = ([r, g, b]: Rgb, level: number): Rgb => [Math.round(r * level), Math.round(g * level), Math.round(b * level)]

/**
 * How bright the map shows a choice: 0 for off or brightness 0, else 0.3..1,
 * so the lowest level stays visible on screen.
 */
export function brightnessLevel(choice: LightingChoice): number {
  const { effect } = choice
  const brightness = effect.brightness ? (choice.brightness ?? MAX_BRIGHTNESS) : MAX_BRIGHTNESS
  if (effect.value === OFF || brightness === 0) return 0
  return 0.3 + (0.7 * brightness) / MAX_BRIGHTNESS
}

/** An animation frame (lib/animations) as key colours for the map, dimmed to `level`. Black keys show as off. */
export function frameColors(frame: ReadonlyMap<number, Rgb>, level: number): KeyHexColors {
  const lit = [...frame].map(([led, rgb]) => [led, dim(rgb, level)] as const).filter(([, rgb]) => rgb.some((c) => c > 0))
  return new Map(lit.map(([led, rgb]) => [led, formatHexColor(rgb)]))
}

/**
 * Roughly what the board shows for a whole-board choice, as a still picture:
 * the effect's colour, or a rainbow for an effect that picks its own, dimmed
 * by the brightness. Used when the animation doesn't play (reduced motion).
 */
export function previewColors(choice: LightingChoice): KeyHexColors {
  const level = brightnessLevel(choice)
  if (level === 0) return new Map()
  const setting = colorSetting(choice)
  // One colour when the effect shows one; otherwise (colourful, or no colour of its own) a rainbow.
  const colorOf = (k: Key): Rgb => (typeof setting === 'string' || setting === null ? rainbow(k) : setting)
  return new Map(F75_KEYS.map((k) => [k.led, formatHexColor(dim(colorOf(k), level))]))
}
