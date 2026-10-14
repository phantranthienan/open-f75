/**
 * Keyboard operations over the wired protocol, transport-agnostic.
 *
 * Every transfer goes through SafeSend. Nothing beyond the identity read is
 * sent until the board identifies as an F75. Changes are read-modify-write:
 * read the regions, plan the bytes that change (protocol/lighting.ts), write
 * them back, then read them again and check the bytes stuck.
 */
import { assessDevice, type Assessment, type IdentityState } from '@/device-check'
import type { Log } from '@/log'
import { formatHexColor, toHex } from '@/protocol/bytes'
import { COLOR_NAMES, COLOR_TABLE_LENGTH } from '@/protocol/color-table'
import { modelName } from '@/protocol/ids'
import { planLighting, planPerKey, type LightingChoice, type LightingPlan, type Region } from '@/protocol/lighting'
import { PER_KEY_LENGTH, type KeyColors } from '@/protocol/per-key'
import { SETTINGS_LENGTH, assertSettingsPage } from '@/protocol/settings'
import {
  Cmd,
  HEADER_LENGTH,
  IDENTITY_LENGTH,
  INFO_IDENTITY,
  REPORT_ID,
  TRANSFER_DELAY_MS,
  buildIdentityRequest,
  buildReadRequest,
  buildWrite,
  parseReply,
} from '@/protocol/wired'
import { BlockedPacketError, featurePacket } from '@/allowlist'
import type { SafeSend, SendResult } from '@/safe-send'
import { formatId, type DeviceInfo, type Transport } from '@/transport'

/** The regions the lighting lives in, as the board last returned them. */
export interface BoardState {
  settings: Uint8Array
  /** Null when the colour table could not be read; only firmware colours are possible then. */
  colorTable: Uint8Array | null
  /** Null when the per-key colours could not be read. */
  perKey: Uint8Array | null
}

export interface Backup {
  format: 'open-f75-backup'
  version: 3
  createdAt: string
  device: DeviceInfo
  /** Hex, or null when that read failed (see `errors`). */
  identity: string | null
  settings: string | null
  colorTable: string | null
  perKey: string | null
  errors: Partial<Record<'settings' | 'colorTable' | 'perKey', string>>
}

export type ApplyResult = SendResult | 'unchanged'

export interface Applied {
  result: ApplyResult
  plan: LightingPlan
  /** The board as read back, or as read before a dry run or a no-op. */
  board: BoardState
}

export interface KeyboardOptions {
  transport: Transport
  send: SafeSend
  log: Log
  device: DeviceInfo
  /** Pause before every transfer; AULA's driver uses 20 ms. */
  delayMs?: number
  /** Attempts per transfer when the transport throws. */
  attempts?: number
}

export class BusyError extends Error {
  constructor() {
    super('Another operation is still running')
    this.name = 'BusyError'
  }
}

/** Where each region lives on the board. */
const REGIONS: Record<Region, { read: number; write: number; length: number }> = {
  settings: { read: Cmd.GetSettings, write: Cmd.SetSettings, length: SETTINGS_LENGTH },
  'colour table': { read: Cmd.GetColorTable, write: Cmd.SetColorTable, length: COLOR_TABLE_LENGTH },
  'per-key colours': { read: Cmd.GetPerKey, write: Cmd.SetPerKey, length: PER_KEY_LENGTH },
}

const RETRY_DELAY_MS = 70
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const offset = (n: number) => `0x${n.toString(16).padStart(2, '0')}`

export class Keyboard {
  readonly device: DeviceInfo
  private identityState: IdentityState = { status: 'unread' }
  private readonly transport: Transport
  private readonly send: SafeSend
  private readonly log: Log
  private readonly delayMs: number
  private readonly attempts: number
  private readonly stopLogging: () => void
  private busy = false

  constructor(options: KeyboardOptions) {
    this.transport = options.transport
    this.send = options.send
    this.log = options.log
    this.device = options.device
    this.delayMs = options.delayMs ?? TRANSFER_DELAY_MS
    this.attempts = options.attempts ?? 3
    this.stopLogging = this.transport.onInput(({ reportId, data }) => {
      this.log.add('rx', `input report ${formatId(reportId, 2)}`, toHex([reportId, ...data]))
    })
  }

