import { describe, expect, it, vi } from 'vitest'
import { createLog } from './log'
import { buildFrame, buildReadConfigRequest, buildSave, buildStaticColorFrames, fromHex } from './protocol'
import { BlockedPacketError, createSafeSend, inspect, packetFromFrame, type Packet } from './safe-send'
import { MockTransport } from './transports/mock'
import red from '../test/golden/f87-fixed-on-red.json'

const config = red.frames.filter((f) => f.dir === 'rx' && f.hex.startsWith('13440a')).map((f) => fromHex(f.hex))

describe('inspect', () => {
  it('allows every frame of the static-colour sequence', () => {
    for (const frame of [buildReadConfigRequest(), ...buildStaticColorFrames(config, [1, 2, 3])]) {
      expect(inspect(packetFromFrame(frame))).toMatchObject({ allowed: true })
    }
  })

  it('classes the config read as a read and everything else as a write', () => {
    expect(inspect(packetFromFrame(buildReadConfigRequest()))).toMatchObject({ access: 'read' })
    expect(inspect(packetFromFrame(buildSave()))).toMatchObject({ access: 'write' })
  })

  it.each([
    ['per-key map (not implemented yet)', buildFrame(0x02, 0x1c, 0)],
    ['audio stream', buildFrame(0x88, 0x01, 0)],
    ['unknown command', buildFrame(0x7f, 0x00, 0)],
    ['known command, wrong sub-command', buildFrame(0x04, 0x01, 0)],
    ['config write past frame 9', buildFrame(0x04, 0x0a, 10)],
    ['palette write past frame 36', buildFrame(0x09, 0x25, 37)],
  ])('refuses %s', (_, frame) => {
    expect(inspect(packetFromFrame(frame))).toMatchObject({ allowed: false })
  })

  it('refuses a bad checksum', () => {
    const frame = buildSave()
    frame[19] ^= 1
    expect(inspect(packetFromFrame(frame))).toEqual({ allowed: false, reason: 'bad checksum' })
  })

  it.each<[string, Packet]>([
    ['feature reports', { type: 'feature', reportId: 0x06, data: new Uint8Array(519) }],
    ['other report IDs', { type: 'output', reportId: 0x06, data: new Uint8Array(19) }],
    ['wrong lengths', { type: 'output', reportId: 0x13, data: new Uint8Array(63) }],
  ])('refuses %s', (_, packet) => {
    expect(inspect(packet)).toMatchObject({ allowed: false })
  })
})

describe('createSafeSend', () => {
  async function setup(dryRun: boolean) {
    const transport = new MockTransport()
    await transport.connect()
    const spy = vi.spyOn(transport, 'send')
    const log = createLog()
    const send = createSafeSend({ transport, log, isDryRun: () => dryRun })
    return { spy, log, send }
  }

  it('logs the hex, then sends', async () => {
    const { spy, log, send } = await setup(false)
    await expect(send(packetFromFrame(buildSave()))).resolves.toBe('sent')
    expect(spy).toHaveBeenCalledOnce()
    expect(log.entries()).toMatchObject([{ kind: 'tx', text: 'save', hex: '13 0a 01 00 04 07 00 00 00 00 00 00 00 00 00 00 00 00 00 29' }])
  })

  it('in dry run, logs writes without sending them', async () => {
    const { spy, log, send } = await setup(true)
    await expect(send(packetFromFrame(buildSave()))).resolves.toBe('dry-run')
    expect(spy).not.toHaveBeenCalled()
    expect(log.entries()).toMatchObject([{ kind: 'dry', text: 'save' }])
  })

  it('in dry run, still sends reads', async () => {
    const { spy, send } = await setup(true)
    await expect(send(packetFromFrame(buildReadConfigRequest()))).resolves.toBe('sent')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('throws on a refused packet and never reaches the transport', async () => {
    const { spy, log, send } = await setup(false)
    await expect(send(packetFromFrame(buildFrame(0x02, 0x1c, 0)))).rejects.toBeInstanceOf(BlockedPacketError)
    expect(spy).not.toHaveBeenCalled()
    expect(log.entries()).toMatchObject([{ kind: 'blocked' }])
  })
})
