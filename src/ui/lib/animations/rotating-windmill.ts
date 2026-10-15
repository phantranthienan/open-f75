/**
 * Rotating windmill (F75 LedOpt15, preview 28): four colour blades (green, blue,
 * magenta, yellow) sweep clockwise around the middle of the board, one turn per
 * 16 ticks.
 *
 * Driver: dispatcher FUN_00431ca0 case 0x1c (decomp.c 31992) loads
 * Cartoon\rotate_unit.txt (string at 0x61227c; not windmill_unit.txt, which
 * belongs to preview 29), which the F75 package does not ship, so the generator
 * FUN_00487140 (89263) falls back to the 13 built-in sector units of
 * FUN_00487250 (89324). The engine is the shared palette cycle
 * (palette-cycle.ts). Spec: docs/reverse-engineering/previews/rotating-windmill.md.
 */
import type { CreateAnimation } from '@/ui/lib/animations/types'
import { colorRefToRgb } from '@/ui/lib/animations/driver'
import { paletteCycleAnimation, unitsOnBoard } from '@/ui/lib/animations/palette-cycle'

/** The dispatcher pushes 0x3c as the period (0x4324e1). */
const PERIOD_MS = 60
/** FUN_00487140 passes the period as the hold and 3 * period as the fade (0x487217, 0x487214). */
const HOLD_MS = PERIOD_MS
const FADE_MS = 3 * PERIOD_MS
/** Green, blue, magenta, yellow (COLORREFs at 0x487220..0x487238). */
const PALETTE = [0x00ff00, 0xff0000, 0xff00ff, 0x00ffff].map(colorRefToRgb)
/** Float 4.0 at 0x626e88: the sectors span all four colours, so each colour is one blade. */
const SPREAD = 4
/** The F75 offers no direction (LedOpt15's fifth number is 0), so the dispatcher passes 0. */
const DIRECTION = 0

/**
 * FUN_00487250's default sectors, in sweep order, as F75 LED indices. They were
 * written for a full-size board: keys the F75 lacks (numpad, Insert, Home, Print
 * Screen, Scroll Lock, Pause, Num Lock, Apps, RWin, VK 0xc1/0xfd, and VK RCtrl,
 * which no F75 key carries) are left out, and so is the ISO key (LED 76), which
 * the US board lacks. The profile gives LED 53 VK RAlt and LED 59 VK 0xfa, so
 * those keys (Fn and RCtrl on the US board) land in the first sector.
 */
const WINDMILL_UNITS: readonly (readonly number[])[] = [
  [57, 58, 52, 53, 64, 59], // L . , Fn / RCtrl
  [51, 46, 40, 35], // K M N Space
  [33, 39, 45, 22, 28, 34, 17], // G H J C V B LAlt
  [9, 15, 21, 27, 10, 16, 5, 4, 11, 3], // A S D F Z X LCtrl LShift LWin CapsLock
  [0, 1, 7, 13, 2, 8, 14, 20, 26, 32], // Esc ` 1 2 Tab Q W E R T
  [12, 18, 24, 30, 19, 25, 31, 37, 43, 38, 44, 50], // F1 F2 F3 F4 3 4 5 6 7 Y U I
  [36, 42, 48, 54, 49, 55, 56], // F5 F6 F7 F8 8 9 O
  [60, 66, 61, 62, 67], // F9 F10 0 P -
  [72, 78, 73, 79, 68, 74], // F11 F12 = Backspace [ ]
  [86, 85, 88, 87, 80], // PgUp Delete End PgDn \
  [81, 69, 63], // Enter ' ;
  [82], // Up
  [70, 83, 77, 89], // RShift Down Left Right
]

// options.color and the colourful flag are not used: the dispatcher never passes
// them to this generator, which always uses its own palette.
export const createRotatingWindmill: CreateAnimation = ({ keys, speed }) =>
  paletteCycleAnimation(
    { periodMs: PERIOD_MS, holdMs: HOLD_MS, fadeMs: FADE_MS, palette: PALETTE, spread: SPREAD, direction: DIRECTION, units: unitsOnBoard(WINDMILL_UNITS, keys) },
    speed,
  )
