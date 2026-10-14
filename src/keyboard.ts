/**
 * Keyboard operations over the wired protocol, transport-agnostic.
 *
 * Every transfer goes through SafeSend. Nothing beyond the identity read is
 * sent until the board identifies as an F75. Changes are read-modify-write:
 * read the region, patch the bytes that need changing, write it back, then
 * read it again and check the bytes stuck.
 */
import { assessDevice, type Assessment, type IdentityState } from '@/device-check'
import type { Log } from '@/log'
import { formatHexColor, toHex } from '@/protocol/bytes'
import { COLOR_NAMES, COLOR_TABLE_LENGTH } from '@/protocol/color-table'
import { modelName } from '@/protocol/ids'
import { planLighting, type LightingChoice, type LightingPlan, type Region } from '@/protocol/lighting'
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

export interface Backup {
  format: 'open-f75-backup'
  version: 2
  createdAt: string
  device: DeviceInfo
  /** Hex, or null when that read failed (see `errors`). */
  identity: string | null
  settings: string | null
  colorTable: string | null
  errors: Partial<Record<'settings' | 'colorTable', string>>
}

export type ApplyResult = SendResult | 'unchanged'

/** The regions the lighting lives in, as the board last returned them. */
export interface BoardState {
  settings: Uint8Array
  /** Null when the colour table could not be read; only firmware colours are possible then. */
  colorTable: Uint8Array | null
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

const RETRY_DELAY_MS = 70
/** The write command for each region a plan can change. */
const WRITE_COMMAND: Record<Region, number> = { settings: Cmd.SetSettings, 'colour table': Cmd.SetColorTable }
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

  /** The settings page and the colour table, for the UI to show what the board shows. Reads only. */
  readBoard(): Promise<BoardState> {
    return this.exclusive(() => this.readBoardUnlocked())
  }

  /**
   * An effect with its brightness, speed and colour, saved on the board. See
   * planLighting. Returns the board as read back, or as read before a dry run.
   */
  applyLighting(choice: LightingChoice): Promise<{ result: ApplyResult; plan: LightingPlan; board: BoardState }> {
    return this.exclusive(async () => {
      this.log.add('info', `${describeChoice(choice)}: reading settings and colour table`)
      const before = await this.readBoardUnlocked()
      const plan = planLighting(before.settings, before.colorTable, choice)
      plan.warnings.forEach((w) => this.log.add('error', w))
      if (plan.changes.length === 0) {
        this.log.add('info', 'The board already shows this; nothing to write')
        return { result: 'unchanged', plan, board: before }
      }
      this.log.add('info', `Plan: ${describePlan(plan)}`)
      for (const c of plan.changes) {
        this.log.add('info', `  ${c.region} ${offset(c.offset)}: ${offset(c.from)} -> ${offset(c.to)}`)
      }
      const { result, readBack } = await this.commit(plan)
      return {
        result,
        plan,
        board: {
          settings: readBack.get('settings') ?? before.settings,
          colorTable: readBack.get('colour table') ?? before.colorTable,
        },
      }
    })
  }

  /** Identity, settings page and colour table as JSON-ready hex. Reads only. */
  backup(): Promise<Backup> {
    return this.exclusive(async () => {
      this.requireF75()
      const backup: Backup = {
        format: 'open-f75-backup',
        version: 2,
        createdAt: new Date().toISOString(),
        device: this.device,
        identity: this.identityState.status === 'read' ? toHex(this.identityState.bytes, '') : null,
        settings: null,
        colorTable: null,
        errors: {},
      }
      try {
        backup.settings = toHex(await this.readSettingsUnlocked(), '')
      } catch (err) {
        if (err instanceof BlockedPacketError) throw err
        backup.errors.settings = message(err)
        this.log.add('error', `Settings read failed: ${message(err)}`)
      }
      try {
        backup.colorTable = toHex(await this.readColorTableUnlocked(), '')
      } catch (err) {
        if (err instanceof BlockedPacketError) throw err
        backup.errors.colorTable = message(err)
        this.log.add('error', `Colour table read failed: ${message(err)}`)
      }
      return backup
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

  private async readSettingsUnlocked(): Promise<Uint8Array> {
    this.requireF75()
    const page = await this.query(Cmd.GetSettings, 0, SETTINGS_LENGTH)
    assertSettingsPage(page)
    return page
  }

  private async readColorTableUnlocked(): Promise<Uint8Array> {
    this.requireF75()
    return this.query(Cmd.GetColorTable, 0, COLOR_TABLE_LENGTH)
  }

  private async readBoardUnlocked(): Promise<BoardState> {
    const settings = await this.readSettingsUnlocked()
    let colorTable: Uint8Array | null = null
    try {
      colorTable = await this.readColorTableUnlocked()
    } catch (err) {
      if (err instanceof BlockedPacketError) throw err
      this.log.add('info', `Colour table unavailable (${message(err)}); only firmware colours are possible`)
    }
    return { settings, colorTable }
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

  private readRegion(region: Region): Promise<Uint8Array> {
    return region === 'settings' ? this.readSettingsUnlocked() : this.readColorTableUnlocked()
  }

  /** Writes the plan's regions in order, then reads them back (unless this is a dry run). */
  private async commit(plan: LightingPlan): Promise<{ result: SendResult; readBack: Map<Region, Uint8Array> }> {
    let result: SendResult = 'sent'
    for (const w of plan.writes) result = await this.write(WRITE_COMMAND[w.region], w.bytes)
    if (result === 'dry-run') {
      this.log.add('info', `Dry run: ${plan.writes.length} write(s) logged, none sent`)
      return { result, readBack: new Map() }
    }
    const readBack = await this.verify(plan)
    this.log.add('info', 'Done: written and read back')
    return { result, readBack }
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
      throw new Error(`The board did not keep the write: ${list.join(', ')}`)
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
