/** HSV <-> RGB for the colour wheel. Hue in degrees, saturation and value 0..1. */
import type { Rgb } from '@/protocol/bytes'

export interface Hsv {
  h: number
  s: number
  v: number
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return [f(5), f(3), f(1)]
}

export function rgbToHsv([r, g, b]: Rgb): Hsv {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255]
  const max = Math.max(rr, gg, bb)
  const d = max - Math.min(rr, gg, bb)
  let h = 0
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d) % 6
    else if (max === gg) h = (bb - rr) / d + 2
    else h = (rr - gg) / d + 4
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max }
}
