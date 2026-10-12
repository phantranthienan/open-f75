/**
 * Phase 0 recon checks. A device must pass all of them before the app sends it
 * anything, and the result doubles as a checklist in the UI.
 */
import { AULA_VENDOR_ID, F75_WIRED_PRODUCT_ID, FRAME_LENGTH, REPORT_ID } from './protocol'
import { formatId, type DeviceInfo, type ReportInfo } from './transport'

export interface Check {
  label: string
  ok: boolean
  detail: string
}

export interface Assessment {
  checks: Check[]
  canSend: boolean
}

const VENDOR_USAGE_PAGE = 0xff00

function findReport(info: DeviceInfo, type: 'input' | 'output', id: number): ReportInfo | undefined {
  for (const iface of info.interfaces) {
    for (const c of iface.collections) {
      const report = c[type].find((r) => r.id === id)
      if (report) return report
    }
  }
}

export function assessDevice(info: DeviceInfo): Assessment {
  const frameData = FRAME_LENGTH - 1
  const output = findReport(info, 'output', REPORT_ID)
  const input = findReport(info, 'input', REPORT_ID)
  const vendorPages = info.interfaces
    .flatMap((i) => i.collections)
    .filter((c) => c.usagePage >= VENDOR_USAGE_PAGE)
    .map((c) => formatId(c.usagePage))

  const checks: Check[] = [
    {
      label: `Vendor ID ${formatId(AULA_VENDOR_ID)}`,
      ok: info.vendorId === AULA_VENDOR_ID,
      detail: `Device reports ${formatId(info.vendorId)}.`,
    },
    {
      label: `Product ID ${formatId(F75_WIRED_PRODUCT_ID)} (wired)`,
      ok: info.productId === F75_WIRED_PRODUCT_ID,
      detail:
        info.productId === F75_WIRED_PRODUCT_ID
          ? 'Wired mode.'
          : `Device reports ${formatId(info.productId)}. Wireless, another model, or bootloader: send nothing, unplug, wait, replug in wired mode.`,
    },
    {
      label: 'Vendor-defined collection',
      ok: vendorPages.length > 0,
      detail: vendorPages.length ? `Usage page ${[...new Set(vendorPages)].join(', ')}.` : 'None found; this is not the control interface.',
    },
    {
      label: `Output report ${formatId(REPORT_ID, 2)}, ${frameData} bytes`,
      ok: output?.size === frameData,
      detail: output ? `Declared with ${output.size} bytes.` : 'Not declared. The F87 config protocol needs it.',
    },
    {
      label: `Input report ${formatId(REPORT_ID, 2)}, ${frameData} bytes`,
      ok: input?.size === frameData,
      detail: input ? `Declared with ${input.size} bytes.` : 'Not declared. Echoes and config reads arrive on it.',
    },
  ]

  return { checks, canSend: checks.every((c) => c.ok) }
}
