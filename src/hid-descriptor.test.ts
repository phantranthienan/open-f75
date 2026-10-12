import { describe, expect, it } from 'vitest'
import { parseReportDescriptor } from '@/hid-descriptor'
import { F75_INTERFACE1_DESCRIPTOR } from '@/transports/mock-data'

describe('parseReportDescriptor (real F75 interface 1)', () => {
  const collections = parseReportDescriptor(F75_INTERFACE1_DESCRIPTOR)

  it('finds the six top-level collections', () => {
    expect(collections.map((c) => [c.usagePage, c.usage])).toEqual([
      [0x0001, 0x80], // system control
      [0x000c, 0x01], // consumer control (volume knob)
      [0xff00, 0x01],
      [0x0001, 0x06], // keyboard (n-key rollover bitmap)
      [0xff00, 0x01],
      [0xff00, 0x01],
    ])
  })

  it('sizes every report', () => {
    expect(collections.map((c) => ({ input: c.input, output: c.output, feature: c.feature }))).toEqual([
      { input: [{ id: 1, size: 1 }], output: [], feature: [] },
      { input: [{ id: 2, size: 2 }], output: [], feature: [] },
      { input: [{ id: 3, size: 3 }], output: [], feature: [] },
      { input: [{ id: 4, size: 15 }], output: [], feature: [] },
      { input: [], output: [], feature: [{ id: 5, size: 5 }] },
      { input: [{ id: 6, size: 7 }], output: [], feature: [{ id: 6, size: 519 }] },
    ])
  })

  it('declares no report 0x13, so the dongle protocol cannot apply over the cable', () => {
    const ids = collections.flatMap((c) => [...c.input, ...c.output, ...c.feature].map((r) => r.id))
    expect(ids).not.toContain(0x13)
  })
})
