/**
 * What the board stores, independent of how it travels (wired.ts or dongle.ts).
 * Pure functions only.
 *
 * SETTINGS PAGE: 128 bytes, read with 0x84 and written with 0x04, ending in 5A A5.
 *   0x0a        live effect, as its 1-based position in AULA's effect list
 *               ("Fixed on" = 1)                                    [ASL] confirmed on an F75
 *   0x18        sleep timeout                                       [ASL] confirmed on an F75
 *   0x38..0x39  FF FF
 *   0x3a..      per-effect [brightness, speed << 4 | colour] pairs,
 *               slot = effect - 1                                   [ASL] confirmed with Fn+Tab
 *   0x7e..0x7f  5A A5 end marker
 *   The colour nibble selects one of 7 colours (0 red ... 6 white), 7 = colourful.
 *   Over the dongle the same 128 bytes travel as ten 14-byte fragments
 *   (dongle.ts, settingsFromConfigFrames), and the offsets line up.
 *
 * COLOUR TABLE: 512 bytes, read with 0x8a and written with 0x0a.
 *   HYPOTHESIS, not confirmed on an F75. Reassembling the OEM app's dongle
 *   palette writes gives 512 bytes of rows of 7 RGB colours (21 bytes per row,
 *   red green blue yellow magenta cyan white), with 5A A5 at 506. For
 *   "Fixed on, custom colour" the OEM app put the colour in row 1, slot 0
 *   (offset 21) and selected colour 0 [F87-CAP]. The two F75 projects
 *   disagree on what 0x0a holds ([RS] colour slots, [ASL] per-key colours), so
 *   custom colours are only written when the board's own table has exactly
 *   this layout (colorTableMatchesLayout).
 *
 * Sources:
 *   [ASL]     references/AulaSofwareLinux/src/config_page.rs, F75 dump and tests
 *   [KBINI]   references/AulaSofwareLinux/assets/devices/f75-fr/device.ini, AULA's F75 profile
 *             (LedOpt1 = Fixed on, Light 0..9, Speed 0..4)
 *   [RS]      github.com/RustamSheoran/aula-f75 README (0x8a/0x0a = 512-byte colour table)
 *   [F87-CAP] test/golden/f87-dongle-fixed-on-*.json
 */
import { assertRgb, sameBytes, type Rgb } from '@/protocol/bytes'

export const SETTINGS_LENGTH = 128
export const COLOR_TABLE_LENGTH = 512

const END_MARKER = [0x5a, 0xa5]

export const SettingsOffset = {
  effect: 0x0a,
  effectTable: 0x3a,
  endMarker: SETTINGS_LENGTH - 2,
} as const

/** Position of "Fixed on" in AULA's F75 effect list [KBINI LedOpt1]. */
export const FIXED_ON = 1
/** Colour nibble value meaning "colourful" [ASL]. */
export const COLORFUL = 7

/** The firmware's colour order [ASL COLORS], also the order of every colour-table row. */
export const FIRMWARE_COLORS: readonly Rgb[] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
]
export const COLOR_NAMES = ['red', 'green', 'blue', 'yellow', 'magenta', 'cyan', 'white'] as const

const COLOR_ROW_LENGTH = FIRMWARE_COLORS.length * 3
const COLOR_TABLE_MARKER_AT = 506

// ── Settings page ───────────────────────────────────────────────────────

export function isSettingsPage(page: Uint8Array): boolean {
  return page.length === SETTINGS_LENGTH && sameBytes(page.subarray(SettingsOffset.endMarker), END_MARKER)
}

/** Refuses anything that is not a whole page; a failed read looks like a page without 5A A5 [ASL]. */
export function assertSettingsPage(page: Uint8Array): void {
  if (!isSettingsPage(page)) {
    throw new Error(`not a settings page: ${page.length} bytes, end marker missing or wrong`)
  }
}

export interface EffectSlot {
  brightness: number
  speed: number
  color: number
}

function slotOffset(effect: number): number {
  const at = SettingsOffset.effectTable + (effect - 1) * 2
  if (effect < 1 || at + 2 > SettingsOffset.endMarker) throw new RangeError(`no settings slot for effect ${effect}`)
  return at
}

export function effectSlot(page: Uint8Array, effect: number): EffectSlot {
  const at = slotOffset(effect)
  return { brightness: page[at], speed: page[at + 1] >> 4, color: page[at + 1] & 0x0f }
}

// ── Colour table ────────────────────────────────────────────────────────

export function hasColorTableMarker(table: Uint8Array): boolean {
  return (
    table.length === COLOR_TABLE_LENGTH &&
    sameBytes(table.subarray(COLOR_TABLE_MARKER_AT, COLOR_TABLE_MARKER_AT + 2), END_MARKER)
  )
}