  get identity(): IdentityState {
    return this.identityState
  }

  get assessment(): Assessment {
    return assessDevice(this.device, this.identityState)
  }

  dispose(): void {
    this.stopLogging()
  }

  /** The only command sent before the board is known to be an F75. */
  identify(): Promise<IdentityState> {
    return this.exclusive(async () => {
      if (!this.assessment.canIdentify) throw new Error('This device failed the descriptor checks, so nothing is sent to it')
      try {
        const bytes = await this.query(Cmd.GetInfo, INFO_IDENTITY, IDENTITY_LENGTH, buildIdentityRequest())
        this.identityState = { status: 'read', bytes }
        this.log.add('info', `Identity ${toHex(bytes)}: ${modelName(bytes)}`)
      } catch (err) {
        if (err instanceof BlockedPacketError) throw err
        this.identityState = { status: 'failed', error: message(err) }
        this.log.add('error', `Identity read failed: ${message(err)}`)
      }
      return this.identityState
    })
  }

  /** Everything the lighting lives in, for the UI to show what the board shows. Reads only. */
  readBoard(): Promise<BoardState> {
    return this.exclusive(() => this.readBoardUnlocked())
  }

  /** An effect with its brightness, speed and colour, saved on the board. See planLighting. */
  applyLighting(choice: LightingChoice): Promise<Applied> {
    return this.exclusive(async () => {
      this.log.add('info', `${describeChoice(choice)}: reading the board`)
      const before = await this.readBoardUnlocked()
      return this.apply(before, planLighting(before.settings, before.colorTable, choice))
    })
  }

  /** The per-key effect in these colours, saved on the board. See planPerKey. */
  applyPerKey(colors: KeyColors): Promise<Applied> {
    return this.exclusive(async () => {
      this.log.add('info', `Per-key colours, ${colors.size} key(s) lit: reading the board`)
      const before = await this.readBoardUnlocked()
      return this.apply(before, planPerKey(before.settings, before.perKey, colors))
    })
  }

