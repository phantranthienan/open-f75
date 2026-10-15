/**
 * Breathing (F75 LedOpt2, preview 3, descriptor type 3): all keys fade down
 * together, then back up, one breath every 3 s. Colourful, the keys hold the
 * breath_unit.txt gradient (blue at the left edge, green around O, orange on the
 * right column) and breathe together.
 *
 * Driver (decomp.c line numbers, OemDrv.exe addresses; spec in docs/reverse-engineering/previews/breathing.md):
 * - dispatcher FUN_00431ca0 case 3 (31875): a 7-colour list, period 50,
 *   FUN_004850e0, then FUN_00432640("breath_unit.txt", per-key colours, 1)
 *   when colourful.
 * - generator FUN_004850e0 (87872): descriptor of 0x28c bytes.
 * - starter FUN_0041ba70 (18001): every key's alpha starts at the ceiling.
 * - engine FUN_0041bbb0 type 3 (18191): alpha -6 / +6 per tick between 5 and 180.
 */
import type { AnimationOptions, CreateAnimation, Rgb } from '@/ui/lib/animations/types'
import { applyUnits, intervalForSpeed, randomKeyColors, withAlpha, type KeyUnit } from '@/ui/lib/animations/driver'

/** The dispatcher pushes 0x32 as FUN_004850e0's period argument (0x431fcd). */
const PERIOD_MS = 50
/** Alpha change per tick (0x41bd8a, 0x41bd99). */
const ALPHA_STEP = 6
/** Descriptor [0x9f] (0x485126). */
const ALPHA_MIN = 5
/** Descriptor [0xa0]: 0xb4 (0x485130); 0xff only when the profile sets KbDrawType=1, and the F75's is 0. */
const ALPHA_MAX = 180

/**
 * Cartoon\breath_unit.txt from the F75 package, as F75 LED indices. Names the
 * US board lacks (k45, app, home) are left out. `ralt` and `fn` resolve through
 * the FR profile's VKs to LED 53 and LED 59 (Fn and RCtrl on the US board);
 * `rctrl` has no key in that profile, so the driver skips it. `|` is the US
 * backslash (LED 80).
 */
const BREATH_UNITS: readonly KeyUnit[] = [
  { leds: [0, 1, 2, 3, 4, 5, 11], color: [0, 0, 255] }, // Esc ` Tab CapsLock LShift LCtrl LWin
  { leds: [7, 8, 9, 10, 17] }, // 1 Q A Z LAlt
  { leds: [12, 13, 14, 15, 16] }, // F1 2 W S X
  { leds: [18, 19, 20, 21, 22] }, // F2 3 E D C
  { leds: [24, 25, 26, 27, 28] }, // F3 4 R F V
  { leds: [30, 31, 32, 33, 34, 35] }, // F4 5 T G B Space
  { leds: [37, 38, 39, 40] }, // 6 Y H N
  { leds: [36, 43, 44, 45, 46] }, // F5 7 U J M
  { leds: [42, 49, 50, 51, 52] }, // F6 8 I K ,
  { leds: [48, 55, 56, 57, 58, 53], color: [0, 255, 0] }, // F7 9 O L . Fn(ralt)
  { leds: [54, 61, 62, 63, 64, 59] }, // F8 0 P ; / RCtrl(fn)
  { leds: [60, 67, 68, 69, 66, 73, 74] }, // F9 - [ ' F10 = ] (rctrl skipped)
  { leds: [72, 78, 79, 80, 81, 70, 77, 82, 83] }, // F11 F12 Backspace \ Enter RShift Left Up Down
  { leds: [85, 86, 87, 88, 89], color: [255, 128, 0] }, // Delete PgUp PgDn End Right
]

/**
 * The colours the keys breathe with. Single colour: desc[0x9a] on every key.
 * Colourful: random per-key colours (desc[10..]) under the unit gradient; the
 * driver uses them because the F75 profile leaves RespireType at 0 (desc[0x9c]).
 * RespireType=1 would instead light the whole board with one colour of the
 * dispatcher's 7-colour list, moving to the next at each dark point; the F75
 * never takes that path, so it is not ported.
 */
const baseColors = ({ keys, color, random }: AnimationOptions): Map<number, Rgb> => {
  if (color) return new Map(keys.map((key) => [key.led, color]))
  const colors = randomKeyColors(keys, random)
  applyUnits(colors, BREATH_UNITS, keys)
  return colors
}

/** The driver draws each key with the breathing value as its fill alpha (withAlpha). */
const scale = (colors: ReadonlyMap<number, Rgb>, alpha: number): Map<number, Rgb> =>
  new Map([...colors].map(([led, rgb]) => [led, withAlpha(rgb, alpha)]))

export const createBreathing: CreateAnimation = (options) => {
  const base = baseColors(options)
  let alpha = ALPHA_MAX // the starter sets every key's alpha to desc[0xa0] (18022-18027)
  let rising = false // desc[0x9e] = 0: the first move is down
  let frame: Map<number, Rgb> = new Map()

  // One engine tick (0x41bd6f..0x41be39): move, clamp, then turn at either end.
  const step = (): void => {
    alpha = rising ? Math.min(alpha + ALPHA_STEP, ALPHA_MAX) : Math.max(alpha - ALPHA_STEP, ALPHA_MIN)
    if (alpha <= ALPHA_MIN) rising = true
    else if (alpha >= ALPHA_MAX) rising = false
    frame = scale(base, alpha)
  }

  step() // the starter (FUN_0041ba70) draws the first frame at once
  return {
    interval: intervalForSpeed(PERIOD_MS, options.speed),
    step,
    colors: () => frame,
  }
}
