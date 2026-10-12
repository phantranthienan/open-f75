/**
 * A fake board for developing without the keyboard. It speaks the F87 config
 * protocol from protocol.ts: answers config reads, echoes every frame, and
 * "saves" the colour so tests and the UI can check what a real board would show.
 */
import {
  Cmd,
  F75_WIRED_PRODUCT_ID,
  AULA_VENDOR_ID,
  REPORT_ID,
  Sub,
  checksum,
  fromHex,
  isValidFrame,
  type Rgb,
} from '../protocol'
import type { DeviceInfo, InputReport, ReportType, Transport } from '../transport'

/** The config an F87 returned in test/golden/f87-fixed-on-red.json (effect 0x0B). */
const CAPTURED_CONFIG = [
  '13440a000e000303020000040407000b200100b2',
  '13440a010e010000000100020100ff0200000076',
  '13440a020e010004010000000000000000000077',
  '13440a030e000000000000000000000000000072',
  '13440a040effff043704370437043704370437d3',
  '13440a050e043704370437043704370437043711',
  '13440a060e043704370437043704370437043712',
  '13440a070e074707470744074407440744074489',
  '13440a080e074407440404040404040404040435',
  '13440a09025aa50000ff000000ffffff00ff0066',
]

/**
 * Interface layout guessed from the F87 docs (vendor pages 0xFF00+, report 0x13)
 * and OpenAula (feature report 0x06 on page 0xFF00). Replace it with what the
 * Device card shows for your board once Phase 0 is done.
 */
export const MOCK_DEVICE: DeviceInfo = {
  name: 'Mock AULA F75',
  vendorId: AULA_VENDOR_ID,
  productId: F75_WIRED_PRODUCT_ID,
  interfaces: [
    {
      collections: [{ usagePage: 0xff00, usage: 0x01, input: [], output: [], feature: [{ id: 0x06, size: 519 }] }],
    },
    {
      collections: [
        { usagePage: 0xff02, usage: 0x02, input: [{ id: REPORT_ID, size: 19 }], output: [{ id: REPORT_ID, size: 19 }], feature: [] },
      ],
    },
  ],
}

export interface MockBoardState {
  /** Effect number in the saved config. */
  effect: number
  /** Custom colour slot of the saved palette. */
  color: Rgb
  saves: number
}

export interface MockOptions {
  device?: DeviceInfo
  /** Stop echoing after this many echoes, to test the abort path. */
  echoLimit?: number
}

export class MockTransport implements Transport {
  readonly name = 'Mock'
  private connected = false
  private echoes = 0
  private config = CAPTURED_CONFIG.map(fromHex)
  private pendingConfig = this.config.map((f) => f.slice())
  private palette: Uint8Array[] = []
  private saved: MockBoardState = { effect: this.config[0][15], color: [0, 0, 0], saves: 0 }
  private readonly inputListeners = new Set<(report: InputReport) => void>()
  private readonly disconnectListeners = new Set<() => void>()
  private readonly device: DeviceInfo
  private readonly echoLimit: number

  constructor(options: MockOptions = {}) {
    this.device = options.device ?? MOCK_DEVICE
    this.echoLimit = options.echoLimit ?? Infinity
  }

  /** What the board would show after a replug. */
  get state(): MockBoardState {
    return this.saved
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
    if (type !== 'output' || reportId !== REPORT_ID) throw new Error(`Mock does not handle ${type} report ${reportId}`)

    const frame = new Uint8Array(data.length + 1)
    frame[0] = reportId
    frame.set(data, 1)
    if (!isValidFrame(frame)) return // a real board would ignore it

    const [, cmd, sub, seq] = frame
    if (cmd === Cmd.ReadConfig && sub === Sub.Confirm) {
      this.config.forEach((f) => this.emit(f))
      return
    }
    if (cmd === Cmd.WriteConfig && sub === Sub.Config) {
      const stored = frame.slice()
      stored[1] = Cmd.ReadConfig
      stored[19] = checksum(stored)
      this.pendingConfig[seq] = stored
    } else if (cmd === Cmd.WritePalette && sub === Sub.Palette) {
      this.palette[seq] = frame.slice()
    } else if (cmd === Cmd.Save && sub === Sub.Confirm) {
      this.config = this.pendingConfig.map((f) => f.slice())
      const slot = this.palette[1]
      this.saved = {
        effect: this.config[0][15],
        color: slot ? [slot[12], slot[13], slot[14]] : this.saved.color,
        saves: this.saved.saves + 1,
      }
    } else {
      return
    }
    if (this.echoes++ < this.echoLimit) this.emit(frame)
  }

  async receiveFeature(reportId: number): Promise<Uint8Array> {
    const report = this.device.interfaces.flatMap((i) => i.collections.flatMap((c) => c.feature)).find((r) => r.id === reportId)
    if (!report) throw new Error(`Mock does not declare feature report ${reportId}`)
    return new Uint8Array(report.size)
  }

  onInput(listener: (report: InputReport) => void): () => void {
    this.inputListeners.add(listener)
    return () => this.inputListeners.delete(listener)
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener)
    return () => this.disconnectListeners.delete(listener)
  }

  private emit(frame: Uint8Array): void {
    const report = { reportId: frame[0], data: frame.slice(1) }
    setTimeout(() => this.inputListeners.forEach((l) => l(report)), 1)
  }
}
