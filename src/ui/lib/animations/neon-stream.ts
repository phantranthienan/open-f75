/**
 * Neon stream (preview 7, descriptor type 7): the board is cut into 20 columns
 * that all run the same palette, each 45 ms ahead of the column to its right,
 * so the colours stream across the keyboard from left to right.
 *
 * Driver (decomp.c line numbers; spec in docs/reverse-engineering/previews/neon-stream.md):
 * the dispatcher passes period 0x3c and the colour to FUN_00485ec0, which hands
 * hold 2 and fade 4 periods, spread 2.5 and a 4-colour palette to FUN_00484e00.
 * Cartoon\stream_unit.txt doesn't ship, so the columns are FUN_00486010's built-in ones.
 */
import { tenths } from '@/ui/lib/animations/driver'
import { paletteCycleAnimation, unitsOnBoard } from '@/ui/lib/animations/palette-cycle'
import type { CreateAnimation, Rgb } from '@/ui/lib/animations/types'

const PERIOD_MS = 60

/** Colourful: green, blue, magenta, yellow (COLORREFs 0xff00, 0xff0000, 0xff00ff, 0xffff). */
const COLORFUL: readonly Rgb[] = [
  [0, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [255, 255, 0],
]

/**
 * The 20 units the driver builds in when Cartoon/stream_unit.txt is missing (it
 * is: the F75 package ships only breath, fixon and wheel). They are FUN_00486010's
 * virtual-key lists, mapped to LED indices through the F75 profile's [KEY] table.
 * Keys the F75 lacks (ISO <>, RWin, Menu, RCtrl, PrtSc, Ins, ScrLk, Home, Pause,
 * the numpad) match no LED, so the last four units are empty; they still count
 * for the spacing. Order matters: unit 0 is the leftmost column.
 */
const UNITS: readonly (readonly number[])[] = [
  /* Esc ` Tab Caps LShift LCtrl LWin (+ISO <>) */ [0, 1, 2, 3, 4, 5, 11],
  /* 1 Q A Z LAlt */ [7, 8, 9, 10, 17],
  /* F1 2 W S X */ [12, 13, 14, 15, 16],
  /* F2 3 E D C */ [18, 19, 20, 21, 22],
  /* F3 4 R F V Space */ [24, 25, 26, 27, 28, 35],
  /* F4 5 T G B */ [30, 31, 32, 33, 34],
  /* 6 Y H N */ [37, 38, 39, 40],
  /* F5 7 U J M */ [36, 43, 44, 45, 46],
  /* F6 8 I K , */ [42, 49, 50, 51, 52],
  /* F7 9 O L . RAlt (VK 0xA5: the profile's LED 53, our Fn) */ [48, 55, 56, 57, 58, 53],
  /* F8 0 P ; / FN (VK 0xFA: the profile's LED 59, our RCtrl) (+RWin) */ [54, 61, 62, 63, 64, 59],
  /* F9 F10 = - [ ] ' (+VK 0xC1) */ [60, 66, 73, 67, 68, 74, 69],
  /*
   * F11 F12 Backspace \ Enter RShift (+Menu, RCtrl). The profile puts VK 0xDC on
   * the ISO key (LED 75); on the US board it is the backslash key, LED 80.
   */
  [72, 78, 79, 80, 81, 70],
  /* (PrtSc Ins) Delete Left */ [85, 77],
  /* (ScrLk Home) End Up Down */ [88, 82, 83],
  /* (Pause) PgUp PgDn Right */ [86, 87, 89],
  /* numpad: NumLock 7 4 1 0 */ [],
  /* numpad: / 8 5 2 */ [],
  /* numpad: * 9 6 3 . */ [],
  /* numpad: - + Enter (VK 0xC2) */ [],
]

/** One colour pulses between full and 3/10 (FUN_00484f90 with 3). */
const palette = (color: Rgb | null): readonly Rgb[] => (color ? [color, tenths(color, 3), color, tenths(color, 3)] : COLORFUL)

export const createNeonStream: CreateAnimation = ({ keys, color, speed }) =>
  paletteCycleAnimation(
    { periodMs: PERIOD_MS, holdMs: 2 * PERIOD_MS, fadeMs: 4 * PERIOD_MS, palette: palette(color), spread: 2.5, direction: 0, units: unitsOnBoard(UNITS, keys) },
    speed,
  )
