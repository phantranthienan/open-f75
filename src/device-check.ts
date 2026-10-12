/**
 * The checks every send is gated on, also shown as a checklist in the UI.
 *
 * The first three come from the HID descriptor and allow exactly one command,
 * the identity read. Everything else needs the identity to say AULA F75:
 * the USB IDs are shared by other AULA models and other brands (protocol/ids.ts).
 */
import { AULA_VENDOR_ID, F75_IDENTITY, F75_WIRED_PRODUCT_ID, isF75, modelName } from '@/protocol/ids'
import { toHex } from '@/protocol/bytes'
import { DATA_LENGTH, REPORT_ID } from '@/protocol/wired'
import { formatId, type DeviceInfo } from '@/transport'

export type IdentityState =
  | { status: 'unread' }
  | { status: 'read'; bytes: Uint8Array }
  | { status: 'failed'; error: string }

export interface Check {
  label: string
  ok: boolean
  /** Not decided yet (identity not read). */
  pending?: boolean
  detail: string
}

export interface Assessment {
  checks: Check[]
  /** The descriptor checks pass: the identity read may be sent. */
  canIdentify: boolean
  /** Every check passes, including identity: the app may talk to the board. */
  canSend: boolean
}

const VENDOR_USAGE_PAGE = 0xff00

function identityCheck(identity: IdentityState): Check {
  const label = `Identity ${toHex(F75_IDENTITY)} (AULA F75)`
  switch (identity.status) {
    case 'unread':
      return { label, ok: false, pending: true, detail: 'Not read yet.' }
    case 'failed':
      return { label, ok: false, detail: `Read failed: ${identity.error}` }
    case 'read':
      return isF75(identity.bytes)
        ? { label, ok: true, detail: 'This is an F75.' }
        : {
            label,
            ok: false,
            detail: `Board reports ${toHex(identity.bytes)}: ${modelName(identity.bytes)}. Only the F75 is supported.`,
          }
  }
}

export function assessDevice(info: DeviceInfo, identity: IdentityState = { status: 'unread' }): Assessment {
  const collections = info.interfaces.flatMap((i) => i.collections)
  const channel = collections.find(
    (c) => c.usagePage >= VENDOR_USAGE_PAGE && c.feature.some((r) => r.id === REPORT_ID && r.size === DATA_LENGTH),
  )
  const declared = collections.flatMap((c) => c.feature).find((r) => r.id === REPORT_ID)

  const descriptorChecks: Check[] = [
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
      label: `Feature report ${formatId(REPORT_ID, 2)}, ${DATA_LENGTH} bytes, on a vendor collection`,
      ok: channel !== undefined,
      detail: channel
        ? `Usage page ${formatId(channel.usagePage)}, usage ${formatId(channel.usage)}: the command channel.`
        : declared
          ? `Declared with ${declared.size} bytes, or not on a vendor page.`
          : 'Not declared. Pick the other entry for this board in the browser prompt.',
    },
  ]
  const canIdentify = descriptorChecks.every((c) => c.ok)
  const checks = [...descriptorChecks, identityCheck(identity)]
  return { checks, canIdentify, canSend: checks.every((c) => c.ok) }
}
