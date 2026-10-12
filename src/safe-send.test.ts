import { describe, expect, it, vi } from 'vitest'
import { createLog } from '@/log'
import { buildFrame } from '@/protocol/dongle'
import { Cmd, buildIdentityRequest, buildReadRequest, buildWrite } from '@/protocol/wired'
import { BlockedPacketError, createSafeSend, featurePacket, inspect, type Packet } from '@/safe-send'
import { F75_SETTINGS, F87_COLOR_TABLE } from '@/transports/mock-data'
import { MockTransport } from '@/transports/mock'

const settingsWrite = () => buildWrite(Cmd.SetSettings, 0, F75_SETTINGS)
const tableWrite = () => buildWrite(Cmd.SetColorTable, 0, F87_COLOR_TABLE)

describe('inspect', () => {
  it.each([
    ['identity read', buildIdentityRequest(), 'read'],
    ['settings read', buildReadRequest(Cmd.GetSettings, 0, 128), 'read'],
    ['colour table read', buildReadRequest(Cmd.GetColorTable, 0, 512), 'read'],
    ['settings write', settingsWrite(), 'write'],
    ['colour table write', tableWrite(), 'write'],
  ])('allows the %s', (label, frame, access) => {
    expect(inspect(featurePacket(frame))).toEqual({ allowed: true, access, label })
  })

  it.each([
    ['factory reset', buildWrite(0x11, 0, Uint8Array.of(1))],
    ['key matrix write', buildWrite(0x03, 0, new Uint8Array(512))],
    ['macro write', buildWrite(0x05, 0, new Uint8Array(16))],
    ['direct LED frame', buildWrite(0x08, 0, new Uint8Array(378))],
    ['battery read', buildReadRequest(0x87, 2, 2)],
    ['identity read with another parameter', buildReadRequest(Cmd.GetInfo, 0x02, 6)],
    ['settings read of another length', buildReadRequest(Cmd.GetSettings, 0, 64)],
    ['settings page without its end marker', buildWrite(Cmd.SetSettings, 0, new Uint8Array(128))],
    ['colour table without its marker', buildWrite(Cmd.SetColorTable, 0, new Uint8Array(512))],
  ])('refuses a %s', (_, frame) => {
    expect(inspect(featurePacket(frame))).toMatchObject({ allowed: false })
  })

  it('refuses a second package and non-zero padding', () => {
    const multi = settingsWrite()
    multi[4] = 2
    expect(inspect(featurePacket(multi))).toMatchObject({ allowed: false })
    const dirty = settingsWrite()
    dirty[400] = 1
    expect(inspect(featurePacket(dirty))).toEqual({ allowed: false, reason: 'settings write: padding is not zero' })
    const readWithPayload = buildIdentityRequest()
    readWithPayload[8] = 1
    expect(inspect(featurePacket(readWithPayload))).toMatchObject({ allowed: false })
  })

  it.each<[string, Packet]>([
    ['output reports (the dongle framing)', { type: 'output', reportId: 0x13, data: buildFrame(0x04, 0x0a, 0).slice(1) }],
    ['other feature report IDs', { type: 'feature', reportId: 0x05, data: new Uint8Array(519) }],
    ['wrong lengths', { type: 'feature', reportId: 0x06, data: new Uint8Array(63) }],
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

  it('logs the hex without padding, then sends', async () => {
    const { spy, log, send } = await setup(false)
    await expect(send(featurePacket(buildIdentityRequest()))).resolves.toBe('sent')
    expect(spy).toHaveBeenCalledOnce()
    expect(log.entries()).toMatchObject([{ kind: 'tx', text: 'identity read', hex: '06 82 01 00 01 00 06 00' }])
  })

  it('in dry run, logs writes without sending them', async () => {
    const { spy, log, send } = await setup(true)
    await expect(send(featurePacket(settingsWrite()))).resolves.toBe('dry-run')
    expect(spy).not.toHaveBeenCalled()
    const [entry] = log.entries()
    expect(entry).toMatchObject({ kind: 'dry', text: 'settings write' })
    expect(entry.hex?.split(' ')).toHaveLength(8 + 128)
  })

  it('in dry run, still sends reads', async () => {
    const { spy, send } = await setup(true)
    await expect(send(featurePacket(buildReadRequest(Cmd.GetSettings, 0, 128)))).resolves.toBe('sent')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('throws on a refused packet and never reaches the transport', async () => {
    const { spy, log, send } = await setup(false)
    await expect(send(featurePacket(buildWrite(0x11, 0, Uint8Array.of(1))))).rejects.toBeInstanceOf(BlockedPacketError)
    expect(spy).not.toHaveBeenCalled()
    expect(log.entries()).toMatchObject([{ kind: 'blocked' }])
  })
})
