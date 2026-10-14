/**
 * The real app against the fake F75 the tests use, for working on the UI
 * without the keyboard: `npm run dev:fake`. Dev server only; the production
 * build never includes it, and nothing here can reach real hardware, because
 * the fake replaces navigator.hid before the app starts.
 */
import { F75_COLOR_TABLE, F75_IDENTITY, F75_SETTINGS } from '@test/fixtures/f75'
import { installFakeHid } from '@test/fixtures/fake-hid'

installFakeHid({
  name: 'Fake F75 (no hardware)',
  identity: F75_IDENTITY,
  settings: F75_SETTINGS,
  colorTable: F75_COLOR_TABLE,
  perKey: new Array(378).fill(0),
  productId: 0x010c,
  granted: false,
  replyFormat: 'short-with-id',
  ignoreWrites: false,
})

// After the fake is in place: the app checks for navigator.hid as it starts.
await import('@/main')
