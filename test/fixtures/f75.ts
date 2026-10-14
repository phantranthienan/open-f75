/**
 * Real data from the owner's AULA F75, from a backup taken with this app on
 * 2026-10-12: the identity, the settings page (Fixed on, white, brightness 7)
 * and the colour table (rows of 7 colours, 5A A5 at offset 506).
 */

import type { FakeBoard } from '@test/fixtures/fake-hid'

const bytes = (...hex: string[]) => Array.from(hex.join('').match(/../g) ?? [], (b) => parseInt(b, 16))

export const F75_IDENTITY = bytes('0300000000cd')

export const F75_SETTINGS = bytes(
  '0003030100000404070001200100000000000100020100ff0a00000201000301',
  '000000000000000000000000000000000000000000000000ffff074609470947',
  '0947094709470947094709470947094709470947094709470947093709370937',
  '0937074707470744074407440744074407440744040904040404040404045aa5',
)

export const F75_COLOR_TABLE = bytes(
  '000000000000000000000000000000000000000000ffffff00ff000000ffffff',
  '00ff00ff00ffffffffffff000000ff000000ffffff00ff00ff00ffffffffffff',
  '000000ff000000ffffff00ff00ff00ffffffffffff000000ff000000ffffff00',
  'ff00ff00ffffffffffff000000ff000000ffffff00ff00ff00ffffffffffff00',
  '0000ff000000ffffff00ff00ff00ffffffffffff000000ff000000ffffff00ff',
  '00ff00ffffffffffff000000ff000000ffffff00ff00ff00ffffffffffff0000',
  '00ff000000ffffff00ff00ff00ffffffffffff000000ff000000ffffff00ff00',
  'ff00ffffffffffff000000ff000000ffffff00ff00ff00ffffffffffff000000',
  'ff000000ffffff00ff00ff00ffffffffffff000000ff000000ffffff00ff00ff',
  '00ffffffffff0000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '00000000000000000000000000000000000000000000000000005aa500000000',
)

/** No per-key colours stored: 378 zero bytes. Copy it before changing it. */
export const BLANK_PER_KEY: readonly number[] = new Array(378).fill(0)

/** The owner's F75 as backed up: Fixed on, white (colour 6), brightness 7. No per-key colours stored. */
export const BOARD: FakeBoard = {
  identity: F75_IDENTITY,
  settings: F75_SETTINGS,
  colorTable: F75_COLOR_TABLE,
  perKey: [...BLANK_PER_KEY],
  productId: 0x010c,
  granted: false,
  replyFormat: 'short-with-id', // what Chrome on macOS did with the real F75
  ignoreWrites: false,
}
