/**
 * The three regions the lighting lives in, described once: how each is read
 * and written, its length, its check and the name the log uses. Pure data.
 * The keys match the fields of the board state the app keeps (keyboard.ts).
 */
import { COLOR_TABLE_LENGTH } from '@/protocol/color-table'
import { PER_KEY_LENGTH } from '@/protocol/per-key'
import { SETTINGS_LENGTH, assertSettingsPage } from '@/protocol/settings'
import { Cmd } from '@/protocol/wired'

export type Region = 'settings' | 'colorTable' | 'perKey'

export interface RegionInfo {
  /** How the log and the messages name it. */
  label: string
  read: number
  write: number
  length: number
  /** Throws when a read did not return the region (a failed settings read lacks its end marker [ASL]). */
  check?: (bytes: Uint8Array) => void
  /** What a failed read means. A region without one must be read, or nothing can be planned. */
  unreadable?: string
  /** Added when a read-back differs: what is still unconfirmed about the region. */
  readBackNote?: string
}

export const REGIONS: Record<Region, RegionInfo> = {
  settings: { label: 'settings page', read: Cmd.GetSettings, write: Cmd.SetSettings, length: SETTINGS_LENGTH, check: assertSettingsPage },
  colorTable: {
    label: 'colour table',
    read: Cmd.GetColorTable,
    write: Cmd.SetColorTable,
    length: COLOR_TABLE_LENGTH,
    unreadable: 'only firmware colours are possible',
  },
  perKey: {
    label: 'per-key colours',
    read: Cmd.GetPerKey,
    write: Cmd.SetPerKey,
    length: PER_KEY_LENGTH,
    unreadable: 'the stored key colours are unknown',
    // per-key.ts: the 0x86 layout is assumed to match the 0x06 one.
    readBackNote: "The per-key read-back layout isn't confirmed yet; check what the keys show.",
  },
}
