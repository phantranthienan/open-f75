/**
 * The allowlist: the only packets that may reach the board. Checked twice, by
 * the guard (safe-send.ts, with logging and dry run) and again by each
 * transport right before the hardware call, so code that skips the guard
 * still cannot send anything else.
 *
 * Seven wired commands pass: four reads (identity, settings page, colour
 * table, per-key colours) and three writes (settings page, colour table,
 * per-key colours). Every header field must match exactly, the zero padding
 * must be zero, and a settings or colour-table write must carry its region's
 * 5A A5 end marker. Factory reset, key matrix, macros, direct LEDs, firmware
 * and anything unknown are refused.
 *
 * Each rule's bytes are sourced in protocol/: the per-key commands come from
 * AULA's decompiled driver (protocol/per-key.ts, report §10), only for colour
 * group 0, the one group the F75 profile has.
 */
import { toHex } from '@/protocol/bytes'
import { COLOR_TABLE_LENGTH, hasColorTableMarker } from '@/protocol/color-table'
import { PER_KEY_LENGTH } from '@/protocol/per-key'
import { SETTINGS_LENGTH, isSettingsPage } from '@/protocol/settings'
import {
  Cmd,
  DATA_LENGTH,
  HEADER_LENGTH,
  IDENTITY_LENGTH,
  INFO_IDENTITY,
  REPORT_ID,
  parseHeader,
} from '@/protocol/wired'
import type { ReportType } from '@/transport'

export interface Packet {
  type: ReportType
  reportId: number
  /** Excludes the report ID, like WebHID's sendFeatureReport. */
  data: Uint8Array
}

export type Access = 'read' | 'write'

export type Verdict =
  | { allowed: true; access: Access; label: string }
  | { allowed: false; reason: string }

interface Rule {
  name: string
  cmd: number
  param: number
  length: number
  access: Access
  /** Extra check on a write's payload. */
  payload?: (data: Uint8Array) => string | null
}

const RULES: readonly Rule[] = [
  { name: 'identity read', cmd: Cmd.GetInfo, param: INFO_IDENTITY, length: IDENTITY_LENGTH, access: 'read' },
  { name: 'settings read', cmd: Cmd.GetSettings, param: 0, length: SETTINGS_LENGTH, access: 'read' },
  { name: 'colour table read', cmd: Cmd.GetColorTable, param: 0, length: COLOR_TABLE_LENGTH, access: 'read' },
  { name: 'per-key colours read', cmd: Cmd.GetPerKey, param: 0, length: PER_KEY_LENGTH, access: 'read' },
  {
    name: 'settings write',
    cmd: Cmd.SetSettings,
    param: 0,
    length: SETTINGS_LENGTH,
    access: 'write',
    payload: (d) => (isSettingsPage(d) ? null : 'settings page without its 5A A5 end marker'),
  },
  {
    name: 'colour table write',
    cmd: Cmd.SetColorTable,
    param: 0,
    length: COLOR_TABLE_LENGTH,
    access: 'write',
    payload: (d) => (hasColorTableMarker(d) ? null : 'colour table without its 5A A5 marker'),
  },
  // Any 378 bytes are colours; the padding check keeps the rest of the frame zero.
  { name: 'per-key colours write', cmd: Cmd.SetPerKey, param: 0, length: PER_KEY_LENGTH, access: 'write' },
]

const hex8 = (n: number) => `0x${n.toString(16).padStart(2, '0')}`

/** A full 520-byte wired frame as a packet. */
export function featurePacket(frame: Uint8Array): Packet {
  return { type: 'feature', reportId: frame[0], data: frame.slice(1) }
}

export function frameOf(packet: Packet): Uint8Array {
  const frame = new Uint8Array(packet.data.length + 1)
  frame[0] = packet.reportId
  frame.set(packet.data, 1)
  return frame
}

export function inspect(packet: Packet): Verdict {
  const refuse = (reason: string): Verdict => ({ allowed: false, reason })

  if (packet.type !== 'feature') return refuse(`${packet.type} reports are not on the allowlist`)
  if (packet.reportId !== REPORT_ID) return refuse(`report ID ${hex8(packet.reportId)} is not on the allowlist`)
  if (packet.data.length !== DATA_LENGTH) {
    return refuse(`expected ${DATA_LENGTH} data bytes, got ${packet.data.length}`)
  }

  const frame = frameOf(packet)
  const header = parseHeader(frame)
  const rule = RULES.find((r) => r.cmd === header.cmd)
  if (!rule) return refuse(`command ${hex8(header.cmd)} is not on the allowlist`)
  if (header.param !== rule.param) return refuse(`${rule.name}: parameter ${hex8(header.param)}`)
  if (header.reserved !== 0 || header.packages !== 1 || header.index !== 0) {
    return refuse(`${rule.name}: expected one package (header ${toHex(frame.subarray(0, HEADER_LENGTH))})`)
  }
  if (header.length !== rule.length) return refuse(`${rule.name}: length ${header.length}, expected ${rule.length}`)

  const payloadEnd = HEADER_LENGTH + (rule.access === 'write' ? rule.length : 0)
  if (frame.subarray(payloadEnd).some((b) => b !== 0)) return refuse(`${rule.name}: padding is not zero`)
  const problem = rule.payload?.(frame.subarray(HEADER_LENGTH, payloadEnd))
  if (problem) return refuse(`${rule.name}: ${problem}`)

  return { allowed: true, access: rule.access, label: rule.name }
}

export class BlockedPacketError extends Error {
  constructor(reason: string) {
    super(`Blocked: ${reason}`)
    this.name = 'BlockedPacketError'
  }
}

/** Throws BlockedPacketError unless the packet is on the allowlist. */
export function assertAllowed(packet: Packet): Verdict & { allowed: true } {
  const verdict = inspect(packet)
  if (!verdict.allowed) throw new BlockedPacketError(verdict.reason)
  return verdict
}
