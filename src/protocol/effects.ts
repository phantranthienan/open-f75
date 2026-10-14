/**
 * The F75's lighting effects, in the order of AULA's profile (LedOpt1..LedOpt20)
 * and with the controls AULA's driver offers for each [KBINI] [DRV].
 * Pure data. docs/reverse-engineering/report.md §9 has the evidence.
 *
 * `value` is what settings byte 0x0a holds while the effect is live: the first
 * number of the effect's LedOptN line. It is also the effect's colour-table row.
 * `slot` is the effect's position in that list, which is where the driver keeps
 * its brightness, speed and colour on the settings page (settings.ts).
 *
 * Effects 9, 14 and 18 are masked by the profile's LedMask=0x22100: the driver
 * writes no colour-table row for them [DRV], so they offer "colourful" but no
 * colour of their own here.
 *
 * Sources:
 *   [KBINI] references/AulaSofwareLinux/assets/devices/f75-fr/device.ini, AULA's F75 profile:
 *           LedOptN = value, preview, speed, light, direction, random, colour; LedMask;
 *           Light=0..9, Speed=0..4. No F75 effect offers a direction.
 *   [DRV]   AULA's F75 driver (OemDrv.exe), the LedOpt parser FUN_00411830 and the
 *           settings builder FUN_0049bbf0. Names: text.xml tc_kb_led1..20, by position.
 */

export interface Effect {
  /** Settings byte 0x0a, and the colour-table row. */
  value: number
  name: string
  /** Index of the effect's [brightness, speed | colour] pair, or null (off has none). */
  slot: number | null
  brightness: boolean
  speed: boolean
  /** Shows one colour: a slot of its colour-table row, picked by the colour nibble. */
  color: boolean
  /** Can cycle colours itself (colour nibble 7). */
  colorful: boolean
}

export const MAX_BRIGHTNESS = 9
export const MAX_SPEED = 4

type Controls = Pick<Effect, 'brightness' | 'speed' | 'color' | 'colorful'>
const ALL: Controls = { brightness: true, speed: true, color: true, colorful: true }
const NO_COLOR: Controls = { brightness: true, speed: true, color: false, colorful: false }
const COLORFUL_ONLY: Controls = { brightness: true, speed: true, color: false, colorful: true }
const NONE: Controls = { brightness: false, speed: false, color: false, colorful: false }

const effect = (value: number, name: string, slot: number | null, controls: Controls): Effect => ({
  value,
  name,
  slot,
  ...controls,
})

export const FIXED_ON = 1
export const PER_KEY = 21
export const OFF = 0

export const EFFECTS: readonly Effect[] = [
  effect(FIXED_ON, 'Fixed on', 0, { ...ALL, speed: false }),
  effect(2, 'Breathing', 1, ALL), // "Respire" in AULA's English text
  effect(3, 'Rainbow', 2, NO_COLOR),
  effect(4, 'Flash away', 3, ALL),
  effect(5, 'Raindrops', 4, ALL),
  effect(6, 'Rainbow wheel', 5, ALL),
  effect(7, 'Ripples shining', 6, ALL),
  effect(8, 'Stars twinkle', 7, ALL),
  effect(9, 'Shadow disappear', 8, COLORFUL_ONLY),
  effect(10, 'Retro snake', 9, ALL),
  effect(11, 'Neon stream', 10, ALL),
  effect(12, 'Reaction', 11, ALL),
  effect(13, 'Sine wave', 12, ALL),
  effect(14, 'Retinue scanning', 13, COLORFUL_ONLY),
  effect(15, 'Rotating windmill', 14, NO_COLOR),
  effect(16, 'Colorful waterfall', 15, NO_COLOR),
  effect(17, 'Blossoming', 16, NO_COLOR),
  effect(18, 'Rotating storm', 17, COLORFUL_ONLY),
  effect(PER_KEY, 'Per-key', 18, NONE),
  effect(OFF, 'Off', null, NONE),
]

export function findEffect(value: number): Effect | undefined {
  return EFFECTS.find((e) => e.value === value)
}

export function effectByValue(value: number): Effect {
  const found = findEffect(value)
  if (!found) throw new RangeError(`no F75 effect has the value ${value}`)
  return found
}
