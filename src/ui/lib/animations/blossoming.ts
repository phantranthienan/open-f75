/**
 * Blossoming (F75 LedOpt17, preview 14): colour rings open outward from the O
 * key, cycling red, yellow, green, blue, cyan, magenta.
 *
 * Driver: dispatcher FUN_00431ca0 case 0xe (decomp.c 32000) loads
 * Cartoon\flower_unit.txt, which the F75 package does not ship, so the generator
 * FUN_00486620 (88913) falls back to the 11 built-in units of FUN_00486740 (88970).
 * The engine is the shared palette cycle (palette-cycle.ts). Spec: docs/reverse-engineering/previews/blossoming.md.
 */
import type { CreateAnimation } from '@/ui/lib/animations/types'
import { colorRefToRgb } from '@/ui/lib/animations/driver'
import { paletteCycleAnimation, unitsOnBoard } from '@/ui/lib/animations/palette-cycle'

/** The dispatcher pushes 0x3c as the period (0x432566). */
const PERIOD_MS = 60
/** FUN_00486620 passes 2 * period as the hold and 5 * period as the fade (0x4866de, 0x4866e8). */
const HOLD_MS = 2 * PERIOD_MS
const FADE_MS = 5 * PERIOD_MS
/** Red, yellow, green, blue, cyan, magenta (COLORREFs at 0x4866f3..0x48671b). */
const PALETTE = [0x0000ff, 0x00ffff, 0x00ff00, 0xff0000, 0xffff00, 0xff00ff].map(colorRefToRgb)
/** Float 1.8 at 0x626e8c: the rings span 1.8 colours from the centre to the edge. */
const SPREAD = 1.8
/** The F75 offers no direction (LedOpt17's fifth number is 0), so the dispatcher passes 0. */
const DIRECTION = 0

/**
 * FUN_00486740's default units, innermost first, as F75 LED indices. They were
 * written for a full-size board: keys the F75 lacks (numpad, Insert, Home, Print
 * Screen, Scroll Lock, Pause, Apps, RWin, VK 0xc1/0xfd) are left out, and so is
 * the ISO key (LED 76), which the US board lacks. The profile gives LED 53 VK
 * RAlt and LED 59 VK 0xfa, so those (Fn and RCtrl on the US board) sit where
 * the driver puts RAlt and its Fn.
 */
const FLOWER_UNITS: readonly (readonly number[])[] = [
  [56], // O
  [55, 61, 50, 51, 57, 62], // 9 0 I K L P
  [54, 49, 44, 45, 46, 52, 58, 63, 68, 67], // F8 8 U J M , . ; [ -
  [48, 60, 43, 38, 39, 40, 35, 53, 64, 69, 74, 73], // F7 F9 7 Y H N Space Fn / ' ] =
  [42, 66, 37, 32, 33, 34, 70, 81, 80, 79, 59], // F6 F10 6 T G B RShift Enter \ Backspace RCtrl
  [36, 72, 78, 31, 26, 27, 28, 77, 85], // F5 F11 F12 5 R F V Left Delete
  [30, 25, 20, 21, 22, 82, 83, 88], // F4 4 E D C Up Down End
  [24, 19, 14, 15, 16, 89, 86, 87], // F3 3 W S X Right PgUp PgDn
  [18, 13, 8, 9, 10, 17], // F2 2 Q A Z LAlt
  [12, 7, 3, 4, 11], // F1 1 CapsLock LShift LWin
  [0, 1, 2, 5], // Esc ` Tab LCtrl
]

// options.color and the colourful flag are not used: the dispatcher never passes
// them to this generator, which always uses its own palette.
export const createBlossoming: CreateAnimation = ({ keys, speed }) =>
  paletteCycleAnimation(
    { periodMs: PERIOD_MS, holdMs: HOLD_MS, fadeMs: FADE_MS, palette: PALETTE, spread: SPREAD, direction: DIRECTION, units: unitsOnBoard(FLOWER_UNITS, keys) },
    speed,
  )
