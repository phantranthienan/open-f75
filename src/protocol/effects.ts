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
 * Effects 9, 14 and 18 are masked by the profile's LedMask=0x22100 (bit n masks
 * the effect at list position n). AULA's driver never offers a masked effect on
 * the F75: it leaves it out of its effect list (FUN_004305d0) and writes no
 * colour-table row for it [DRV]. Written anyway, they can leave the keys dark,
 * so `supported` is false for them and the app doesn't write them.
 *
 * Sources:
 *   [KBINI] references/AulaSofwareLinux/assets/devices/f75-fr/device.ini, AULA's F75 profile:
 *           LedOptN = value, preview, speed, light, direction, random, colour; LedMask;
 *           Light=0..9, Speed=0..4. No F75 effect offers a direction.
 *   [DRV]   AULA's F75 driver (OemDrv.exe), the LedOpt parser FUN_00411830, the
 *           settings builder FUN_0049bbf0 and the effect list FUN_004305d0, which
 *           inserts an effect only when its LedMask bit is clear.
 *           Names: text.xml tc_kb_led1..20, by position.
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
  /** False for an effect AULA's driver hides on the F75 (LedMask); the app doesn't write those. */
  supported: boolean
}

export const MAX_BRIGHTNESS = 9
export const MAX_SPEED = 4

/** The F75 profile's LedMask [KBINI]: bit n hides the effect at list position n. */
const LED_MASK = 0x22100

type Controls = Pick<Effect, 'brightness' | 'speed' | 'color' | 'colorful'>
const ALL: Controls = { brightness: true, speed: true, color: true, colorful: true }
const NO_COLOR: Controls = { brightness: true, speed: true, color: false, colorful: false }
const NONE: Controls = { brightness: false, speed: false, color: false, colorful: false }

const effect = (value: number, name: string, slot: number | null, controls: Controls): Omit<Effect, 'supported'> => ({
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
  effect(9, 'Shadow disappear', 8, ALL), // masked
  effect(10, 'Retro snake', 9, ALL),
  effect(11, 'Neon stream', 10, ALL),
  effect(12, 'Reaction', 11, ALL),
  effect(13, 'Sine wave', 12, ALL),
  effect(14, 'Retinue scanning', 13, ALL), // masked
  effect(15, 'Rotating windmill', 14, NO_COLOR),
  effect(16, 'Colorful waterfall', 15, NO_COLOR),
  effect(17, 'Blossoming', 16, NO_COLOR),
  effect(18, 'Rotating storm', 17, ALL), // masked
  effect(PER_KEY, 'Per-key', 18, NONE),
  effect(OFF, 'Off', null, NONE),
].map((e, position) => ({ ...e, supported: ((LED_MASK >> position) & 1) === 0 }))

export function findEffect(value: number): Effect | undefined {
  return EFFECTS.find((e) => e.value === value)
}

export function effectByValue(value: number): Effect {
  const found = findEffect(value)
  if (!found) throw new RangeError(`no F75 effect has the value ${value}`)
  return found
}
