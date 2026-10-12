# Working in this repo

- Commit and push directly to `main`.
- Import with `@/` (for `src/`) or `@test/` (for `test/`), never `./` or `../`. oxlint enforces it.
- Tests are end-to-end only (Playwright), in `test/<feature>/`. Don't add unit tests.
- Nothing may reach the keyboard except through the guard in `src/safe-send.ts`. Raw WebHID calls belong only in `src/transports/webhid.ts`; dev, build and lint fail otherwise. Don't add a command to `src/allowlist.ts` without a source for its bytes.
- Connecting is always explicit: no auto-connect or reconnect on page load, plug-in or reload.
- The owner uses macOS only, so Windows USB captures are not an option.
- Before pushing: `npm run lint`, `npm run build`, `npm test`.
