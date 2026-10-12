/**
 * The allowlist guard. This is the only module allowed to call Transport.send;
 * src/guard.test.ts fails the build if anything else does.
 *
 * Safety rules it enforces (roadmap, "Safety rules"):
 *   - every write passes the allowlist; unknown report IDs or command bytes are refused
 *   - nothing that looks like firmware update, boot or DFU can get through, because
 *     only the four F87 config commands below are on the list
 *   - every packet is logged as hex before it goes out
 *   - dry run blocks every write; reads still go out so a dry run can show the
 *     exact frames it would have written for the board's real config
 */
import type { Log } from './log'
import { Cmd, FRAME_LENGTH, REPORT_ID, Sub, isValidFrame, toHex } from './protocol'
import type { ReportType, Transport } from './transport'

export interface Packet {
  type: ReportType
  reportId: number
  /** Excludes the report ID, like WebHID's sendReport. */
  data: Uint8Array
}

export type Access = 'read' | 'write'

export type Verdict =
  | { allowed: true; access: Access; label: string }
  | { allowed: false; reason: string }

interface Rule {
  name: string
  cmd: number
  sub: number
  frames: number
  access: Access
}

const RULES: readonly Rule[] = [
  { name: 'config read', cmd: Cmd.ReadConfig, sub: Sub.Confirm, frames: 1, access: 'read' },
  { name: 'config write', cmd: Cmd.WriteConfig, sub: Sub.Config, frames: 10, access: 'write' },
  { name: 'palette write', cmd: Cmd.WritePalette, sub: Sub.Palette, frames: 37, access: 'write' },
  { name: 'save', cmd: Cmd.Save, sub: Sub.Confirm, frames: 1, access: 'write' },
]

const hex8 = (n: number) => `0x${n.toString(16).padStart(2, '0')}`

export function packetFromFrame(frame: Uint8Array): Packet {
  return { type: 'output', reportId: frame[0], data: frame.slice(1) }
}

export function inspect(packet: Packet): Verdict {
  const refuse = (reason: string): Verdict => ({ allowed: false, reason })

  if (packet.type !== 'output') return refuse(`${packet.type} report writes are not on the allowlist`)
  if (packet.reportId !== REPORT_ID) return refuse(`report ID ${hex8(packet.reportId)} is not on the allowlist`)
  if (packet.data.length !== FRAME_LENGTH - 1) {
    return refuse(`expected ${FRAME_LENGTH - 1} data bytes, got ${packet.data.length}`)
  }

  const frame = new Uint8Array(FRAME_LENGTH)
  frame[0] = packet.reportId
  frame.set(packet.data, 1)
  if (!isValidFrame(frame)) return refuse('bad checksum')

  const [, cmd, sub, seq] = frame
  const rule = RULES.find((r) => r.cmd === cmd && r.sub === sub)
  if (!rule) return refuse(`command ${hex8(cmd)} / sub ${hex8(sub)} is not on the allowlist`)
  if (seq >= rule.frames) return refuse(`${rule.name} sequence ${seq} is out of range`)

  const label = rule.frames > 1 ? `${rule.name} ${seq + 1}/${rule.frames}` : rule.name
  return { allowed: true, access: rule.access, label }
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
    const hex = toHex([packet.reportId, ...packet.data])
    const verdict = inspect(packet)

    if (!verdict.allowed) {
      log.add('blocked', verdict.reason, hex)
      throw new BlockedPacketError(verdict.reason)
    }
    if (verdict.access === 'write' && isDryRun()) {
      log.add('dry', verdict.label, hex)
      return 'dry-run'
    }

    log.add('tx', verdict.label, hex)
    await transport.send(packet.type, packet.reportId, packet.data)
    return 'sent'
  }
}
