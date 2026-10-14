/**
 * The settings page: 128 bytes, read with 0x84 and written with 0x04, ending
 * in 5A A5. Pure functions only.
 *
 * AULA's driver reads it, patches these fields and writes it back [DRV]:
 *   0x03        debounce, 0x01 in AULA's profile and on the owner's board
 *   0x09        1 while the per-key effect is live, else 0
 *   0x0a        live effect: its `value` in effects.ts ("Fixed on" = 1,
 *               per-key 21, off 0)                                [DRV] [ASL] confirmed on an F75
 *   0x0b        0x20 + per-key colour group (0x20 on the F75)
 *   0x18        sleep timeout in SleepHW units, 0 = never         [DRV] [ASL] confirmed on an F75
 *   0x38..0x39  FF FF
 *   0x3a..      one [brightness, speed << 4 | colour] pair per effect, at
 *               the effect's `slot` (list order, not value)       [DRV] [ASL] confirmed with Fn+Tab
 *   0x7e..0x7f  5A A5 end marker
 * The colour nibble picks a slot of the effect's colour-table row
 * (color-table.ts), 7 = colourful. AULA's driver only writes 0 or 7 and puts
 * the chosen colour in slot 0 [DRV]; the firmware's Fn keys use the other
 * slots too [ASL]. Over the 2.4 GHz dongle the same 128 bytes travel as ten
 * 14-byte fragments of report 0x13 [F87-CAP] [DRV], and the offsets line up.
 *
 * Sources:
 *   [DRV]     AULA's F75 driver, OemDrv.exe from "AULA F75 Setup v2.0 20260514.exe"
 *             (SHA-256 1dfe4803...ae44a7), decompiled with Ghidra 12.1.4, never run.
 *             The page builder is FUN_0049bbf0; see docs/reverse-engineering/report.md §7
 *   [ASL]     references/AulaSofwareLinux/src/config_page.rs, F75 dump and tests
 *   [F87-CAP] OEM-app captures of an F87 (2.4 GHz dongle), references/Aula-F87-Controller/captures/
 */
import { sameBytes } from '@/protocol/bytes'
import type { Effect } from '@/protocol/effects'

export const SETTINGS_LENGTH = 128

export const SettingsOffset = {
  perKeyMode: 0x09,
  effect: 0x0a,
  perKeyGroup: 0x0b,
  effectSlots: 0x3a,
  endMarker: SETTINGS_LENGTH - 2,
} as const

/** 0x0b while per-key colour group 0 is selected: StartGp (0x20) + group [DRV]. */
export const PER_KEY_GROUP_0 = 0x20
/** Colour nibble meaning "colourful" [ASL] [DRV RandomVal]. */
export const COLORFUL = 7

const END_MARKER = [0x5a, 0xa5]

export function isSettingsPage(page: Uint8Array): boolean {
  return page.length === SETTINGS_LENGTH && sameBytes(page.subarray(SettingsOffset.endMarker), END_MARKER)
}

/** Refuses anything that is not a whole page; a failed read looks like a page without 5A A5 [ASL]. */
export function assertSettingsPage(page: Uint8Array): void {
  if (!isSettingsPage(page)) {
    throw new Error(`not a settings page: ${page.length} bytes, end marker missing or wrong`)
  }
}

/** One effect's pair on the settings page. */
export interface EffectSlot {
  brightness: number
  speed: number
  /** The colour nibble: a slot of the effect's colour-table row, or COLORFUL. */
  color: number
}

function pairOffset(effect: Effect): number {
  if (effect.slot === null) throw new RangeError(`${effect.name} has no settings slot`)
  return SettingsOffset.effectSlots + effect.slot * 2
}

export function readSlot(page: Uint8Array, effect: Effect): EffectSlot {
  const at = pairOffset(effect)
  return { brightness: page[at], speed: page[at + 1] >> 4, color: page[at + 1] & 0x0f }
}

/** Writes the slot's pair into `page` (in place). */
export function writeSlot(page: Uint8Array, effect: Effect, slot: EffectSlot): void {
  const at = pairOffset(effect)
  page[at] = slot.brightness
  page[at + 1] = (slot.speed << 4) | slot.color
}
