/**
 * WebHID transport (Chrome/Edge, v1). The only file that touches navigator.hid.
 */
import { assertAllowed } from '@/allowlist'
import { AULA_VENDOR_ID } from '@/protocol/ids'
import { REPORT_ID } from '@/protocol/wired'
import type {
  CollectionInfo,
  DeviceInfo,
  InputReport,
  ReportInfo,
  ReportType,
  Transport,
} from '@/transport'

const FILTERS: HIDDeviceFilter[] = [{ vendorId: AULA_VENDOR_ID }]

export function isWebHidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator
}

function reportSize(report: HIDReportInfo): number {
  const bits = (report.items ?? []).reduce((sum, item) => sum + (item.reportSize ?? 0) * (item.reportCount ?? 0), 0)
  return Math.ceil(bits / 8)
}

function toReports(reports: HIDReportInfo[] | undefined): ReportInfo[] {
  return (reports ?? []).map((r) => ({ id: r.reportId ?? 0, size: reportSize(r) }))
}

function toCollections(collections: HIDCollectionInfo[] | undefined): CollectionInfo[] {
  return (collections ?? []).flatMap((c) => [
    {
      usagePage: c.usagePage ?? 0,
      usage: c.usage ?? 0,
      input: toReports(c.inputReports),
      output: toReports(c.outputReports),
      feature: toReports(c.featureReports),
    },
    ...toCollections(c.children),
  ])
}

function describe(devices: HIDDevice[]): DeviceInfo {
  const [first] = devices
  return {
    name: first.productName || 'Unknown HID device',
    vendorId: first.vendorId,
    productId: first.productId,
    interfaces: devices.map((d) => ({ collections: toCollections(d.collections) })),
  }
}

function declares(device: HIDDevice, type: ReportType | 'input', reportId: number): boolean {
  const key = ({ input: 'inputReports', output: 'outputReports', feature: 'featureReports' } as const)[type]
  const walk = (cs: HIDCollectionInfo[] | undefined): boolean =>
    (cs ?? []).some((c) => (c[key] ?? []).some((r) => r.reportId === reportId) || walk(c.children))
  return walk(device.collections)
}

export class WebHidTransport implements Transport {
  readonly name = 'WebHID'
  private devices: HIDDevice[] = []
  private readonly inputListeners = new Set<(report: InputReport) => void>()
  private readonly disconnectListeners = new Set<() => void>()

  private readonly handleInput = (event: HIDInputReportEvent) => {
    const { buffer, byteOffset, byteLength } = event.data
    const report = { reportId: event.reportId, data: new Uint8Array(buffer.slice(byteOffset, byteOffset + byteLength)) }
    this.inputListeners.forEach((listener) => listener(report))
  }

  private readonly handleDisconnect = (event: HIDConnectionEvent) => {
    if (!this.devices.includes(event.device)) return
    void this.disconnect().finally(() => this.disconnectListeners.forEach((listener) => listener()))
  }

  async connect(): Promise<DeviceInfo> {
    const picked = await navigator.hid.requestDevice({ filters: FILTERS })
    if (picked.length === 0) throw new Error('No device selected')
    return this.open(picked)
  }

  async reconnect(): Promise<DeviceInfo | null> {
    const granted = (await navigator.hid.getDevices()).filter((d) => d.vendorId === AULA_VENDOR_ID)
    return granted.length ? this.open(granted) : null
  }

  async disconnect(): Promise<void> {
    navigator.hid.removeEventListener('disconnect', this.handleDisconnect)
    const devices = this.devices
    this.devices = []
    await Promise.allSettled(
      devices.map(async (d) => {
        d.removeEventListener('inputreport', this.handleInput)
        if (d.opened) await d.close()
      }),
    )
  }

  async send(type: ReportType, reportId: number, data: Uint8Array): Promise<void> {
    // Second check, right before the hardware: refuse anything off the allowlist
    // even if the guard in safe-send.ts was bypassed.
    assertAllowed({ type, reportId, data })
    const device = this.route(type, reportId)
    const body = Uint8Array.from(data)
    if (type === 'feature') await device.sendFeatureReport(reportId, body)
    else await device.sendReport(reportId, body)
  }

  async receiveFeature(reportId: number): Promise<Uint8Array> {
    if (reportId !== REPORT_ID) throw new Error(`Only feature report 0x06 may be read, not 0x${reportId.toString(16)}`)
    const view = await this.route('feature', reportId).receiveFeatureReport(reportId)
    // Some platforms include the report ID as the first byte; the backup keeps it as is.
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
  }

  onInput(listener: (report: InputReport) => void): () => void {
    this.inputListeners.add(listener)
    return () => this.inputListeners.delete(listener)
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener)
    return () => this.disconnectListeners.delete(listener)
  }

  onAvailable(listener: () => void): () => void {
    const handler = (event: HIDConnectionEvent) => {
      if (event.device.vendorId === AULA_VENDOR_ID) listener()
    }
    navigator.hid.addEventListener('connect', handler)
    return () => navigator.hid.removeEventListener('connect', handler)
  }

  /** Opens every interface of one physical device; browsers list each interface separately. */
  private async open(candidates: HIDDevice[]): Promise<DeviceInfo> {
    await this.disconnect()
    const [first] = candidates
    const sameBoard = candidates.filter(
      (d) => d.vendorId === first.vendorId && d.productId === first.productId && d.productName === first.productName,
    )

    const opened: HIDDevice[] = []
    for (const device of sameBoard) {
      try {
        if (!device.opened) await device.open()
        device.addEventListener('inputreport', this.handleInput)
        opened.push(device)
      } catch {
        // Chrome refuses interfaces that only carry protected usages (the keyboard itself).
      }
    }
    if (opened.length === 0) throw new Error('Could not open any interface of the selected device')

    this.devices = opened
    navigator.hid.addEventListener('disconnect', this.handleDisconnect)
    return describe(opened)
  }

  /** The interface that declares this report. Refuses reports the device never declared. */
  private route(type: ReportType | 'input', reportId: number): HIDDevice {
    const device = this.devices.find((d) => declares(d, type, reportId))
    if (!device) {
      throw new Error(`No open interface declares ${type} report 0x${reportId.toString(16).padStart(2, '0')}`)
    }
    return device
  }
}
