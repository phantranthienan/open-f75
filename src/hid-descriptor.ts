/**
 * Minimal HID report descriptor parser (USB HID 1.11, section 6.2.2): which
 * report IDs each top-level collection declares, and their sizes in bytes.
 * The mock uses it on the real F75 descriptor; a hidapi transport (Tauri)
 * will get raw descriptors and need the same thing.
 */
import type { CollectionInfo, ReportInfo } from '@/transport'

type Kind = 'input' | 'output' | 'feature'

const MAIN = { input: 0x8, output: 0x9, feature: 0xb, collection: 0xa, endCollection: 0xc } as const
const GLOBAL = { usagePage: 0x0, reportSize: 0x7, reportId: 0x8, reportCount: 0x9, push: 0xa, pop: 0xb } as const
const LOCAL_USAGE = 0x0

interface Globals {
  usagePage: number
  reportSize: number
  reportCount: number
  reportId: number
}

export function parseReportDescriptor(descriptor: ArrayLike<number>): CollectionInfo[] {
  const collections: CollectionInfo[] = []
  const bits = new Map<string, number>() // `${kind}:${id}` -> bits, for the open top-level collection
  let globals: Globals = { usagePage: 0, reportSize: 0, reportCount: 0, reportId: 0 }
  const stack: Globals[] = []
  let usages: number[] = []
  let depth = 0
  let current: CollectionInfo | null = null

  const close = (c: CollectionInfo) => {
    for (const [key, total] of bits) {
      const [kind, id] = key.split(':') as [Kind, string]
      c[kind].push({ id: Number(id), size: Math.ceil(total / 8) } satisfies ReportInfo)
    }
    bits.clear()
    collections.push(c)
  }

  for (let i = 0; i < descriptor.length; ) {
    const prefix = descriptor[i]
    if (prefix === 0xfe) {
      i += 3 + descriptor[i + 1] // long item: skipped, none of ours use them
      continue
    }
    const size = [0, 1, 2, 4][prefix & 0b11]
    const type = (prefix >> 2) & 0b11
    const tag = prefix >> 4
    let value = 0
    for (let b = 0; b < size; b++) value |= descriptor[i + 1 + b] << (8 * b)
    value >>>= 0
    i += 1 + size

    if (type === 1) {
      if (tag === GLOBAL.usagePage) globals.usagePage = value
      else if (tag === GLOBAL.reportSize) globals.reportSize = value
      else if (tag === GLOBAL.reportId) globals.reportId = value
      else if (tag === GLOBAL.reportCount) globals.reportCount = value
      else if (tag === GLOBAL.push) stack.push({ ...globals })
      else if (tag === GLOBAL.pop) globals = stack.pop() ?? globals
      continue
    }
    if (type === 2) {
      if (tag === LOCAL_USAGE) usages.push(value)
      continue
    }
    if (type !== 0) continue

    if (tag === MAIN.collection) {
      if (depth === 0) {
        current = { usagePage: globals.usagePage, usage: usages[0] ?? 0, input: [], output: [], feature: [] }
      }
      depth++
    } else if (tag === MAIN.endCollection) {
      depth--
      if (depth === 0 && current) {
        close(current)
        current = null
      }
    } else if (tag === MAIN.input || tag === MAIN.output || tag === MAIN.feature) {
      const kind: Kind = tag === MAIN.input ? 'input' : tag === MAIN.output ? 'output' : 'feature'
      const key = `${kind}:${globals.reportId}`
      bits.set(key, (bits.get(key) ?? 0) + globals.reportSize * globals.reportCount)
    }
    usages = [] // local items reset after every main item
  }
  return collections
}
