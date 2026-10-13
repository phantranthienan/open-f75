/**
 * What the board stores: the settings page and the colour table. Pure functions only.
 *
 * SETTINGS PAGE: 128 bytes, read with 0x84 and written with 0x04, ending in 5A A5.
 * AULA's driver reads it, patches these fields and writes it back [DRV]:
 *   0x03        debounce, 0x01 in AULA's profile and on the owner's board [DRV]
 *   0x09        1 while the per-key effect is live, else 0           [DRV]
 *   0x0a        live effect: the first number of the effect's LedOptN line in
 *               AULA's profile. 1..18 are the effects in list order ("Fixed
 *               on" = 1), 21 is per-key, 0 is off                    [DRV] [ASL] confirmed on an F75
 *   0x0b        0x20 + per-key colour group (0x20 on the F75)        [DRV]
 *   0x18        sleep timeout in SleepHW units, 0 = never            [DRV] [ASL] confirmed on an F75
 *   0x38..0x39  FF FF
 *   0x3a..      one [brightness, speed << 4 | colour] pair per effect, in list
 *               order (EFFECT_VALUES): effect 1..18 at slot effect - 1,
 *               per-key at slot 18                                   [DRV] [ASL] confirmed with Fn+Tab
 *   0x7e..0x7f  5A A5 end marker
 *   The colour nibble picks a slot in the effect's colour-table row, 7 = colourful.
 *   In the default row slot n is firmware colour n (0 red ... 6 white). AULA's
 *   driver only writes 0 or 7 and puts the chosen colour in slot 0 [DRV]; the
 *   firmware's Fn keys use the other slots too [ASL].
 *   Over the 2.4 GHz dongle the same 128 bytes travel as ten 14-byte
 *   fragments of report 0x13 [F87-CAP] [DRV], and the offsets line up.
 *
 * COLOUR TABLE: 512 bytes, read with 0x8a and written with 0x0a (the driver's
 *   GetLedRgbTab / SetLedRgbTab). One row of 7 RGB colours (21 bytes) per
 *   effect, at row = the effect's 0x0a value, so Fixed on is row 1 (offsets
 *   21..41). The driver fills 20 rows (420 bytes) and pads them to 512 with
 *   5A A5 at 506 [DRV]. For "Fixed on, custom colour" it puts the colour in
 *   row 1, slot 0 and selects slot 0 [DRV], as the OEM app did on an F87
 *   [F87-CAP]. So [RS] was right and [ASL]'s per-key reading is not. The table
 *   read off the owner's F75 has this layout [OWNER]; colorTableMatchesLayout
 *   still checks a board's table before a custom colour is written into it.
 *
 * Sources:
 *   [DRV]     AULA's F75 driver, OemDrv.exe from "AULA F75 Setup v2.0 20260514.exe"
 *             (SHA-256 1dfe4803...ae44a7), decompiled with Ghidra 12.1.4, never run.
 *             Function addresses in docs/reverse-engineering/report.md
 *   [ASL]     references/AulaSofwareLinux/src/config_page.rs, F75 dump and tests
 *   [KBINI]   references/AulaSofwareLinux/assets/devices/f75-fr/device.ini, AULA's F75 profile
 *             (LedOpt1 = Fixed on, Light 0..9, Speed 0..4)
 *   [RS]      github.com/RustamSheoran/aula-f75 README (0x8a/0x0a = 512-byte colour table)
 *   [F87-CAP] OEM-app captures of an F87 (2.4 GHz dongle), references/Aula-F87-Controller/
 *             captures/macos-host-wireshark-vm/config-changes/1[345]-fixed-on-*.pcapng
 *   [OWNER]   a backup of the owner's F75 taken with this app (test/fixtures/f75.ts)
 */
import { assertRgb, sameBytes, type Rgb } from '@/protocol/bytes'

export const SETTINGS_LENGTH = 128
export const COLOR_TABLE_LENGTH = 512

const END_MARKER = [0x5a, 0xa5]

export const SettingsOffset = {
  perKeyMode: 0x09,
  effect: 0x0a,
  effectTable: 0x3a,
  endMarker: SETTINGS_LENGTH - 2,
} as const

/** The 0x0a value of "Fixed on" [KBINI LedOpt1] [DRV]. */
export const FIXED_ON = 1
/** The 0x0a value of the per-key effect [KBINI LedOpt19] [DRV]. */
export const PER_KEY = 21
/**
 * The 0x0a value of each effect that has a settings slot, in slot order: the
 * first numbers of LedOpt1..LedOpt19 [KBINI]. The driver fills slots by this
 * position, not by the value [DRV]. Off (0, LedOpt20) has no slot.
 */
export const EFFECT_VALUES: readonly number[] = [...Array.from({ length: 18 }, (_, i) => i + 1), PER_KEY]
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
  const slot = EFFECT_VALUES.indexOf(effect)
  if (slot < 0) throw new RangeError(`no settings slot for effect ${effect}`)
  return SettingsOffset.effectTable + slot * 2
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
    // effect 0 (off) or a value with no slot
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
  /** True when the colour goes into the colour table (row 1, slot 0, as AULA's driver does). */
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
 *    colour in slot 0 of that row and select slot 0, as AULA's driver does.
 * 3. Otherwise only the seven firmware colours are possible.
 *
 * Either way the effect becomes Fixed on, and the per-key flag at 0x09 is
 * cleared, as the driver does for every effect but per-key [DRV].
 */
export function planStaticColor(settings: Uint8Array, colorTable: Uint8Array | null, rgb: Rgb): StaticColorPlan {
  assertSettingsPage(settings)
  assertRgb(rgb)

  const layoutOk = colorTable !== null && colorTableMatchesLayout(colorTable)
  const row = layoutOk ? colorRow(colorTable, FIXED_ON) : FIRMWARE_COLORS
  // Keep the selected colour if it already is this one (a row can hold a colour twice).
  const current = effectSlot(settings, FIXED_ON).color
  let colorIndex = current < row.length && sameBytes(row[current], rgb) ? current : row.findIndex((c) => sameBytes(c, rgb))
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
  next[SettingsOffset.perKeyMode] = 0
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
