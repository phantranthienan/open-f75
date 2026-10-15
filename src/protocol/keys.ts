/**
 * The F75's keys in the US (ANSI) layout, as the owner's board has them: each
 * key's rectangle in the coordinates of AULA's keyboard picture (679 x 304 px)
 * and its LED index. Pure data.
 *
 * AULA ships one F75 profile, the French (ISO) one [KBINI]; its rectangles and
 * LED indices are kept for every key the two layouts share. The ANSI keys are
 * reshaped after a photo of the board, with OpenRGB's AULA F75 layout for their
 * LED indices [ORGB]: \ is 80 at the end of the Q row, Enter is 81 on one row,
 * left Shift is wide, and after the space bar come Fn (53) and right Ctrl (59).
 * The ISO keys 75 (#) and 76 (<>) don't exist.
 *
 * The LED index is column * 6 + row, row 0 being the F-key row, and is where a
 * key's colour goes in the per-key colours (per-key.ts) and the direct LED
 * frame. The knob (index 84) is drawn but has no light (KNOB).
 *
 * Sources:
 *   [KBINI] references/AulaSofwareLinux/assets/devices/f75-fr/device.ini, [KEY] K1..K82
 *           (x1, y1, x2, y2, type, code, modifier, index); docs/reverse-engineering/report.md §12
 *   [ORGB]  references/OpenRGB/Controllers/SinowealthController/SinowealthKeyboard10cController/
 *           SinowealthKeyboard10cDevices.cpp, aula_f75_layout (identity 0xCD)
 */

export interface Key {
  /** The key's name in AULA's profile, for screen readers and titles. */
  name: string
  led: number
  x: number
  y: number
  w: number
  h: number
  /** What is printed on the key; shorter than the name for wide names. */
  label: string
}

const key = (name: string, led: number, x: number, y: number, w: number, h: number, label = name): Key => ({
  name,
  led,
  x,
  y,
  w,
  h,
  label,
})

/** In rows from the top, left to right. */
export const F75_KEYS: readonly Key[] = [
  key('Esc', 0, 27, 33, 26, 28),
  key('F1', 12, 106, 34, 26, 28),
  key('F2', 18, 145, 34, 26, 28),
  key('F3', 24, 186, 34, 26, 28),
  key('F4', 30, 226, 34, 26, 28),
  key('F5', 36, 279, 34, 26, 28),
  key('F6', 42, 320, 34, 26, 28),
  key('F7', 48, 359, 34, 26, 28),
  key('F8', 54, 399, 34, 26, 28),
  key('F9', 60, 453, 34, 26, 28),
  key('F10', 66, 493, 34, 26, 28),
  key('F11', 72, 533, 34, 26, 28),
  key('F12', 78, 573, 34, 26, 28),
  key('`', 1, 27, 88, 26, 28),
  key('1', 7, 67, 88, 26, 28),
  key('2', 13, 107, 88, 26, 28),
  key('3', 19, 147, 88, 26, 28),
  key('4', 25, 187, 88, 26, 28),
  key('5', 31, 227, 88, 26, 28),
  key('6', 37, 267, 88, 26, 28),
  key('7', 43, 307, 88, 26, 28),
  key('8', 49, 347, 88, 26, 28),
  key('9', 55, 387, 88, 26, 28),
  key('0', 61, 427, 88, 26, 28),
  key('-', 67, 467, 88, 26, 28),
  key('=', 73, 507, 88, 26, 28),
  key('Backspace', 79, 547, 88, 66, 28, 'Bksp'),
  key('Delete', 85, 626, 88, 26, 28, 'Del'),
  key('Tab', 2, 28, 128, 46, 28),
  key('Q', 8, 88, 128, 26, 28),
  key('W', 14, 127, 128, 26, 28),
  key('E', 20, 167, 128, 26, 28),
  key('R', 26, 207, 128, 26, 28),
  key('T', 32, 247, 128, 26, 28),
  key('Y', 38, 287, 128, 26, 28),
  key('U', 44, 326, 128, 26, 28),
  key('I', 50, 367, 128, 26, 28),
  key('O', 56, 407, 128, 26, 28),
  key('P', 62, 447, 128, 26, 28),
  key('[', 68, 487, 128, 26, 28),
  key(']', 74, 527, 127, 26, 28),
  key('\\', 80, 566, 127, 45, 28),
  key('PgUp', 86, 627, 127, 26, 28),
  key('CapsLock', 3, 28, 167, 56, 28, 'Caps'),
  key('A', 9, 98, 168, 26, 28),
  key('S', 15, 137, 168, 26, 28),
  key('D', 21, 178, 168, 26, 28),
  key('F', 27, 217, 168, 26, 28),
  key('G', 33, 257, 168, 26, 28),
  key('H', 39, 297, 168, 26, 28),
  key('J', 45, 337, 168, 26, 28),
  key('K', 51, 377, 168, 26, 28),
  key('L', 57, 417, 168, 26, 28),
  key(';', 63, 457, 168, 26, 28),
  key("'", 69, 496, 168, 26, 28),
  key('Enter', 81, 536, 167, 75, 28),
  key('PgDn', 87, 627, 167, 26, 28),
  key('LShift', 4, 27, 207, 76, 28, 'Shift'),
  key('Z', 10, 117, 207, 26, 28),
  key('X', 16, 158, 207, 26, 28),
  key('C', 22, 197, 207, 26, 28),
  key('V', 28, 237, 207, 26, 28),
  key('B', 34, 277, 207, 26, 28),
  key('N', 40, 317, 207, 26, 28),
  key('M', 46, 356, 207, 26, 28),
  key(',', 52, 397, 207, 26, 28),
  key('.', 58, 437, 207, 26, 28),
  key('/', 64, 477, 207, 26, 28),
  key('RShift', 70, 516, 207, 56, 28, 'Shift'),
  key('Up', 82, 586, 207, 26, 28, '↑'),
  key('End', 88, 627, 207, 26, 28),
  key('LCtrl', 5, 27, 247, 36, 28, 'Ctrl'),
  key('LWin', 11, 77, 247, 36, 28, 'Win'),
  key('LAlt', 17, 128, 247, 36, 28, 'Alt'),
  key('Space', 35, 176, 248, 236, 28, ''),
  key('Fn', 53, 427, 248, 36, 28),
  key('RCtrl', 59, 477, 247, 36, 28, 'Ctrl'),
  key('Left', 77, 547, 247, 26, 28, '←'),
  key('Down', 83, 587, 247, 26, 28, '↓'),
  key('Right', 89, 627, 247, 26, 28, '→'),
]

/** The knob above Delete, in the same coordinates. It turns and clicks but has no light to paint. */
export const KNOB = { x: 639, y: 48, r: 15 }

/** The picture's area that holds keys, with a margin, for an SVG viewBox. */
export const KEYS_VIEW_BOX = '17 23 646 263'
