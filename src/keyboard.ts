/**
 * Keyboard operations, transport-agnostic. Every write goes through SafeSend,
 * every write waits for its echo, and the first missing echo aborts the rest.
 */
import { assessDevice } from './device-check'
import type { Log } from './log'
import {
  CONFIG_FRAME_COUNT,
  assertConfig,
  assertRgb,
  buildReadConfigRequest,
  buildStaticColorFrames,
  formatHexColor,
  isConfigResponse,
  toHex,
  type Rgb,
} from './protocol'
import { inspect, packetFromFrame, type SafeSend, type SendResult } from './safe-send'
import { formatId, type DeviceInfo, type InputReport, type Transport } from './transport'

export interface Backup {
  format: 'open-f75-backup'
  version: 1
  createdAt: string
  device: DeviceInfo
  /** The 10 config frames as hex, or null if the read failed. */
  config: string[] | null
  configError?: string
  /** GET_REPORT result per declared feature report ID, as hex. */
  featureReports: Record<string, string | { error: string }>
}

export interface KeyboardOptions {
  transport: Transport
  send: SafeSend
  log: Log
  device: DeviceInfo
  readTimeoutMs?: number
  echoTimeoutMs?: number
}

export class BusyError extends Error {
  constructor() {
    super('Another operation is still running')
    this.name = 'BusyError'
  }
}

function joinReport({ reportId, data }: InputReport): Uint8Array {
  const frame = new Uint8Array(data.length + 1)
  frame[0] = reportId
  frame.set(data, 1)
  return frame
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function describeInput(frame: Uint8Array): string {
  if (isConfigResponse(frame)) return `config ${frame[3] + 1}/${CONFIG_FRAME_COUNT}`
  const verdict = inspect(packetFromFrame(frame))
  return verdict.allowed ? `echo: ${verdict.label}` : `input report ${formatId(frame[0], 2)}`
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: () => string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message())), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export class Keyboard {
  readonly device: DeviceInfo
  readonly canSend: boolean
  private readonly transport: Transport
  private readonly send: SafeSend
  private readonly log: Log
  private readonly readTimeoutMs: number
  private readonly echoTimeoutMs: number
  private readonly stopLogging: () => void
  private busy = false

  constructor(options: KeyboardOptions) {
    this.transport = options.transport
    this.send = options.send
    this.log = options.log
    this.device = options.device
    this.readTimeoutMs = options.readTimeoutMs ?? 1500
    this.echoTimeoutMs = options.echoTimeoutMs ?? 500
    this.canSend = assessDevice(this.device).canSend
    this.stopLogging = this.transport.onInput((report) => {
      const frame = joinReport(report)
      this.log.add('rx', describeInput(frame), toHex(frame))
    })
  }

  dispose(): void {
    this.stopLogging()
  }

  /** Step 1: ask for the config and collect the 10 frames that come back. */
  readConfig(): Promise<Uint8Array[]> {
    return this.exclusive(() => this.readConfigUnlocked())
  }

  /** Fixed custom colour, saved to the board so it survives a replug. */
  setStaticColor(rgb: Rgb): Promise<SendResult> {
    assertRgb(rgb)
    return this.exclusive(async () => {
      this.log.add('info', `Static colour ${formatHexColor(rgb)}: reading config first`)
      const config = await this.readConfigUnlocked()
      const frames = buildStaticColorFrames(config, rgb)

      let result: SendResult = 'sent'
      for (const frame of frames) result = await this.write(frame)

      this.log.add(
        'info',
        result === 'dry-run'
          ? `Dry run: ${frames.length} frames logged, none sent`
          : `Done: ${frames.length} frames written and echoed`,
      )
      return result
    })
  }

  /** Config read plus a GET_REPORT of every declared feature report, for a JSON backup. */
  backup(): Promise<Backup> {
    return this.exclusive(async () => {
      this.requireSendable()
      const backup: Backup = {
        format: 'open-f75-backup',
        version: 1,
        createdAt: new Date().toISOString(),
        device: this.device,
        config: null,
        featureReports: {},
      }

      try {
        backup.config = (await this.readConfigUnlocked()).map((f) => toHex(f, ''))
      } catch (err) {
        backup.configError = err instanceof Error ? err.message : String(err)
        this.log.add('error', `Config read failed: ${backup.configError}`)
      }

      const featureIds = new Set(
        this.device.interfaces.flatMap((i) => i.collections.flatMap((c) => c.feature.map((r) => r.id))),
      )
      for (const id of featureIds) {
        const key = formatId(id, 2)
        try {
          const data = await this.transport.receiveFeature(id)
          backup.featureReports[key] = toHex(data, '')
          this.log.add('rx', `feature ${key} (GET_REPORT)`, toHex(data))
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          backup.featureReports[key] = { error }
          this.log.add('error', `GET_REPORT ${key} failed: ${error}`)
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

  private requireSendable(): void {
    if (!this.canSend) throw new Error('This device failed the recon checks, so nothing is sent to it')
  }

  private async readConfigUnlocked(): Promise<Uint8Array[]> {
    this.requireSendable()
    const frames = new Array<Uint8Array | undefined>(CONFIG_FRAME_COUNT).fill(undefined)
    const received = () => frames.filter(Boolean).length
    let complete!: () => void
    const done = new Promise<void>((resolve) => (complete = resolve))

    const stop = this.transport.onInput((report) => {
      const frame = joinReport(report)
      if (!isConfigResponse(frame)) return
      frames[frame[3]] = frame
      if (received() === CONFIG_FRAME_COUNT) complete()
    })
    try {
      await this.send(packetFromFrame(buildReadConfigRequest()))
      await withTimeout(done, this.readTimeoutMs, () => `config read timed out with ${received()}/${CONFIG_FRAME_COUNT} frames`)
    } finally {
      stop()
    }

    const config = frames as Uint8Array[]
    assertConfig(config)
    return config
  }

  private async write(frame: Uint8Array): Promise<SendResult> {
    this.requireSendable()
    const expected = frame.subarray(1)
    let echoed!: () => void
    const echo = new Promise<void>((resolve) => (echoed = resolve))

    const stop = this.transport.onInput(({ reportId, data }) => {
      if (reportId === frame[0] && sameBytes(data, expected)) echoed()
    })
    try {
      const result = await this.send(packetFromFrame(frame))
      if (result === 'dry-run') return result
      await withTimeout(echo, this.echoTimeoutMs, () => `no echo within ${this.echoTimeoutMs} ms for ${toHex(frame)}; stopped here`)
      return result
    } finally {
      stop()
    }
  }
}
