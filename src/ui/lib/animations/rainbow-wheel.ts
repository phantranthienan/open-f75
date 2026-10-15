/**
 * Rainbow wheel (preview 13, descriptor type 0xd): wheel_unit.txt cuts the
 * board into 19 wedges around it. Each wedge fades continuously through the
 * palette (no hold), and the wedges are spread over one whole loop, so the
 * full rainbow always shows and turns once per loop (1.8 s at the driver's pace).
 *
 * Driver (decomp.c line numbers; spec in docs/reverse-engineering/previews/rainbow-wheel.md):
 * the dispatcher passes period 0x3c and the colour to FUN_0048a5f0, which hands
 * no hold, a 6-period fade, spread = palette size and direction XYDirect (1 by
 * default) to FUN_00484e00. Cartoon\wheel_unit.txt ships with the F75 package.
 */
import { tenths } from '@/ui/lib/animations/driver'
import { paletteCycleAnimation, unitsOnBoard } from '@/ui/lib/animations/palette-cycle'
import type { CreateAnimation, Rgb } from '@/ui/lib/animations/types'

const PERIOD_MS = 60

/** Colourful: green, blue, magenta, red, yellow (COLORREFs 0xff00, 0xff0000, 0xff00ff, 0xff, 0xffff). */
const COLORFUL: readonly Rgb[] = [
  [0, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [255, 0, 0],
  [255, 255, 0],
]

/**
 * wheel_unit.txt, one array per line, mapped to LED indices. The driver turns
 * each name into a virtual-key code (FUN_0048afa0) and looks that code up in the
 * F75 profile's [KEY] table, so:
 * - `fn` is VK 0xFA, which the profile puts on LED 59 (our RCtrl);
 * - `ralt` is VK 0xA5, on LED 53 (our Fn);
 * - `rctrl` (VK 0xA3), `home` and `k45` (ISO <>) match no key on the F75;
 * - `|` is VK 0xDC, which the profile puts on the ISO key (LED 75); on the US
 *   board that is the backslash key, LED 80.
 */
const UNITS: readonly (readonly number[])[] = [
  /* tab ~ esc 1 */ [2, 1, 0, 7],
  /* f1 f2 2 3 q w */ [12, 18, 13, 19, 8, 14],
  /* f3 f4 4 5 e r */ [24, 30, 25, 31, 20, 26],
  /* f5 f6 6 7 t y u */ [36, 42, 37, 43, 32, 38, 44],
  /* f7 f8 8 9 0 i o p */ [48, 54, 49, 55, 61, 50, 56, 62],
  /* f9 f10 - = [ */ [60, 66, 67, 73, 68],
  /* f11 f12 back ] | */ [72, 78, 79, 74, 80],
  /* del (home) pgup */ [85, 86],
  /* pgdn end right */ [87, 88, 89],
  /* enter up down */ [81, 82, 83],
  /* ' rshift left */ [69, 70, 77],
  /* ? ; (rctrl) */ [64, 63],
  /* l > fn */ [57, 58, 59],
  /* k < ralt */ [51, 52, 53],
  /* j m h n space */ [45, 46, 39, 40, 35],
  /* f g v b */ [27, 33, 28, 34],
  /* s d x c */ [15, 21, 16, 22],
  /* a z alt */ [9, 10, 17],
  /* caps shift (k45) ctrl win */ [3, 4, 5, 11],
]

/** One colour alternates with itself at 1/10 (FUN_00484f90 with 1), three times round. */
function palette(color: Rgb | null): readonly Rgb[] {
  if (!color) return COLORFUL
  const low = tenths(color, 1)
  return [color, low, color, low, color, low]
}

export const createRainbowWheel: CreateAnimation = ({ keys, color, speed }) => {
  const colors = palette(color)
  return paletteCycleAnimation(
    { periodMs: PERIOD_MS, holdMs: 0, fadeMs: 6 * PERIOD_MS, palette: colors, spread: colors.length, direction: 1, units: unitsOnBoard(UNITS, keys) },
    speed,
  )
}
