/**
 * Fixed on (F75 LedOpt1, preview 1, descriptor type 1): every key shows one
 * colour and nothing moves. Colourful, the keys show fixon_unit.txt: a gradient
 * from red at O through green to blue at the left and right edges.
 *
 * Driver (decomp.c line numbers, OemDrv.exe addresses; spec in docs/reverse-engineering/previews/fixed-on.md):
 * - dispatcher FUN_00431ca0 case 1 (31869): FUN_00485000(colour, colourful),
 *   then, when colourful, FUN_00432640("fixon_unit.txt", per-key colours, 1).
 * - generator FUN_00485000 (87818): descriptor {0x24c, 1, 300 ms, 144 colours}.
 * - engine FUN_0041bbb0 type 1 (18121): copies the 144 colours to the keys.
 */
import type { CreateAnimation, Rgb } from '@/ui/lib/animations/types'
import { applyUnits, intervalForSpeed, randomKeyColors, type KeyUnit } from '@/ui/lib/animations/driver'

/** Descriptor [2]: FUN_00485000 stores 0x12c (0x48502f). Each tick repaints the same colours. */
const PERIOD_MS = 300

/**
 * Cartoon\fixon_unit.txt from the F75 package, as F75 LED indices. Names the US
 * board lacks (k45, app) are left out. `ralt` and `fn` resolve through the FR
 * profile's VKs to LED 53 and LED 59 (Fn and RCtrl on the US board); `rctrl`
 * has no key in that profile, so the driver skips it. `|` is the US backslash
 * (LED 80): the profile's VK 0xdc key is the ISO key at LED 75, absent here.
 */
const FIXON_UNITS: readonly KeyUnit[] = [
  { leds: [56], color: [255, 0, 0] }, // O
  { leds: [55, 61, 50, 51, 57, 62] }, // 9 0 I K L P
  { leds: [54, 49, 44, 45, 46, 52, 58, 63, 68, 67] }, // F8 8 U J M , . ; [ -
  { leds: [48, 43, 38, 39, 40, 64, 69, 74, 73, 60] }, // F7 7 Y H N / ' ] = F9
  { leds: [42, 37, 32, 33, 34, 53, 66] }, // F6 6 T G B Fn(ralt) F10
  { leds: [36, 31, 26, 27, 28, 35, 59, 70, 81, 80, 79, 72], color: [0, 255, 0] }, // F5 5 R F V Space RCtrl(fn) RShift Enter \ Backspace F11
  { leds: [30, 25, 20, 21, 22] }, // F4 4 E D C (rctrl skipped)
  { leds: [24, 19, 14, 15, 16, 77, 82, 86, 87, 85, 78] }, // F3 3 W S X Left Up PgUp PgDn Delete F12
  { leds: [18, 13, 8, 9, 10, 17, 83, 88] }, // F2 2 Q A Z LAlt Down End
  { leds: [12, 7, 0, 1, 5, 2, 3, 4, 11, 89], color: [0, 0, 255] }, // F1 1 Esc ` LCtrl Tab CapsLock LShift LWin Right
]

export const createFixedOn: CreateAnimation = ({ keys, color, speed, random }) => {
  let colors: Map<number, Rgb>
  if (color) {
    // FUN_00484f90 scales the colour by 10/10 first (0x4850b9): a no-op.
    colors = new Map(keys.map((key) => [key.led, color]))
  } else {
    colors = randomKeyColors(keys, random)
    applyUnits(colors, FIXON_UNITS, keys)
  }
  return {
    interval: intervalForSpeed(PERIOD_MS, speed),
    step: () => {}, // the engine copies the same descriptor colours every tick
    colors: () => colors,
  }
}