export function colorRow(table: Uint8Array, row: number): Rgb[] {
  return FIRMWARE_COLORS.map((_, slot) => {
    const at = row * COLOR_ROW_LENGTH + slot * 3
    return [table[at], table[at + 1], table[at + 2]] as const
  })
}

/**
 * True when the table looks like the hypothesis above: the end marker, and
 * slots 1..6 of the Fixed-on row holding the six default colours. Slot 0 is
 * not checked because it holds the user's custom colour.
 */
export function colorTableMatchesLayout(table: Uint8Array): boolean {
  if (!hasColorTableMarker(table)) return false
  const row = colorRow(table, FIXED_ON)
  return row.every((rgb, slot) => slot === 0 || sameBytes(rgb, FIRMWARE_COLORS[slot]))
}

// ── Reading the board's state ───────────────────────────────────────────

export interface BoardState {
  effect: number
  /** Null when the effect number has no slot (off, or out of range). */
  slot: EffectSlot | null
  /** What Fixed on shows; null for other effects or "colourful". */
  color: Rgb | null
}

export function describeBoard(settings: Uint8Array, table: Uint8Array | null): BoardState {
  assertSettingsPage(settings)
  const effect = settings[SettingsOffset.effect]
  let slot: EffectSlot | null = null
  try {
    slot = effectSlot(settings, effect)
  } catch {
    // effect 0 (off) or a number past the table
  }
  let color: Rgb | null = null
  if (effect === FIXED_ON && slot && slot.color < COLORFUL) {
    color = table && colorTableMatchesLayout(table) ? colorRow(table, FIXED_ON)[slot.color] : FIRMWARE_COLORS[slot.color]
  }
  return { effect, slot, color }
}

// ── Planning a static colour ────────────────────────────────────────────

export interface Change {
  region: 'settings' | 'colour table'
  offset: number
  from: number
  to: number
}

function diff(region: Change['region'], before: Uint8Array, after: Uint8Array): Change[] {
  const changes: Change[] = []
  before.forEach((from, offset) => {
    if (after[offset] !== from) changes.push({ region, offset, from, to: after[offset] })
  })
  return changes
}

export interface StaticColorPlan {
  settings: Uint8Array
  /** Patched colour table, or null when the table does not need writing. */
  colorTable: Uint8Array | null
  colorIndex: number
  /** True when the colour goes into the colour table (the unconfirmed path). */
  custom: boolean
  changes: Change[]
  warnings: string[]
}

/**
 * Read-modify-write plan for "Fixed on" in one colour. Both inputs are what the
 * board just returned; only the bytes listed in `changes` differ in the output.
 *
 * 1. The colour is already in the Fixed-on row (red, green, ... by default):
 *    select it with the colour nibble. Settings page only; confirmed path.
 * 2. Otherwise, if the board's table matches the expected layout, put the
 *    colour in slot 0 of that row and select slot 0, as the OEM app does.
 * 3. Otherwise only the seven firmware colours are possible.
 */
export function planStaticColor(settings: Uint8Array, colorTable: Uint8Array | null, rgb: Rgb): StaticColorPlan {
  assertSettingsPage(settings)
  assertRgb(rgb)

  const layoutOk = colorTable !== null && colorTableMatchesLayout(colorTable)
  const row = layoutOk ? colorRow(colorTable, FIXED_ON) : FIRMWARE_COLORS
  let colorIndex = row.findIndex((c) => sameBytes(c, rgb))
  let table: Uint8Array | null = null

  if (colorIndex < 0) {
    if (!layoutOk) {
      throw new Error(
        "Custom colours need the board's colour table in the expected layout, and this one differs. " +
          `Only the 7 firmware colours (${COLOR_NAMES.join(', ')}) are available; a backup of the table would help pin it down.`,
      )
    }
    colorIndex = 0
    table = Uint8Array.from(colorTable)
    table.set(rgb, FIXED_ON * COLOR_ROW_LENGTH)
  }

  const next = Uint8Array.from(settings)
  next[SettingsOffset.effect] = FIXED_ON
  const at = slotOffset(FIXED_ON)
  next[at + 1] = (next[at + 1] & 0xf0) | colorIndex

  const warnings: string[] = []
  if (next[at] === 0) warnings.push('Fixed on brightness is 0 on the board, so the keys will stay dark.')

  return {
    settings: next,
    colorTable: table,
    colorIndex,
    custom: table !== null,
    changes: [...(table ? diff('colour table', colorTable!, table) : []), ...diff('settings', settings, next)],
    warnings,
  }
}
