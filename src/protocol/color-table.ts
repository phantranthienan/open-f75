/**
 * The colour table: 512 bytes, read with 0x8a and written with 0x0a (the
 * driver's GetLedRgbTab / SetLedRgbTab). Pure functions only.
 *
 * One row of 7 RGB colours (21 bytes) per effect, at row = the effect's 0x0a
 * value, so Fixed on is row 1 (offsets 21..41). AULA's driver fills 20 rows
 * (420 bytes) and pads them to 512 with 5A A5 at 506 [DRV]. The settings
 * page's colour nibble picks a slot of the row. In the default row slot n is
 * firmware colour n (0 red ... 6 white); for a custom colour the driver puts it
 * in slot 0 and selects slot 0 [DRV], as the OEM app did on an F87 [F87-CAP].
 * The table read off the owner's F75 has this layout in rows 1..13 [OWNER].
 *
 * Sources:
 *   [DRV]     AULA's F75 driver (OemDrv.exe), CDevG5KB::ApplySetting FUN_0049c020
 *   [ASL]     references/AulaSofwareLinux/src/config_page.rs (firmware colour order)
 *   [F87-CAP] OEM-app captures of an F87, references/Aula-F87-Controller/
 *             captures/macos-host-wireshark-vm/config-changes/1[345]-fixed-on-*.pcapng
 *   [OWNER]   a backup of the owner's F75 taken with this app (test/fixtures/f75.ts)
 */
import { sameBytes, type Rgb } from '@/protocol/bytes'

export const COLOR_TABLE_LENGTH = 512

/** The firmware's colour order [ASL], also the order of every default row. */
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

const ROW_LENGTH = FIRMWARE_COLORS.length * 3
const MARKER_AT = 506
const MARKER = [0x5a, 0xa5]

export function hasColorTableMarker(table: Uint8Array): boolean {
  return table.length === COLOR_TABLE_LENGTH && sameBytes(table.subarray(MARKER_AT, MARKER_AT + 2), MARKER)
}

export function slotOffset(row: number, slot: number): number {
  return row * ROW_LENGTH + slot * 3
}

export function colorRow(table: Uint8Array, row: number): Rgb[] {
  return FIRMWARE_COLORS.map((_, slot) => {
    const at = slotOffset(row, slot)
    return [table[at], table[at + 1], table[at + 2]] as const
  })
}

/**
 * True when the table has its end marker and slots 1..6 of this row hold the
 * six default colours. Slot 0 is not checked: it holds the user's colour.
 * A custom colour is only written into a row that passes.
 */
export function rowMatchesLayout(table: Uint8Array, row: number): boolean {
  if (!hasColorTableMarker(table)) return false
  return colorRow(table, row).every((rgb, slot) => slot === 0 || sameBytes(rgb, FIRMWARE_COLORS[slot]))
}

/** A copy of the table with `rgb` in slot 0 of `row`. */
export function withSlotZero(table: Uint8Array, row: number, rgb: Rgb): Uint8Array {
  const next = Uint8Array.from(table)
  next.set(rgb, slotOffset(row, 0))
  return next
}
