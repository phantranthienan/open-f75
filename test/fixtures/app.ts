import { test as base, expect, type Page } from '@playwright/test'
import { F75_SETTINGS, F87_COLOR_TABLE } from '@/transports/mock-data'
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

export const F75_IDENTITY = [0x03, 0x00, 0x00, 0x00, 0x00, 0xcd]
export const F87_IDENTITY = [0x03, 0x00, 0x00, 0x00, 0x00, 0x8f]

/** The real F75 settings dump (Fixed on, red) and the F87-derived colour table. */
export const BOARD: FakeBoard = {
  identity: F75_IDENTITY,
  settings: [...F75_SETTINGS],
  colorTable: [...F87_COLOR_TABLE],
  productId: 0x010c,
  granted: false,
  replyWithReportId: false,
  ignoreWrites: false,
}

/** Opens the app with a fake F75 behind navigator.hid. */
export async function openWithBoard(page: Page, board: Partial<FakeBoard> = {}) {
  await page.addInitScript(installFakeHid, { ...BOARD, ...board })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'open-f75' })).toBeVisible()
}

export async function connect(page: Page) {
  await page.getByRole('button', { name: 'Connect' }).click()
}

export async function connectF75(page: Page) {
  await connect(page)
  await expect(page.getByText('This is an F75.')).toBeVisible()
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
