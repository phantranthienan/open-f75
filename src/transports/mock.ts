/**
 * A fake board for developing without the keyboard. It speaks the wired
 * protocol from protocol/wired.ts: answers identity, settings and colour table
 * reads, and keeps what is written, so tests and the UI can check what a real
 * board would show after a replug.
 */
import { parseReportDescriptor } from '@/hid-descriptor'
import { AULA_VENDOR_ID, F75_IDENTITY, F75_WIRED_PRODUCT_ID } from '@/protocol/ids'
import { describeBoard, type BoardState } from '@/protocol/settings'
import { Cmd, DATA_LENGTH, HEADER_LENGTH, INFO_IDENTITY, REPORT_ID, REPORT_LENGTH, parseHeader } from '@/protocol/wired'
import type { DeviceInfo, InputReport, ReportType, Transport } from '@/transport'
import { F75_INTERFACE1_DESCRIPTOR, F75_SETTINGS, F87_COLOR_TABLE } from '@/transports/mock-data'

/** Interface 1 of a real F75. Interface 0, the boot keyboard, is left out: browsers hide it. */
export const MOCK_DEVICE: DeviceInfo = {
  name: 'Mock AULA F75',
  vendorId: AULA_VENDOR_ID,
  productId: F75_WIRED_PRODUCT_ID,
  interfaces: [{ collections: parseReportDescriptor(F75_INTERFACE1_DESCRIPTOR) }],
}

export interface MockOptions {
  device?: DeviceInfo
  identity?: readonly number[]
  settings?: Uint8Array
  colorTable?: Uint8Array
  /** Return 520-byte replies that start with the report ID, as some platforms do. */
  replyWithReportId?: boolean
  /** Accept writes but keep the old bytes, like a board that ignores them. */
  ignoreWrites?: boolean
}

export interface MockState {
  identity: Uint8Array
  settings: Uint8Array
  colorTable: Uint8Array
  writes: number
  board: BoardState
}

export class MockTransport implements Transport {
  readonly name = 'Mock'
  private connected = false
  private reply: Uint8Array | null = null
  private writes = 0
  private readonly identity: Uint8Array
  private settings: Uint8Array
  private colorTable: Uint8Array
  private readonly options: MockOptions
  private readonly device: DeviceInfo
  private readonly inputListeners = new Set<(report: InputReport) => void>()
  private readonly disconnectListeners = new Set<() => void>()

  constructor(options: MockOptions = {}) {
    this.options = options
    this.device = options.device ?? MOCK_DEVICE
    this.identity = Uint8Array.from(options.identity ?? F75_IDENTITY)
    this.settings = Uint8Array.from(options.settings ?? F75_SETTINGS)
    this.colorTable = Uint8Array.from(options.colorTable ?? F87_COLOR_TABLE)
  }

  /** What the board holds, and would show after a replug. */
  get state(): MockState {
    return {
      identity: this.identity.slice(),
      settings: this.settings.slice(),
      colorTable: this.colorTable.slice(),
      writes: this.writes,
      board: describeBoard(this.settings, this.colorTable),
    }
  }

  async connect(): Promise<DeviceInfo> {
    this.connected = true
    return this.device
  }

  async reconnect(): Promise<DeviceInfo | null> {
    return null
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  /** Simulates pulling the cable. */
  unplug(): void {
    this.connected = false
    this.disconnectListeners.forEach((l) => l())
  }

  async send(type: ReportType, reportId: number, data: Uint8Array): Promise<void> {
    if (!this.connected) throw new Error('Mock device is not connected')
    if (type !== 'feature' || reportId !== REPORT_ID || data.length !== DATA_LENGTH) {
      throw new Error(`Mock does not handle ${type} report ${reportId} with ${data.length} bytes`)
    }
    const frame = new Uint8Array(REPORT_LENGTH)
    frame[0] = reportId
    frame.set(data, 1)
    const header = parseHeader(frame)
    const payload = frame.slice(HEADER_LENGTH, HEADER_LENGTH + header.length)

    this.reply = null
    switch (header.cmd) {
      case Cmd.GetInfo:
        if (header.param === INFO_IDENTITY) this.stageReply(frame, this.identity)
        break
      case Cmd.GetSettings:
        this.stageReply(frame, this.settings)
        break
      case Cmd.GetColorTable:
        this.stageReply(frame, this.colorTable.subarray(0, header.length))
        break
      case Cmd.SetSettings:
        this.writes++
        if (!this.options.ignoreWrites) this.settings = payload
        break
      case Cmd.SetColorTable:
        this.writes++
        if (!this.options.ignoreWrites) this.colorTable = payload
        break
      default:
      // a real board would ignore it; the guard never lets one through
    }
  }

  async receiveFeature(reportId: number): Promise<Uint8Array> {
    if (!this.connected) throw new Error('Mock device is not connected')
    if (reportId !== REPORT_ID) return new Uint8Array(5)
    const reply = this.reply ?? new Uint8Array(REPORT_LENGTH)
    return this.options.replyWithReportId ? reply.slice() : reply.slice(1)
  }

  onInput(listener: (report: InputReport) => void): () => void {
    this.inputListeners.add(listener)
    return () => this.inputListeners.delete(listener)
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener)
    return () => this.disconnectListeners.delete(listener)
  }

  /** The reply repeats the request header and carries the data from byte 8. */
  private stageReply(request: Uint8Array, data: Uint8Array): void {
    const reply = new Uint8Array(REPORT_LENGTH)
    reply.set(request.subarray(0, HEADER_LENGTH))
    reply.set(data, HEADER_LENGTH)
    this.reply = reply
  }
}
