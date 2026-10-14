/**
 * Per-key colours: 378 bytes, written with 0x06 and read with 0x86, parameter
 * = colour group (the F75 has one, group 0). Pure functions only.
 *
 * Three planes of 126 bytes, red then green then blue (GameRGBIndex=0,1,2),
 * each indexed by the key's LED index (keys.ts). AULA's driver sends them
 * while the per-key effect is selected, before the settings page [DRV].
 * The read-back layout of 0x86 is assumed to match; the driver's own use of
 * it was not traced (report §10).
 *
 * Sources:
 *   [DRV]   AULA's F75 driver (OemDrv.exe), CDevG5KB::ApplySetting FUN_0049c020 and
 *           SetGame/GetGame FUN_00499cf0/FUN_00499d50; docs/reverse-engineering/report.md §10
 *   [KBINI] AULA's F75 profile: GaoshouGroupNum=1, GameRGBIndex=0,1,2, MatrixLen=128
 */
import type { Rgb } from '@/protocol/bytes'

/** LED indices one plane covers. */
export const LED_SLOTS = 126
export const PER_KEY_LENGTH = LED_SLOTS * 3

/** led index -> colour; keys not in the map are off. */
export type KeyColors = ReadonlyMap<number, Rgb>

export function encodePerKey(colors: KeyColors): Uint8Array {
  const bytes = new Uint8Array(PER_KEY_LENGTH)
  for (const [led, [r, g, b]] of colors) {
    if (!Number.isInteger(led) || led < 0 || led >= LED_SLOTS) throw new RangeError(`no LED ${led}`)
    bytes[led] = r
    bytes[LED_SLOTS + led] = g
    bytes[2 * LED_SLOTS + led] = b
  }
  return bytes
}

/** The lit LEDs in a 378-byte buffer; black ones are left out. */
export function decodePerKey(bytes: Uint8Array): Map<number, Rgb> {
  if (bytes.length !== PER_KEY_LENGTH) throw new Error(`per-key colours are ${PER_KEY_LENGTH} bytes, not ${bytes.length}`)
  const colors = new Map<number, Rgb>()
  for (let led = 0; led < LED_SLOTS; led++) {
    const rgb: Rgb = [bytes[led], bytes[LED_SLOTS + led], bytes[2 * LED_SLOTS + led]]
    if (rgb.some((c) => c > 0)) colors.set(led, rgb)
  }
  return colors
}
