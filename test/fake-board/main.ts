/**
 * The real app against the fake F75 the tests use, for working on the UI
 * without the keyboard: `npm run dev:fake`. Dev server only; the production
 * build never includes it, and nothing here can reach real hardware, because
 * the fake replaces navigator.hid before the app starts.
 */
import { BOARD } from '@test/fixtures/f75'
import { installFakeHid } from '@test/fixtures/fake-hid'

installFakeHid({ ...BOARD, name: 'Fake F75 (no hardware)' })

// After the fake is in place: the app checks for navigator.hid as it starts.
await import('@/main')
