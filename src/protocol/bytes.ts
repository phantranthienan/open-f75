/** Byte and colour helpers. */

export type Rgb = readonly [r: number, g: number, b: number]

export function assertRgb(rgb: Rgb): void {
  if (rgb.length !== 3 || rgb.some((c) => !Number.isInteger(c) || c < 0 || c > 255)) {
    throw new RangeError(`not an RGB triple: ${JSON.stringify(rgb)}`)
  }
}

export function sameBytes(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function toHex(bytes: ArrayLike<number>, separator = ' '): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(separator)
}

export function parseHexColor(color: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim())
  if (!m) throw new Error(`not a #rrggbb colour: ${color}`)
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

export function formatHexColor([r, g, b]: Rgb): string {
  return `#${toHex([r, g, b], '')}`
}
