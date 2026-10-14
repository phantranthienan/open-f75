/**
 * Keyboard operations over the wired protocol, transport-agnostic.
 *
 * Every transfer goes through SafeSend. Nothing beyond the identity read is
 * sent until the board identifies as an F75. Changes are read-modify-write:
 * read the regions a plan needs, plan the bytes that change
 * (protocol/lighting.ts), write them back, then read them again and check the
 * bytes stuck.
 */
import { assessDevice, type Assessment, type IdentityState } from '@/device-check'
import { errorMessage, type Log } from '@/log'
import { toHex } from '@/protocol/bytes'
import { COLOR_NAMES } from '@/protocol/color-table'
import { modelName } from '@/protocol/ids'
import {
  describeChoice,
  planLighting,
  planPerKey,
  writtenRegions,
  type LightingChoice,
  type LightingPlan,
} from '@/protocol/lighting'
import type { KeyColors } from '@/protocol/per-key'
import { REGIONS, type Region } from '@/protocol/regions'
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

/** The regions the lighting lives in (protocol/regions.ts), as the board last returned them. */
export interface BoardState {
  settings: Uint8Array
  /** Null when the colour table could not be read; only firmware colours are possible then. */
  colorTable: Uint8Array | null
  /** Null when the per-key colours could not be read. */
  perKey: Uint8Array | null
}

/** What an operation read: always the settings page, plus what its plan needs. */
type Read = Pick<BoardState, 'settings'> & Partial<BoardState>

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
  errors: Partial<Record<Region, string>>
}

export type ApplyResult = SendResult | 'unchanged'

