/**
 * The allowlist guard. This is the only module allowed to call Transport.send;
 * the build refuses any other caller (scripts/raw-sends.mjs).
 *
 * Every packet is checked against the allowlist (allowlist.ts) and logged as
 * hex before it goes out. Dry run blocks every write; reads still go out so a
 * dry run can show the exact bytes it would have written for the board's real
 * settings. The transports check the allowlist again before the hardware call.
 */
import { BlockedPacketError, frameOf, inspect, type Packet } from '@/allowlist'
import type { Log } from '@/log'
import { toHex } from '@/protocol/bytes'
import { HEADER_LENGTH, compactHex } from '@/protocol/wired'
import type { Transport } from '@/transport'

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