  /** Identity and every region as JSON-ready hex. Reads only; a failed read is noted, not fatal. */
  backup(): Promise<Backup> {
    return this.exclusive(async () => {
      this.requireF75()
      const errors: Backup['errors'] = {}
      const hexOf = async (region: Region, key: keyof Backup['errors']) => {
        try {
          return toHex(await this.readRegion(region), '')
        } catch (err) {
          if (err instanceof BlockedPacketError) throw err
          errors[key] = message(err)
          this.log.add('error', `${region} read failed: ${message(err)}`)
          return null
        }
      }
      return {
        format: 'open-f75-backup',
        version: 3,
        createdAt: new Date().toISOString(),
        device: this.device,
        identity: this.identityState.status === 'read' ? toHex(this.identityState.bytes, '') : null,
        settings: await hexOf('settings', 'settings'),
        colorTable: await hexOf('colour table', 'colorTable'),
        perKey: await hexOf('per-key colours', 'perKey'),
        errors,
      }
    })
  }

  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (this.busy) throw new BusyError()
    this.busy = true
    try {
      return await run()
    } finally {
      this.busy = false
    }
  }

  private requireF75(): void {
    if (!this.assessment.canSend) {
      throw new Error('The board has not identified as an AULA F75, so only the identity read is allowed')
    }
  }

  private async readRegion(region: Region): Promise<Uint8Array> {
    this.requireF75()
    const { read, length } = REGIONS[region]
    const bytes = await this.query(read, 0, length)
    // A failed settings read looks like a page without its end marker [ASL].
    if (region === 'settings') assertSettingsPage(bytes)
    return bytes
  }

  /** For a region the app can work without: logs a failed read and returns null. */
  private async readOptional(region: Region, consequence: string): Promise<Uint8Array | null> {
    try {
      return await this.readRegion(region)
    } catch (err) {
      if (err instanceof BlockedPacketError) throw err
      this.log.add('info', `${region} unavailable (${message(err)}); ${consequence}`)
      return null
    }
  }

  private async readBoardUnlocked(): Promise<BoardState> {
    return {
      settings: await this.readRegion('settings'),
      colorTable: await this.readOptional('colour table', 'only firmware colours are possible'),
      perKey: await this.readOptional('per-key colours', 'the key painter starts blank'),
    }
  }

  /** Logs the plan, writes it (unless nothing changes) and returns the board as read back. */
  private async apply(before: BoardState, plan: LightingPlan): Promise<Applied> {
    plan.warnings.forEach((w) => this.log.add('error', w))
    if (plan.changes.length === 0) {
      this.log.add('info', 'The board already shows this; nothing to write')
      return { result: 'unchanged', plan, board: before }
    }
    this.log.add('info', `Plan: ${describePlan(plan)}`)
    for (const c of plan.changes) {
      this.log.add('info', `  ${c.region} ${offset(c.offset)}: ${offset(c.from)} -> ${offset(c.to)}`)
    }

    let result: SendResult = 'sent'
    for (const w of plan.writes) result = await this.write(REGIONS[w.region].write, w.bytes)
    if (result === 'dry-run') {
      this.log.add('info', `Dry run: ${plan.writes.length} write(s) logged, none sent`)
      return { result, plan, board: before }
    }
    const after = await this.verify(plan)
    this.log.add('info', 'Done: written and read back')
    return {
      result,
      plan,
      board: {
        settings: after.get('settings') ?? before.settings,
        colorTable: after.get('colour table') ?? before.colorTable,
        perKey: after.get('per-key colours') ?? before.perKey,
      },
    }
  }

  /** SET_FEATURE with the request header, then GET_FEATURE for the reply. */
  private async query(cmd: number, param: number, length: number, request = buildReadRequest(cmd, param, length)) {
    await this.transfer(request)
    await sleep(this.delayMs)
    const raw = await this.transport.receiveFeature(REPORT_ID)
    // Logged before parsing, so a reply that fails to parse still shows its bytes.
    // Only as much as can matter is shown: an optional report ID, the header and the data.
    this.log.add('rx', `reply to ${offset(cmd)} (${raw.length} bytes)`, toHex(raw.subarray(0, HEADER_LENGTH + length)))
    return parseReply(raw, cmd, length)
  }

  private write(cmd: number, data: Uint8Array): Promise<SendResult> {
    this.requireF75()
    return this.transfer(buildWrite(cmd, 0, data))
  }

  /** One SET_FEATURE through the guard, retried like AULA's driver does. */
  private async transfer(frame: Uint8Array): Promise<SendResult> {
    for (let attempt = 1; ; attempt++) {
      await sleep(this.delayMs)
      try {
        return await this.send(featurePacket(frame))
      } catch (err) {
        if (err instanceof BlockedPacketError || attempt >= this.attempts) throw err
        this.log.add('info', `Attempt ${attempt} failed (${message(err)}); retrying`)
        await sleep(RETRY_DELAY_MS)
      }
    }
  }

  /** Reads the written regions back and checks every byte the plan changed now holds its new value. */
  private async verify(plan: LightingPlan): Promise<Map<Region, Uint8Array>> {
    const after = new Map<Region, Uint8Array>()
    for (const w of plan.writes) after.set(w.region, await this.readRegion(w.region))
    const missed = plan.changes.filter((c) => after.get(c.region)![c.offset] !== c.to)
    if (missed.length) {
      const list = missed.map((c) => `${c.region} ${offset(c.offset)} reads ${offset(after.get(c.region)![c.offset])}`)
      const perKey = missed.some((c) => c.region === 'per-key colours')
      throw new Error(
        `The board did not keep the write: ${list.join(', ')}` +
          (perKey ? ". The per-key read-back layout isn't confirmed yet; check what the keys show." : ''),
      )
    }
    return after
  }
}

function describeChoice({ effect, color }: LightingChoice): string {
  if (!effect.color && !effect.colorful) return effect.name
  return `${effect.name}, ${typeof color === 'string' ? color : formatHexColor(color)}`
}

function describePlan(plan: LightingPlan): string {
  const regions = plan.writes.map((w) => w.region).join(' + ')
  switch (plan.colorPath) {
    case 'custom':
      return `custom colour into slot 0 of the effect's colour-table row, then select slot 0 (as AULA's driver does); ${regions}`
    case 'firmware':
      return `select colour slot ${plan.colorIndex} (${COLOR_NAMES[plan.colorIndex!]} by default); ${regions} only`
    default:
      return `${regions} only`
  }
}
