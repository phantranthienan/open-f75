/**
 * The allowlist guard. This is the only module allowed to call Transport.send;
 * src/guard.test.ts fails the build if anything else does.
 *
 * Safety rules it enforces (roadmap, "Safety rules"):
 *   - only five wired commands pass: three reads (identity, settings page,
 *     colour table) and two writes (settings page, colour table); factory
 *     reset, key matrix, macros, direct LEDs, firmware and anything unknown are refused
 *   - every header field must match the rule exactly, the zero padding must be
 *     zero, and a write must carry its region's 5A A5 end marker
 *   - every packet is logged as hex before it goes out
 *   - dry run blocks every write; reads still go out so a dry run can show the
 *     exact bytes it would have written for the board's real settings
 */
import type { Log } from './log'
import { COLOR_TABLE_LENGTH, SETTINGS_LENGTH, hasColorTableMarker, isSettingsPage } from './protocol/settings'
import { toHex } from './protocol/bytes'
import {
  Cmd,
  DATA_LENGTH,
  HEADER_LENGTH,
  IDENTITY_LENGTH,
  INFO_IDENTITY,
  REPORT_ID,
  compactHex,
  parseHeader,
} from './protocol/wired'
import type { ReportType, Transport } from './transport'

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
]

const hex8 = (n: number) => `0x${n.toString(16).padStart(2, '0')}`

/** A full 520-byte wired frame as a packet. */
export function featurePacket(frame: Uint8Array): Packet {
  return { type: 'feature', reportId: frame[0], data: frame.slice(1) }
}

function frameOf(packet: Packet): Uint8Array {
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

export type SendResult = 'sent' | 'dry-run'
export type SafeSend = (packet: Packet) => Promise<SendResult>

export function createSafeSend(options: {
  transport: Transport
  isDryRun: () => boolean
  log: Log
}): SafeSend {
  const { transport, isDryRun, log } = options

  return async (packet) => {
    const verdict = inspect(packet)

    if (!verdict.allowed) {
      log.add('blocked', verdict.reason, `${toHex([packet.reportId, ...packet.data.subarray(0, HEADER_LENGTH - 1)])} …`)
      throw new BlockedPacketError(verdict.reason)
    }
    const hex = compactHex(frameOf(packet))
    if (verdict.access === 'write' && isDryRun()) {
      log.add('dry', verdict.label, hex)
      return 'dry-run'
    }

    log.add('tx', verdict.label, hex)
    await transport.send(packet.type, packet.reportId, packet.data)
    return 'sent'
  }
}
