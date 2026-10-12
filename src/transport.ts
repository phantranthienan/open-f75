/**
 * The seam between the protocol and the hardware. WebHID implements it today
 * (transports/webhid.ts); a Tauri + hidapi version can replace it later
 * without touching protocol/, safe-send.ts, keyboard.ts or the UI.
 */

export type ReportType = 'output' | 'feature'

/** A report the device declares. `size` is in bytes and excludes the report ID. */
export interface ReportInfo {
  id: number
  size: number
}

export interface CollectionInfo {
  usagePage: number
  usage: number
  input: ReportInfo[]
  output: ReportInfo[]
  feature: ReportInfo[]
}

/** One HID interface of the physical device. Browsers expose each one separately. */
export interface InterfaceInfo {
  collections: CollectionInfo[]
}

export interface DeviceInfo {
  name: string
  vendorId: number
  productId: number
  interfaces: InterfaceInfo[]
}

/** An input report as it arrived. `data` excludes the report ID. */
export interface InputReport {
  reportId: number
  data: Uint8Array
}

export interface Transport {
  readonly name: string

  /**
   * Opens a device, prompting the user to pick one. The only way the app opens
   * the board: there is no automatic reconnect. WebHID needs a click to call this.
   */
  connect(): Promise<DeviceInfo>

  disconnect(): Promise<void>

  /**
   * Raw write. `data` excludes the report ID.
   * Only safe-send.ts may call this; everything else goes through the allowlist guard.
   */
  send(type: ReportType, reportId: number, data: Uint8Array): Promise<void>

  /** GET_REPORT for a feature report. Read-only. */
  receiveFeature(reportId: number): Promise<Uint8Array>

  /** Subscribes to input reports. Returns the unsubscribe function. */
  onInput(listener: (report: InputReport) => void): () => void

  /** Fires when the open device goes away (unplugged, mode switch, sleep). */
  onDisconnect(listener: () => void): () => void
}

export function declaresReport(info: DeviceInfo, type: ReportType | 'input', reportId: number): boolean {
  return info.interfaces.some((iface) =>
    iface.collections.some((c) => c[type].some((r) => r.id === reportId)),
  )
}

export function formatId(id: number, digits = 4): string {
  return `0x${id.toString(16).toUpperCase().padStart(digits, '0')}`
}
