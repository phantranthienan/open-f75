/**
 * USB IDs and model identities.
 *
 * The USB IDs do not tell AULA models apart: the F75, F87, F99, H108 and boards
 * from other brands (LEOBOG Hi75C Pro, Redragon K686) all enumerate as
 * 258A:010C. OpenRGB disabled several Sinowealth keyboard detectors after
 * reused IDs bricked Redragon boards. The 6-byte identity read
 * (wired.ts, GET_INFO) is what names the model.
 *
 * Sources:
 *   [ASL]  references/AulaSofwareLinux/README.md "Supported keyboards", verified on an F75
 *   [KBINI] AULA's own F75 profile, references/AulaSofwareLinux/assets/devices/f75-fr/device.ini (Psd=3,0,0,0,0,cd)
 *   [ORGB] references/OpenRGB/Controllers/SinowealthController/SinowealthKeyboard10cController
 *          (model byte 0xCD = "AULA F75")
 */
import { sameBytes, toHex } from '@/protocol/bytes'

export const AULA_VENDOR_ID = 0x258a
export const F75_WIRED_PRODUCT_ID = 0x010c
/** The 2.4 GHz receiver (Compx) [KBINI VID_Wireless/PID_Wireless]. */
export const DONGLE_VENDOR_ID = 0x3554
export const DONGLE_PRODUCT_ID = 0xfa09

export const F75_IDENTITY: readonly number[] = [0x03, 0x00, 0x00, 0x00, 0x00, 0xcd]

/** Identity strings of the same firmware family [ASL]. Only the F75 is written to. */
const MODELS: readonly { name: string; identity: readonly number[] }[] = [
  { name: 'AULA F75', identity: F75_IDENTITY },
  { name: 'AULA F87', identity: [0x03, 0, 0, 0, 0x00, 0x8f] },
  { name: 'AULA F87 PRO', identity: [0x03, 0, 0, 0, 0x01, 0x0b] },
  { name: 'AULA F87 PRO Wired', identity: [0x03, 0, 0, 0, 0x00, 0xa9] },
  { name: 'AULA F99', identity: [0x03, 0, 0, 0, 0x00, 0xa4] },
  { name: 'AULA F99 Pro', identity: [0x03, 0, 0, 0, 0x01, 0x58] },
  { name: 'AULA F99 Wired', identity: [0x03, 0, 0, 0, 0x00, 0x9a] },
  { name: 'AULA H108', identity: [0x03, 0, 0, 0, 0x03, 0x7c] },
]

export function modelName(identity: ArrayLike<number>): string {
  return MODELS.find((m) => sameBytes(m.identity, identity))?.name ?? `unknown model (${toHex(identity)})`
}

export function isF75(identity: ArrayLike<number> | null | undefined): boolean {
  return identity != null && sameBytes(identity, F75_IDENTITY)
}
