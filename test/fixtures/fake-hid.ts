/**
 * A fake AULA F75 installed as navigator.hid, so tests run the app's real
 * WebHID transport and can check every byte that crosses the HID boundary.
 *
 * It answers the wired protocol (0x06 feature reports): identity, settings
 * page and colour table reads, and keeps what is written. The collections are
 * what Chrome on macOS showed for the owner's real F75 (Device card JSON):
 * one interface, with the keyboard and system-control collections hidden by
 * the browser, and a mouse whose pointer child carries input report 0x07.
 */

export interface SentReport {
  type: 'output' | 'feature'
  reportId: number
  /** Without the report ID, as WebHID passes it. */
  data: number[]
}

/**
 * How GET_FEATURE results reach the page. Chrome on macOS returned 14 bytes for
 * the identity reply on the real F75: report ID, header and data, no padding.
 */
export type ReplyFormat = 'short-with-id' | 'short' | 'full' | 'full-with-id'

export interface FakeBoard {
  /** Null: the board never answers the identity read. */
  identity: number[] | null
  settings: number[]
  colorTable: number[]
  productId: number
  /** Already granted in an earlier visit, so navigator.hid.getDevices() returns it. */
  granted: boolean
  replyFormat: ReplyFormat
  /** Accept writes but keep the old bytes. */
  ignoreWrites: boolean
}

export interface FakeHidHandle {
  sent: SentReport[]
  state(): { settings: number[]; colorTable: number[] }
  unplug(): void
  /** Fires navigator.hid's "connect" event for the board, as Chrome does on plug-in. */
  announce(): void
}

declare global {
  interface Window {
    __fakeHid: FakeHidHandle
  }
}

/** Runs in the page (page.addInitScript), so it must not use anything from outside. */
export function installFakeHid(board: FakeBoard): void {
  const report = (reportId: number, items: [size: number, count: number][]) => ({
    reportId,
    items: items.map(([reportSize, reportCount]) => ({ reportSize, reportCount })),
  })
  type Reports = { input?: unknown[]; feature?: unknown[]; children?: unknown[] }
  const collection = (usagePage: number, usage: number, reports: Reports = {}) => ({
    usagePage,
    usage,
    type: 1,
    children: reports.children ?? [],
    inputReports: reports.input ?? [],
    outputReports: [],
    featureReports: reports.feature ?? [],
  })
  const collections = [
    collection(0x000c, 0x01, { input: [report(2, [[16, 1]])] }),
    collection(0xff00, 0x01, { input: [report(3, [[8, 3]])] }),
    collection(0xff00, 0x01, { feature: [report(5, [[8, 5]])] }),
    collection(0xff00, 0x01, { input: [report(6, [[8, 7]])], feature: [report(6, [[8, 519]])] }),
    collection(0x0001, 0x02, { children: [collection(0x0001, 0x01, { input: [report(7, [[8, 7]])] })] }),
  ]

  const sent: SentReport[] = []
  let settings = [...board.settings]
  let colorTable = [...board.colorTable]
  let reply: number[] | null = null
  const bytesOf = (data: BufferSource) =>
    Array.from(ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data))

  class FakeDevice extends EventTarget {
    opened = false
    readonly vendorId = 0x258a
    readonly productId = board.productId
    readonly productName = 'Gaming Keyboard'
    readonly collections = collections
    async open() {
      this.opened = true
    }
    async close() {
      this.opened = false
    }
    async sendReport(reportId: number, data: BufferSource) {
      sent.push({ type: 'output', reportId, data: bytesOf(data) })
    }
    async sendFeatureReport(reportId: number, data: BufferSource) {
      const bytes = bytesOf(data)
      sent.push({ type: 'feature', reportId, data: bytes })
      if (!this.opened || reportId !== 0x06 || bytes.length !== 519) throw new DOMException('Failed to write the feature report.', 'NotAllowedError')
      const header = [reportId, ...bytes.slice(0, 7)]
      const length = bytes[5] | (bytes[6] << 8)
      const payload = bytes.slice(7, 7 + length)
      const stage = (data: number[]) => {
        reply = [...header, ...data] // what the board sends: header + data, report ID first
      }
      reply = null
      switch (bytes[0]) {
        case 0x82:
          if (bytes[1] === 0x01 && board.identity) stage(board.identity)
          break
        case 0x84:
          stage(settings)
          break
        case 0x8a:
          stage(colorTable.slice(0, length))
          break
        case 0x04:
          if (!board.ignoreWrites) settings = payload
          break
        case 0x0a:
          if (!board.ignoreWrites) colorTable = payload
          break
      }
    }
    async receiveFeatureReport(reportId: number) {
      const short = reportId === 0x06 && reply ? reply : [reportId]
      const full = [...short, ...new Array(520 - short.length).fill(0)]
      const bytes = { 'short-with-id': short, short: short.slice(1), full: full.slice(1), 'full-with-id': full }[
        board.replyFormat
      ]
      return new DataView(Uint8Array.from(bytes).buffer)
    }
  }

  const device = new FakeDevice()
  const hid = Object.assign(new EventTarget(), {
    requestDevice: async () => [device],
    getDevices: async () => (board.granted ? [device] : []),
  })
  Object.defineProperty(navigator, 'hid', { value: hid, configurable: true })

  window.__fakeHid = {
    sent,
    state: () => ({ settings: [...settings], colorTable: [...colorTable] }),
    unplug: () => {
      device.opened = false
      hid.dispatchEvent(Object.assign(new Event('disconnect'), { device }))
    },
    announce: () => {
      hid.dispatchEvent(Object.assign(new Event('connect'), { device }))
    },
  }
}