export interface Applied {
  result: ApplyResult
  plan: LightingPlan
  /** The board as this keyboard last read it, with what this operation read back. */
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

const RETRY_DELAY_MS = 70

/**
 * The pauses AULA's driver makes around a lighting change (ApplySetting,
 * FUN_0049c020), on top of the 20 ms before every transfer. WaitTm is 30 ms;
 * the F75's profile doesn't change it. With only the 20 ms, the owner's F75
 * sometimes went dark after a change that read back correctly.
 */
const WAIT_BEFORE_WRITE_MS: Record<Region, number> = {
  colorTable: 120, // Sleep(0x78) before SetLedRgbTab
  perKey: 30, // Sleep(WaitTm) before each colour group
  settings: 60, // Sleep(0x3c) before the settings page...
}
/** ...or, after another region: Sleep(WaitTm), a settings read, then Sleep(0x3c + 0x28). */
const WAIT_BEFORE_SETTINGS_AFTER_OTHER_MS = 30 + 100
/** After the last write: the driver leaves the board alone for 500 ms. */
const WAIT_BEFORE_READ_BACK_MS = 500
/** A region with more changed bytes than this logs one summary line instead of one per byte. */
const CHANGES_LISTED = 12
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const offset = (n: number) => `0x${n.toString(16).padStart(2, '0')}`

export class Keyboard {
  readonly device: DeviceInfo
  private identityState: IdentityState = { status: 'unread' }
  /** Everything this connection has read so far, so a partial read can return the whole board. */
  private board: BoardState | null = null
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
        this.identityState = { status: 'failed', error: errorMessage(err) }
        this.log.add('error', `Identity read failed: ${errorMessage(err)}`)
      }
      return this.identityState
    })
  }

  /** Every region the lighting lives in, for the UI to show what the board shows. Reads only. */
  readBoard(): Promise<BoardState> {
    return this.exclusive(async () =>
      this.remember({
        settings: await this.readRegion('settings'),
        colorTable: await this.readOptional('colorTable'),
        perKey: await this.readOptional('perKey'),
      }),
    )
  }

  /** An effect with its brightness, speed and colour, saved on the board. See planLighting. */
  applyLighting(choice: LightingChoice): Promise<Applied> {
    return this.exclusive(async () => {
      this.log.add('info', `${describeChoice(choice)}: reading settings page and colour table`)
      const before = { settings: await this.readRegion('settings'), colorTable: await this.readOptional('colorTable') }
      return this.apply(before, planLighting(before.settings, before.colorTable, choice))
    })
  }

  /** The per-key effect in these colours, saved on the board. See planPerKey. */
  applyPerKey(colors: KeyColors): Promise<Applied> {
    return this.exclusive(async () => {
      this.log.add('info', `Per-key colours, ${colors.size} key(s) lit: reading settings page and per-key colours`)
      const before = { settings: await this.readRegion('settings'), perKey: await this.readOptional('perKey') }
      return this.apply(before, planPerKey(before.settings, before.perKey, colors))
    })
  }

  /** Identity and every region as JSON-ready hex. Reads only; a failed read is noted, not fatal. */
  backup(): Promise<Backup> {
    return this.exclusive(async () => {
      this.requireF75()
      const backup: Backup = {
        format: 'open-f75-backup',
        version: 3,
        createdAt: new Date().toISOString(),
        device: this.device,
        identity: this.identityState.status === 'read' ? toHex(this.identityState.bytes, '') : null,
        settings: null,
        colorTable: null,
        perKey: null,
        errors: {},
      }
      for (const region of Object.keys(REGIONS) as Region[]) {
        const read = await this.tryRead(region)
        if ('bytes' in read) {
          backup[region] = toHex(read.bytes, '')
        } else {
          backup.errors[region] = read.error
          this.log.add('error', `${REGIONS[region].label} read failed: ${read.error}`)
        }
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

  private remember(read: Read): BoardState {
    this.board = { colorTable: null, perKey: null, ...this.board, ...read }
    return this.board
  }

  private async readRegion(region: Region): Promise<Uint8Array> {
    this.requireF75()
    const { read, length, check } = REGIONS[region]
    const bytes = await this.query(read, 0, length)
    check?.(bytes)
    return bytes
  }

  /** A region's bytes, or why the read failed. A refusal by the allowlist is never swallowed. */
  private async tryRead(region: Region): Promise<{ bytes: Uint8Array } | { error: string }> {
    try {
      return { bytes: await this.readRegion(region) }
    } catch (err) {
      if (err instanceof BlockedPacketError) throw err
      return { error: errorMessage(err) }
    }
  }

  /** For a region the app can work without: logs a failed read and returns null. */
  private async readOptional(region: 'colorTable' | 'perKey'): Promise<Uint8Array | null> {
    const read = await this.tryRead(region)
    if ('bytes' in read) return read.bytes
    this.log.add('info', `${REGIONS[region].label} unavailable (${read.error}); ${REGIONS[region].unreadable}`)
    return null
  }

  /** Logs the plan, writes it (unless nothing changes) and returns the board with what was read back. */
  private async apply(before: Read, plan: LightingPlan): Promise<Applied> {
    plan.warnings.forEach((w) => this.log.add('error', w))
    if (plan.changes.length === 0) {
      this.log.add('info', 'The board already shows this; nothing to write')
      return { result: 'unchanged', plan, board: this.remember(before) }
    }
    this.log.add('info', `Plan: ${describePlan(plan)}`)
    this.logChanges(plan)

    let result: SendResult = 'sent'
    for (const [i, w] of plan.writes.entries()) {
      const afterOther = i > 0 && w.region === 'settings'
      await sleep(afterOther ? WAIT_BEFORE_SETTINGS_AFTER_OTHER_MS : WAIT_BEFORE_WRITE_MS[w.region])
      result = await this.write(REGIONS[w.region].write, w.bytes)
    }
    if (result === 'dry-run') {
      this.log.add('info', `Dry run: ${plan.writes.length} write(s) logged, none sent`)
      return { result, plan, board: this.remember(before) }
    }
    await sleep(WAIT_BEFORE_READ_BACK_MS)
    const after = await this.verify(plan)
    this.log.add('info', 'Done: written and read back')
    return { result, plan, board: this.remember({ ...before, ...after }) }
  }

  /** In write order, one line per changed byte, or one summary line for a region with many (a whole per-key painting). */
  private logChanges({ writes, changes }: LightingPlan): void {
    for (const { region } of writes) {
      const mine = changes.filter((c) => c.region === region)
      const { label } = REGIONS[region]
      if (mine.length > CHANGES_LISTED) {
        this.log.add('info', `  ${label}: ${mine.length} bytes change, ${offset(mine[0].offset)}..${offset(mine.at(-1)!.offset)}`)
      } else {
        for (const c of mine) this.log.add('info', `  ${label} ${offset(c.offset)}: ${offset(c.from)} -> ${offset(c.to)}`)
      }
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
        this.log.add('info', `Attempt ${attempt} failed (${errorMessage(err)}); retrying`)
        await sleep(RETRY_DELAY_MS)
      }
    }
  }

  /** Reads the written regions back and checks every byte the plan changed now holds its new value. */
  private async verify(plan: LightingPlan): Promise<Partial<BoardState>> {
    const after: Partial<BoardState> = {}
    for (const w of plan.writes) after[w.region] = await this.readRegion(w.region)
    const missed = plan.changes.filter((c) => after[c.region]![c.offset] !== c.to)
    if (missed.length) {
      const list = missed.map((c) => `${REGIONS[c.region].label} ${offset(c.offset)} reads ${offset(after[c.region]![c.offset])}`)
      const notes = [...new Set(missed.map((c) => REGIONS[c.region].readBackNote).filter(Boolean))]
      throw new Error([`The board did not keep the write: ${list.join(', ')}.`, ...notes].join(' '))
    }
    return after
  }
}

/** The plan line in the log: how the colour is set, then the regions written. */
function describePlan(plan: LightingPlan): string {
  const regions = writtenRegions(plan)
  if (plan.colorPath === 'custom') {
    return `custom colour into slot 0 of the effect's colour-table row, then select slot 0 (as AULA's driver does); ${regions}`
  }
  if (plan.colorPath === 'firmware') {
    return `select colour slot ${plan.colorIndex} (${COLOR_NAMES[plan.colorIndex!]} by default); ${regions}`
  }
  return regions
}
