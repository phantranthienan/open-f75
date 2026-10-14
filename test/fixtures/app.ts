import { test as base, expect, type Page } from '@playwright/test'
import { BOARD } from '@test/fixtures/f75'
import { installFakeHid, type FakeBoard, type SentReport } from '@test/fixtures/fake-hid'

/** Every test fails if the page logs an error or throws. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      page.on('pageerror', (e) => errors.push(e.message))
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }
export { BLANK_PER_KEY, BOARD } from '@test/fixtures/f75'

export const F87_IDENTITY = [0x03, 0x00, 0x00, 0x00, 0x00, 0x8f]

/** Opens the app with a fake F75 behind navigator.hid. */
export async function openWithBoard(page: Page, board: Partial<FakeBoard> = {}) {
  await page.addInitScript(installFakeHid, { ...BOARD, ...board })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'open-f75' })).toBeVisible()
}

export async function connect(page: Page) {
  await page.getByRole('button', { name: 'Connect' }).click()
}

/** Connects, and waits until the board has identified and its lighting has been read. */
export async function connectF75(page: Page) {
  await connect(page)
  await expect(page.getByText('This is an F75.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Read board' })).toBeEnabled()
}

/**
 * The reads each operation starts with. Connecting, Read board and a backup
 * read every region; an apply reads only the regions its plan can write.
 */
export const READ = {
  board: [0x84, 0x8a, 0x86],
  lighting: [0x84, 0x8a],
  perKey: [0x84, 0x86],
} as const
/** The commands connectF75 sends: identity, then the board read. */
export const CONNECT_COMMANDS = [0x82, ...READ.board]

export async function selectEffect(page: Page, name: string) {
  await page.getByLabel('Effect').selectOption({ label: name })
}

/** Every report the app sent to the fake board, in order. */
export function sent(page: Page): Promise<SentReport[]> {
  return page.evaluate(() => window.__fakeHid.sent)
}

/** The command byte of each feature report sent, e.g. [0x82, 0x84]. */
export async function commands(page: Page): Promise<number[]> {
  return (await sent(page)).map((r) => r.data[0])
}

export function boardState(page: Page) {
  return page.evaluate(() => window.__fakeHid.state())
}

/** The write commands the app sends: settings page, colour table, per-key colours. */
export const WRITE = { settings: 0x04, colorTable: 0x0a, perKey: 0x06 } as const

/** A frame's payload: the data after the 7 header bytes (the report ID is not in `data`). */
export const payloadOf = (data: number[], length: number) => data.slice(7, 7 + length)

/** The payload of the first write with this command, or null when there was none. */
export async function writtenPayload(page: Page, cmd: number, length: number): Promise<number[] | null> {
  const write = (await sent(page)).find((r) => r.data[0] === cmd)
  return write ? payloadOf(write.data, length) : null
}

/** A key on the keys pane's map, by its name in AULA's profile ('Esc', 'Q', 'Space'...). */
export function keyOnMap(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: `) })
}

/** The keys pane's button, labelled "Dry run key colours" or "Send key colours". */
export async function sendKeyColors(page: Page) {
  await page.getByRole('button', { name: /^(Dry run|Send) key colours$/ }).click()
}

/** Offsets where two byte arrays differ. */
export function changedOffsets(before: number[], after: number[]): number[] {
  return before.flatMap((b, i) => (after[i] === b ? [] : [i]))
}

export async function setDryRun(page: Page, on: boolean) {
  const toggle = page.getByRole('switch', { name: 'Dry run' })
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click()
}

export async function pickColor(page: Page, hex: string) {
  await page.getByLabel('Hex').fill(hex)
}

/** Clicks the colour card's button, labelled "Dry run" or "Send to keyboard". */
export async function sendColor(page: Page) {
  await page.getByRole('button', { name: /^(Dry run|Send to keyboard)$/ }).click()
}
