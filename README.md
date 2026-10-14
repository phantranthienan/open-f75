# open-f75

A web page that sets the lighting on an AULA F75 keyboard over the USB cable, made for macOS. It is a WebHID app (Vite, React, TypeScript, Tailwind, shadcn/ui) and runs in desktop Chrome or Edge. Later it will also ship as a Tauri menu-bar app that reuses everything except one file, the transport.

What it does today:

- connects over the cable, checks the device and reads its identity, so it only ever talks to an F75
- reads the board's lighting, so the controls start from what the board shows
- sets any of the 18 built-in effects (or off) with its brightness, speed and colour, saved on the board. A colour is one of the seven firmware colours, any colour through the colour table, or "colourful".
- paints each key its own colour on a map of the F75 (click, or drag across keys), saved on the board as the per-key effect
- saves what the lighting and keys panes hold as named profiles in the browser, with JSON export and import
- backs up the board's settings page, colour table and per-key colours as JSON
- shows every frame as hex in a packet log. Dry run is on whenever the page loads.

The desktop app is not built yet. No F75 effect has a direction setting.

## Contents

1. [Run it](#run-it)
2. [First session with the board](#first-session-with-the-board)
3. [How it fits together](#how-it-fits-together)
4. [One colour change, frame by frame](#one-colour-change-frame-by-frame)
5. [The protocol](#the-protocol)
6. [Safety](#safety)
7. [Where to read](#where-to-read)
8. [File map](#file-map)
9. [The screen](#the-screen)
10. [Tests](#tests)
11. [Tooling and conventions](#tooling-and-conventions)
12. [Troubleshooting](#troubleshooting)
13. [Glossary](#glossary)
14. [Sources and references](#sources-and-references)

## Run it

You need Node 20.19+ or 22.12+ (what Vite asks for) and desktop Chrome or Edge.

```sh
npm install
npm run dev        # http://localhost:5173, open it in Chrome or Edge
npm run dev:fake   # the same app against a fake F75, for UI work without the keyboard
npm test           # end-to-end tests (Playwright); starts the dev server itself
npm run build      # typecheck + production build into dist/
npm run lint       # oxlint + the raw-send rule
npm run typecheck  # TypeScript only
```

WebHID only exists in Chromium browsers, and only on `https` or `localhost`. Safari and Firefox don't have it.

`npm run dev:fake` opens `/test/fake-board/`: the real app, with the fake F75 from the tests in place of `navigator.hid`. It holds the owner's settings and colour table and keeps what you write, until you reload. Nothing on that page can reach a real keyboard, and the production build doesn't include it.

The reference projects are git submodules. You only need them to read the sources the code cites: `git submodule update --init` (OpenRGB is a shallow clone, about 60 MB).

## First session with the board

1. Plug the F75 in by cable and switch it to wired mode. Before you start, know the hardware factory reset: hold `Fn+Esc`.
2. Open the app and press **Connect**, then pick the board in Chrome's prompt. The app never connects on its own, so you do this after every page load. It opens every interface the browser grants. If the checks then say feature report `0x06` is missing, connect again and pick the board's other entry.
3. The **device** pane runs the checks: vendor ID, wired product ID, and feature report `0x06` with 519 bytes on a vendor collection. If all three pass, the app sends exactly one command, the identity read, and expects `03 00 00 00 00 cd` (AULA F75). Other models share the USB IDs, so nothing else is sent until this check passes.
4. **Copy JSON** on the device pane and keep it. It is the record of what your board exposes.
5. **Back up config** downloads the identity, the 128-byte settings page, the 512-byte colour table and the 378 bytes of per-key colours. Do this before the first write.
6. The **lighting** pane already shows what the board shows: right after the identity check the app reads the settings page and the colour table (reads only). Pick a colour on the wheel (or type one) and press **Dry run**. The app reads the board again, then logs the bytes it would change and the frames it would write, without sending them.
7. Turn dry run off in the top bar and send green (`#00ff00`). On a board like the owner's it changes one settings byte, the best-proven path. Then unplug and replug to check that it stays.
8. Only then try a custom colour, which also writes the colour table (see [the two paths](#setting-a-colour-the-two-paths)), and replug again. Then other effects, brightness and speed, and last the per-key painter: its commands come from AULA's decompiled driver and haven't been tried on a board yet. Change one thing at a time.

## How it fits together

The code has layers. Each one only talks to the one below it.

```
 src/ui/                    React: the panes, buttons and log you see
   │   session.applyLighting(choice), session.backup(), session.connect()
   ▼
 src/ui/hooks/use-session.ts
   │   builds the stack below on Connect, owns dry run, holds the packet log
   ▼
 src/keyboard.ts            Keyboard: identify, backup, apply lighting, read back
   │   asks src/protocol/ to build frames and to plan changes (pure functions)
   ▼
 src/safe-send.ts           the guard: allowlist check, dry run, hex log
   │   the only caller of transport.send
   ▼
 src/transport.ts           the Transport interface
 src/transports/webhid.ts   its WebHID version: checks the allowlist again, then calls navigator.hid
   │
   ▼
 the F75, feature report 0x06
```

Five ideas explain most of the code:

1. **The protocol is separate from the transport.** Everything in `src/protocol/` is a pure function: bytes in, bytes out, no I/O. Only `src/transports/webhid.ts` touches the hardware. The Tauri app will add a Rust transport behind the same `Transport` interface, and nothing above it changes.
2. **One guard for every write.** Every frame sent goes through `createSafeSend` in `src/safe-send.ts`. It checks the frame against the allowlist (`src/allowlist.ts`), logs it as hex and, in dry run, holds back writes. Reads still go out in dry run, so a dry run shows what would change on your real board.
3. **Identity first.** The USB IDs `258A:010C` are shared by several AULA models and boards from other brands. `src/device-check.ts` decides what may be sent: before identification only the identity read, and after it everything else, but only if the board says it is an F75.
4. **Read, modify, write, read back.** A change never writes bytes from scratch. The app reads the region from the board, changes only the bytes it needs, writes the result back and reads it again to check every changed byte stuck.
5. **Nothing happens on its own.** No auto-connect, no reconnect, nothing sent until you click.

Reads take two steps. A read request is a frame like any other, so it goes through the guard and the log. The reply comes back through `transport.receiveFeature`, which is read-only and refuses any report but `0x06`.

## One colour change, frame by frame

This is the packet log for one custom colour, `#ff6600`, in dry run. It was taken against the test board, which holds the owner's real settings and colour table and replies the way Chrome on macOS did. The hex is each frame without its zero padding.

On **Connect**:

```
INFO  Connected via WebHID: Gaming Keyboard (0x258A:0x010C)
TX    identity read                    06 82 01 00 01 00 06 00
RX    reply to 0x82 (14 bytes)         06 82 01 00 01 00 06 00 03 00 00 00 00 cd
INFO  Identity 03 00 00 00 00 cd: AULA F75
TX    settings read                    06 84 00 00 01 00 80 00
RX    reply to 0x84 (136 bytes)        06 84 00 00 01 00 80 00 + 128 bytes of settings
TX    colour table read                06 8a 00 00 01 00 00 02
RX    reply to 0x8a (520 bytes)        06 8a 00 00 01 00 00 02 + 512 bytes of colour table
```

On **Dry run** (or **Send to keyboard**), with Fixed on and `#ff6600`:

```
TX    settings read                    06 84 00 00 01 00 80 00
RX    reply to 0x84 (136 bytes)        06 84 00 00 01 00 80 00 + 128 bytes of settings
TX    colour table read                06 8a 00 00 01 00 00 02
RX    reply to 0x8a (520 bytes)        06 8a 00 00 01 00 00 02 + 512 bytes of colour table
INFO  Plan: custom colour into slot 0 of the effect's colour-table row, then select slot 0 (as AULA's driver does); colour table + settings
INFO    colour table 0x16: 0xff -> 0x66
INFO    colour table 0x17: 0xff -> 0x00
INFO    settings 0x3b: 0x46 -> 0x40
DRY   colour table write               06 0a 00 00 01 00 00 02 + the patched 512 bytes
DRY   settings write                   06 04 00 00 01 00 80 00 + the patched 128 bytes
INFO  Dry run: 2 write(s) logged, none sent
```

With dry run off, the two `DRY` lines become `TX`. The app then reads both regions again, and either logs `Done: written and read back` or says which byte didn't stick.

The code path behind that one click:

1. `LightingPane.onSend` (`src/ui/components/lighting-pane.tsx`) calls `session.applyLighting(lighting.choice)`. The choice (effect, brightness, speed, colour) comes from `useLighting` (`src/ui/hooks/use-lighting.ts`), which starts from the board's last read.
2. `useSession` (`src/ui/hooks/use-session.ts`) runs it on the `Keyboard`, marks the app busy and turns any error into a message.
3. `Keyboard.applyLighting` (`src/keyboard.ts`) reads the settings page and the colour table, then calls `planLighting`.
4. `planLighting` (`src/protocol/lighting.ts`) returns the regions to write, in order, and the list of changed bytes. It does no I/O.
5. Each write goes through `SafeSend` (`src/safe-send.ts`), then `WebHidTransport.send` (`src/transports/webhid.ts`), then `HIDDevice.sendFeatureReport`.
6. `Keyboard.verify` reads the written regions back and compares. The session keeps what it read back, so the controls show the board's new state.

## The protocol

Everything here is cited byte by byte in the comments of `src/protocol/` (`wired.ts`, `settings.ts`, `color-table.ts`, `effects.ts`). See [Sources](#sources-and-references) for what the tags like `[ASL]` mean.

### The frame

Over the cable the board takes 520-byte HID feature reports with report ID `0x06`, on a vendor-defined collection (usage page `0xFF00`).

| Byte | Meaning |
| --- | --- |
| 0 | report ID, always `0x06` |
| 1 | command. Reads have the high bit set (`0x84` reads what `0x04` writes) |
| 2 | parameter, e.g. `0x01` for the identity read |
| 3 | `0` |
| 4 | number of packages, `ceil(length / 512)`. Always 1 here |
| 5 | package index, from 0 |
| 6–7 | payload length, little endian, at most 512 |
| 8… | payload, zero padded to 520 bytes |

**A write** is one SET_FEATURE that carries the payload.

**A read** is a SET_FEATURE that carries only the header, whose length field says how much to send back. A GET_FEATURE on report `0x06` then returns the reply: the same header, with the data from byte 8.

Platforms hand the reply over differently. Chrome on macOS returned 14 bytes for the identity reply on a real F75 (report ID, 7 header bytes and 6 data bytes, no padding). `parseReply` therefore accepts the reply with or without the report ID, padded or not. It refuses one that doesn't start with the command it asked for.

AULA's driver waits 20 ms before every transfer and tries a failed one 3 times, 70 ms apart. The app does the same. The decompiled driver builds exactly this frame ([report](docs/reverse-engineering/report.md#5-the-frame)).

### Commands

| Command | Param | Length | What | Used |
| --- | --- | --- | --- | --- |
| `0x82` | `0x01` | 6 | identity read, the model's 6-byte ID | yes |
| `0x84` | `0` | 128 | settings page read | yes |
| `0x04` | `0` | 128 | settings page write | yes |
| `0x8a` | `0` | 512 | colour table read | yes |
| `0x0a` | `0` | 512 | colour table write | yes |
| `0x86` | `0` | 378 | per-key colours read (group 0) | yes |
| `0x06` | `0` | 378 | per-key colours write (group 0) | yes |

These seven are the whole allowlist. The per-key pair comes from AULA's decompiled driver, which logs them as "GetGame"/"SetGame": three planes of 126 bytes (red, green, blue), each indexed by the key's LED index. The driver sends the colours while it selects the per-key effect (`0x0a = 21`, `0x09 = 1`), before the settings page, and the app does the same. That the `0x86` read returns the same layout is assumed; the read-back check will say so if it doesn't.

The other commands in AULA's driver are refused on purpose: `0x03`/`0x83` key matrix, `0x05`/`0x85` macros, `0x08` direct LEDs, `0x0b`/`0x0c`/`0x0d` screen, `0x0e`/`0x0f`, `0x11` factory reset, `0x87` battery and `0x88`. The [report](docs/reverse-engineering/report.md#6-every-command) has each one byte by byte.

### Model identities

The identity read (`0x82`, parameter `0x01`) answers 6 bytes that name the model (`src/protocol/ids.ts`). The F75 is `03 00 00 00 00 cd`. The F87, F87 Pro, F99, F99 Pro and H108 answer different bytes. Only the F75 is ever written to.

### Settings page (128 bytes)

Read with `0x84`, written with `0x04`. It always ends in `5A A5`, and a page without that end marker is treated as a failed read.

| Offset | Meaning | Status |
| --- | --- | --- |
| `0x03` | debounce. `0x01` on the owner's board | AULA's driver; this app never changes it |
| `0x09` | `1` while the per-key effect is live, else `0` | AULA's driver; the app clears it when it selects Fixed on, as the driver does |
| `0x0a` | live effect: the first number of its `LedOptN` line in AULA's profile. `1`–`18` are the effects in list order (`1` = Fixed on), `21` is per-key, `0` is off | confirmed on an F75 and in AULA's driver |
| `0x0b` | `0x20` + per-key colour group, `0x20` on the F75 | AULA's driver |
| `0x18` | idle (sleep) timeout. `0x0a` = 300 s in AULA's F75 profile | confirmed on an F75; this app never changes it |
| `0x38–0x39` | `FF FF` | |
| `0x3a…` | one 2-byte slot per effect, in list order: `[brightness, speed << 4 \| colour]`. Effects 1–18 use slot `effect − 1`, per-key slot 18 | confirmed with `Fn+Tab` and in AULA's driver |
| `0x7e–0x7f` | `5A A5` end marker | |

So Fixed on is the slot at `0x3a`: brightness at `0x3a`, and speed (high nibble) plus colour (low nibble) at `0x3b`. The colour nibble picks one of 7 colours, `0` red, `1` green, `2` blue, `3` yellow, `4` magenta, `5` cyan, `6` white, or `7` for colourful. The owner's board reads `07 46` there: brightness 7, speed 4, colour 6.

### Effects

`src/protocol/effects.ts` lists the F75's effects in the order of AULA's profile. The value goes into settings byte `0x0a`, and it is also the effect's colour-table row. The slot is where the effect keeps its brightness and speed: slot `n` is at `0x3a + 2n`.

| Value | Effect | Slot | Brightness | Speed | Colour | Colourful |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Fixed on | 0 | ✓ | – | ✓ | ✓ |
| 2, 4–8, 10–13 | Breathing, Flash away, Raindrops, Rainbow wheel, Ripples shining, Stars twinkle, Retro snake, Neon stream, Reaction, Sine wave | value − 1 | ✓ | ✓ | ✓ | ✓ |
| 3, 15, 16, 17 | Rainbow, Rotating windmill, Colorful waterfall, Blossoming | value − 1 | ✓ | ✓ | – | – |
| 9, 14, 18 | Shadow disappear, Retinue scanning, Rotating storm | value − 1 | ✓ | ✓ | – | ✓ |
| 21 | Per-key | 18 | – | – | – | – |
| 0 | Off | – | – | – | – | – |

Brightness runs 0–9 and speed 0–4. AULA's driver writes no colour-table row for effects 9, 14 and 18 (its profile masks them), so they offer only colourful, or their own colours. The [report](docs/reverse-engineering/report.md#9-effects) has the evidence.

### Colour table (512 bytes)

Read with `0x8a`, written with `0x0a`. It is laid out in rows of 7 RGB colours (21 bytes per row, slots in the firmware order above), with `5A A5` at offset 506. Row 1 (offsets 21–41) belongs to Fixed on: the colour nibble picks a slot in that row.

More precisely, each effect has a row, at row = its `0x0a` value. AULA's driver calls the commands `GetLedRgbTab`/`SetLedRgbTab`, builds 20 rows and pads them to 512 bytes with the marker. This settles it: the region is a colour table, not per-key colour. It was first inferred from OEM-app captures of an F87, and the table read off the owner's F75 has exactly this layout. On that board, row 1 holds white in slot 0, then green, blue, yellow, magenta, cyan and white.

### Setting a colour: the two paths

`planLighting` in `src/protocol/lighting.ts` decides, for Fixed on as for any effect with a colour:

1. **The colour is already in the Fixed-on row.** Only the colour nibble changes, one byte in the settings page, plus the effect byte if the board isn't on Fixed on. AulaSofwareLinux confirmed this on an F75: pressing `Fn+Tab` moved exactly that byte.
2. **Otherwise**, if the board's own colour table has the expected layout, the colour goes into row 1, slot 0, and the nibble selects slot 0. That is exactly what AULA's driver does for a custom colour, and what the OEM app did on the F87. The app still checks the board's table first. On the owner's board slot 0 holds white, so red takes this path too.
3. **Otherwise** the app refuses and says only the 7 firmware colours are possible.

Either way the effect byte becomes Fixed on and the per-key flag at `0x09` is cleared. If the board already shows the colour, nothing is written. If Fixed-on brightness is 0, the app warns that the keys will stay dark.

## Safety

The only real risk to a keyboard is firmware. Everything here is meant to make the worst realistic outcome a factory reset.

- **Seven commands only.** `src/allowlist.ts` lists them, and every header field must match exactly: command, parameter, one package, index 0, length. The padding must be zero, and a settings or colour-table write must carry its region's `5A A5` marker. Factory reset, key matrix, macros, direct LEDs, firmware, update and boot commands, the dongle's `0x13` reports and anything unknown are refused.
- **The rule is enforced three times:**
  1. **The guard.** App code sends only through `src/safe-send.ts`, which checks the allowlist, applies dry run and logs the hex. A refused frame shows as a `BLOCK` line in the log.
  2. **The transport.** `src/transports/webhid.ts` checks the allowlist again right before the hardware call, so code that skips the guard still can't send anything else. It also only routes a report to an interface that declares it.
  3. **The build.** A raw WebHID call anywhere but `src/transports/webhid.ts`, or `transport.send` anywhere but `src/safe-send.ts`, breaks the build. The module fails to load in `npm run dev`, and `npm run build` and `npm run lint` fail (`scripts/raw-sends.mjs`).
- **The bootloader door stays shut.** AULA's firmware updater, decompiled, restarts a board into its bootloader with `05 75 00 00 00 00` on feature report `0x05`, then erases, writes and burns over reports `0x05` and `0x06` as device `0603:1020`. The allowlist refuses report `0x05` and any `0x06` frame that isn't 520 bytes with an allowed command, and the device checks refuse any ID but `258A:010C`. The safety test sends those exact frames and checks they're refused. AULA's own driver never sends report `0x05` either: flashing is a separate `Update.exe`, which the F75 driver package doesn't include.
- **Identity gate.** Until the board identifies as an F75, the identity read is the only command sent. If the product ID isn't the wired F75's, nothing at all is sent. A board that reappears with a different product ID may be in its bootloader: send nothing, unplug, wait, replug.
- **Dry run is on at every page load.** It blocks writes but lets reads through.
- **Read before write.** Back up first. Every change is read-modify-write from the board's own bytes, and every write is read back.
- **Wired mode only, and don't unplug mid-write.** The status line says so whenever dry run is off.
- **No new commands without a source.** A command only joins the allowlist with a source for its bytes, and the code cites it.

## Where to read

### In order, to understand the whole thing

Read in this order. Each step builds on the one before. The line counts are rough.

1. **`src/protocol/wired.ts`** (~140 lines): the frame. Start with the comment at the top, which has the byte layout and its sources. Then read `buildReadRequest`, `buildWrite` and `parseReply`, whose comment explains why short replies are accepted.
2. **`src/protocol/effects.ts`**, **`settings.ts`**, **`color-table.ts`** (~70 each): what the board stores. `effects.ts` lists the 20 effects and their controls; the top comments of the other two map the settings page and the colour table. Then **`lighting.ts`** (~150): `planLighting`, the whole lighting decision in one pure function.
3. **`src/protocol/ids.ts`** (~45): why the USB IDs aren't enough, and the identity bytes of each model.
4. **`src/allowlist.ts`** (~125): `RULES` and `inspect()`, exactly what may be sent and why a frame is refused.
5. **`src/safe-send.ts`** (~45): the guard. It's short; read all of it.
6. **`src/device-check.ts`** (~100): the four checks, `canIdentify` versus `canSend`, and the "blocked" messages the device pane shows.
7. **`src/keyboard.ts`** (~290): the operations. Read `identify()`, `applyLighting()` and `backup()`, then the private helpers `query`, `transfer`, `commit` and `verify` at the bottom.
8. **`src/transport.ts`** (~75), then **`src/transports/webhid.ts`** (~155): the hardware edge. It opens every interface of the board, sends each report to the interface that declares it, and makes the second allowlist check.
9. **`src/ui/hooks/use-session.ts`** (~135): how the UI wires all of the above together. It covers Connect, the dry-run ref the guard reads, and the log store.
10. **`src/ui/App.tsx`** and **`src/ui/components/`**: the screen. Start from `App.tsx` for the grid, then the pane you care about.
11. **`test/fixtures/fake-hid.ts`**, then any spec in `test/`. The test names say in plain English what the app promises.

### By question

| Question | Where |
| --- | --- |
| Why is this byte this value? | the source tags in the comments of `src/protocol/*.ts`; [Sources](#sources-and-references) |
| What exactly can the app send? | `src/allowlist.ts` |
| Why did the app refuse to send? | the device pane and `src/device-check.ts`; `BLOCK` lines in the log and `inspect()` in `src/allowlist.ts` |
| How does a colour become bytes? | `planLighting` in `src/protocol/lighting.ts` |
| What happens when I click Send? | `lighting-pane.tsx` → `use-session.ts` → `Keyboard.applyLighting` ([walkthrough](#one-colour-change-frame-by-frame)) |
| How does dry run work? | `src/safe-send.ts`, and `dryRunRef` in `src/ui/hooks/use-session.ts` |
| How does the build stop raw sends? | `scripts/raw-sends.mjs`, used by `vite.config.ts` and `npm run lint` |
| What is in the backup file? | `Backup` and `backup()` in `src/keyboard.ts`; `src/ui/components/backup-pane.tsx` |
| What does the owner's board actually hold? | `test/fixtures/f75.ts` (identity, settings page and colour table from a real backup) |
| How do tests fake the keyboard? | `test/fixtures/fake-hid.ts` and `test/fixtures/app.ts` |
| How do I change the app's colours? | the theme blocks in `src/index.css`; `src/ui/hooks/use-theme.ts` |
| How do I add a pane or control? | `src/ui/components/pane.tsx` and the grid in `src/ui/App.tsx` |
| How would a desktop version plug in? | `src/transport.ts`: a new class implementing `Transport` |

## File map

```
src/
  main.tsx                 entry: loads the CSS and renders the app
  index.css                Tailwind, the three themes (CSS variables), base styles
  protocol/                pure functions, no I/O
    wired.ts               0x06 framing: build requests and writes, parse replies
    effects.ts             the 20 effects: 0x0a value, settings slot, which controls each takes
    settings.ts            the settings page: offsets, the end marker, reading and writing a slot
    color-table.ts         the colour table: rows of 7 colours, the layout check
    lighting.ts            planLighting and planPerKey: the read-modify-write plans
    per-key.ts             the per-key colours: three 126-byte planes by LED index
    keys.ts                the F75's keys as AULA's driver draws them, with their LED indices
    ids.ts                 USB IDs and the 6-byte model identities
    bytes.ts               hex and RGB helpers
  allowlist.ts             the seven commands that may reach the board; inspect() and assertAllowed()
  safe-send.ts             the guard: allowlist, dry run, hex log. The only caller of Transport.send
  device-check.ts          the checks that gate every send (shown in the device pane)
  keyboard.ts              identify, read the board, apply lighting, backup, read back; retries and delays
  log.ts                   the packet log store (framework-free)
  profiles.ts              lighting profiles: the format, its checks, export and import (framework-free)
  transport.ts             the Transport interface and device description types
  transports/
    webhid.ts              WebHID for Chrome/Edge. The only file that touches navigator.hid
  ui/
    App.tsx                the one-screen layout: top bar, four panes, status line
    hooks/
      use-session.ts       wires transport, guard, keyboard and log for the UI
      use-lighting.ts      the lighting being edited, loaded from each read of the board
      use-key-colors.ts    the per-key colours being painted, loaded from the board
      use-profiles.ts      named profiles in localStorage
      use-saved-colors.ts  saved colours in localStorage
      use-theme.ts         the theme, in localStorage, applied to <html data-theme>
    components/
      top-bar.tsx          title, connection light, theme switcher, dry-run switch, Connect
      device-pane.tsx      checks, identity, HID collections, Copy JSON
      lighting-pane.tsx    effect, brightness, speed, colourful, the colour picker, Dry run / Send to keyboard
      color-picker.tsx     wheel, swatch, hex field and saved colours
      color-wheel.tsx      the hue/saturation wheel (pointer and keyboard)
      keys-pane.tsx        the per-key painter: tools, Dry run / Send key colours
      key-map.tsx          the F75 as an SVG, one shape per key; click, drag or Enter paints
      send-button.tsx      the amber Dry run / Send button both write panes use
      backup-pane.tsx      Back up config, downloads the JSON
      profiles-pane.tsx    save, load, delete, export and import profiles
      log-pane.tsx         the packet log: follows new lines, copy, clear
      status-line.tsx      DRY RUN / LIVE, the board, frame counts
      pane.tsx             the bordered box with its title in the border
      ui/                  shadcn components (button, input, label, switch, table)
    lib/
      color.ts             HSV <-> RGB for the wheel
      utils.ts             cn(), the class-name helper shadcn uses
      download.ts          offers a file download (backup, profiles)
      result-message.ts    the status line after a write: no-op, dry run, or saved and read back
test/                      end-to-end tests, one folder per feature (see Tests)
scripts/raw-sends.mjs      the rule that only the guard may send; used by vite.config.ts and lint
scripts/rea-bridge.py      keeps one REA/Ghidra session open for static analysis of AULA's binaries
scripts/ghidra/            ExportAll.java: Ghidra headless export (strings, imports, all decompiled C)
scripts/pe-vtable.py       finds a C++ class's vtable in a Windows binary through its RTTI
docs/reverse-engineering/  the plan, and the report on AULA's decompiled F75 driver
references/                the reference projects, as git submodules
index.html                 the page, plus the small script that applies the saved theme before paint
vite.config.ts             React, Tailwind, the '@' alias and the raw-send check
playwright.config.ts       Chromium, the dev server on port 5173, CHROMIUM_PATH
tsconfig.*.json            app (src), node (config and scripts), test (src + test)
.oxlintrc.json             lint rules, including "import with @/, not ./"
components.json            shadcn settings (new-york style, paths under src/ui)
CLAUDE.md                  working rules for AI assistants in this repo
```

## The screen

One screen, laid out like a terminal dashboard:

- **Top bar:** the name, the connection light (`connected · 258a:010c`), the theme switcher, the **Dry run** switch and **Connect** / **Disconnect**.
- **device:** what the browser granted, the four checks with a tick, cross or dash, and why the app is holding back if it is. Below that, the HID collections table (usage page and usage, then each kind of report the board declares, with its ID and size) and **Copy JSON**.
- **lighting:** the board's live effect in the border, and a **Read board** icon to read it again (after you changed something with the keyboard's own `Fn` keys, say). Then the **Effect** list, **Brightness** (0–9) and **Speed** (0–4), greyed out for an effect that has no such control, and **Colourful** for an effect that can cycle colours. Below that the wheel, a swatch, the hex field and its RGB value, your saved colours, a line saying what Send will write, and **Dry run** or **Send to keyboard**. That button is amber while dry run is on. Picking another effect loads that effect's own brightness, speed and colourful setting from the board, and keeps your colour.
- **backup:** **Back up config**. It only reads.
- **profiles:** above the log. Type a name and **Save profile** to keep the effect, its brightness, speed and colourful setting, the colour and the key colours in this browser. Click a profile to load it into the controls (nothing is sent until you press Send), or × to delete it. **Export profiles** downloads them all as JSON; **Import profiles** adds the ones in such a file, replacing any with the same name. Imported and stored profiles are checked field by field, so a damaged file can't reach the controls.
- **keys:** the per-key painter. **Paint** or **Erase**, **Fill all**, **Clear all** and **Board's colours** (back to what the board stores), the colour it paints with (the one picked in the lighting pane), and **Dry run key colours** or **Send key colours**, which also selects the per-key effect. The map is AULA's drawing of the F75 (the ISO layout, the only one AULA ships for it): click a key, press and drag across keys, or focus a key and press Enter. Each key's name and colour is its accessible name.
- **packet log:** every frame and status line with a time stamp. `TX` sent, `RX` received, `DRY` held back by dry run, `BLOCK` refused by the allowlist, `ERR` and `INFO`. Frames longer than 48 bytes fold to a preview; click to see all of them. The log follows new lines while you're at the bottom and stays put when you scroll up. Use the icons for **Copy log** and **Clear log**.
- **Status line:** `DRY RUN` or `LIVE`, the board's model, idle or working, and counts of tx, rx, dry and blocked frames.

From 1024 px wide everything fits the window, and each pane scrolls on its own: device and backup on the left, lighting in the middle, profiles and the packet log on the right, and the keys along the bottom. Narrower, the panes stack.

**The colour wheel** sets hue around the ring (red at the top, clockwise) and saturation from the centre (white) to the edge. Value is always full: the board has its own brightness, and dark colours only make the LEDs look off. Type a hex value for anything else. From the keyboard, focus the wheel: ←/→ change the hue by 5°, ↑/↓ change saturation by 5%, Shift triples the step, and Home goes to white.

**Saved colours** live in this browser's `localStorage` (key `open-f75:saved-colors`), newest first, up to 16. Click one to use it, or × to remove it.

**Themes:** three dark terminal themes, switched with the swatches in the top bar: [Tokyo Night](https://github.com/folke/tokyonight.nvim) (the default), [Catppuccin Mocha](https://catppuccin.com/palette) and [Rosé Pine](https://rosepinetheme.com/palette). The choice is kept in `localStorage` (key `open-f75:theme`). Each theme is a block of CSS variables in `src/index.css`, keyed on `data-theme`. The script in `index.html` sets that attribute before the first paint, so a reload doesn't flash. Every text colour pair reaches 4.5:1 contrast.

The design system comes from the [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) skill: Dark Mode (OLED) style, JetBrains Mono, dense spacing. On touch screens the small buttons grow to 44 px, and animations stop when the system asks for reduced motion.

## Tests

The tests are end-to-end only. Playwright drives the real app in Chromium with a fake F75 installed as `navigator.hid`. Every test goes through the real WebHID transport, guard and keyboard code, and checks the exact bytes that cross the HID boundary. Test doubles live only in `test/`; `src/` is only the app.

```
test/
  fixtures/
    app.ts           helpers (openWithBoard, connectF75, sendColor, sent, boardState...).
                     Fails any test that logs a console error or throws.
    fake-hid.ts      the fake F75: answers the 0x06 reads, keeps what is written,
                     records every report sent (window.__fakeHid)
    f75.ts           identity, settings page and colour table from the owner's real F75
  connect/           identity read, reply formats, other models and product IDs,
                     no auto-connect, unplug, no WebHID
  safety/            the transport refuses everything off the allowlist, even with the guard bypassed
  static-color/      Fixed on: dry run, firmware colour (one byte), custom colour, leaving the
                     per-key effect, no-op, a board that ignores writes, a colour table with another layout
  lighting/          starting from the board, another effect with its own values, a custom colour
                     in the effect's own row, effects without a colour, off, Read board
  per-key/           click and drag painting and the exact bytes sent, starting from the board,
                     the tools, keyboard painting, dry run, a lighting send keeps the painting
  profiles/          kept across reloads and loaded back, export and import, a foreign file
                     refused, a loaded profile sent
  fake-board/        the npm run dev:fake page (index.html, main.ts) and a test that it works
  backup/            the downloaded JSON, reads only; not offered for another model
  packet-log/        following new entries, clearing, the newer-Chrome scroll regression
  color-picker/      the wheel (pointer and keyboard), saved colours in localStorage
  theme/             default, switching, reload, the pre-paint script, blocked storage
```

The fake board can be set up per test (`openWithBoard(page, { ... })`):

- `identity`: another model's bytes, or `null` for no answer
- `settings`, `colorTable`, `perKey`: what the board stores (the owner's real settings and colour table by default, no per-key colours). `window.__fakeHid.setSettings(bytes)` changes the settings later, as the board's own `Fn` keys would
- `productId`: e.g. a wireless or bootloader ID
- `replyFormat`: how GET_FEATURE replies arrive. `short-with-id` is the default, what Chrome on macOS did; the others are `short`, `full` and `full-with-id`.
- `ignoreWrites`: accepts writes but keeps the old bytes
- `granted`: pretends the board was granted in an earlier visit, to prove the app still doesn't open it on its own

Running them:

```sh
npx playwright install chromium   # first run only
npm test                          # all of them; starts the dev server on port 5173
npx playwright test test/theme    # one folder
npm run test:ui                   # Playwright's UI, to watch and step through
CHROMIUM_PATH=/path/to/chromium npm test   # use a browser that is already installed
```

## Tooling and conventions

- **Imports** use `@/` for `src/` and `@test/` for `test/`, never `./` or `../`. oxlint enforces it (`.oxlintrc.json`). The aliases are set in `tsconfig*.json` and `vite.config.ts`.
- **The raw-send rule** lives in `scripts/raw-sends.mjs`. `vite.config.ts` runs it on every module it loads, and `npm run lint` runs it on all of `src/`. It is a text check, so it can be dodged on purpose; the transport's allowlist check is the runtime net.
- **TypeScript** uses project references: `tsconfig.app.json` (the app, `src/`), `tsconfig.node.json` (`vite.config.ts` and the script) and `tsconfig.test.json` (`src/` and `test/`).
- **Styling** is Tailwind v4 with theme tokens as CSS variables in `src/index.css`. A new token goes in all three theme blocks.
- **shadcn components** go in `src/ui/components/ui` (`components.json`, new-york style). To add one, run `npx shadcn@latest add dialog`.
- **Working rules** are in `CLAUDE.md`: commit to `main`, end-to-end tests only, nothing reaches the keyboard except through the guard, connect only on a click, and run `npm run lint`, `npm run build` and `npm test` before pushing.

## Troubleshooting

| What you see | What it means, what to do |
| --- | --- |
| "WebHID is not available in this browser" | Use desktop Chrome or Edge, on `localhost` or `https`. |
| The chooser lists the board twice, or the check for feature report `0x06` fails | Browsers can list each USB interface as its own entry. Connect again and pick the other one. |
| The product ID check fails | The board is wireless, another model, or in its bootloader. The app sends nothing. Unplug, wait, replug in wired mode. |
| "Identity read failed" | The app sends nothing else. The `RX` line in the log shows the raw reply. Disconnect and connect again to retry. |
| "This board identifies as AULA F87…" (or another model) | Only the F75 is supported, so nothing beyond the identity read is sent. |
| "The board did not keep the write: …" | The board took the write, but the read-back shows the old byte. Nothing more is sent. Take a backup and compare. |
| "Custom colours need the board's colour table in the expected layout" | Your table differs from the expected rows of 7 colours. Only the seven firmware colours are possible; a backup of the table would help work out why. |
| "Fixed on brightness is 0" | The keys will stay dark whatever the colour. |
| The light goes off after a while | Probably the board's own idle timer (settings byte `0x18`). The owner's board reads `0x0a`, which AULA's F75 profile maps to 300 s. A keypress should wake it. The app never changes that byte. |
| The board stops typing or acts strangely | Send nothing, unplug, wait, replug. If it stays wrong, hold `Fn+Esc` for the factory reset. |

## Glossary

- **HID**: Human Interface Device, the USB class keyboards and mice use. Data moves in *reports*.
- **Report ID**: the first byte that says which report this is. The F75's command channel is report `0x06`.
- **Input / output / feature report**: input goes from the device to the host (key presses), output from the host to the device, and feature both ways on request. The F75's lighting uses feature reports.
- **SET_FEATURE / GET_FEATURE**: send or fetch a feature report. In WebHID these are `sendFeatureReport` and `receiveFeatureReport`.
- **Collection, usage page, usage**: how a HID descriptor groups reports and says what they are for. Usage page `0xFF00` and up means vendor-defined, here AULA's command channel.
- **Interface**: one function of a USB device. The F75 has several (keyboard, media keys, the vendor channel). A browser may list each one as a separate entry.
- **VID / PID**: USB vendor and product IDs. `258A` is Sinowealth, the chip maker many keyboard brands use, which is why the IDs don't identify the model.
- **Identity**: the 6 bytes the board answers to command `0x82`, parameter `0x01`. They name the model.
- **Settings page / colour table**: the two regions of the board's memory this app reads and writes. Both are saved on the board and survive a replug.
- **Fixed on**: AULA's name for the single-colour effect, effect 1.
- **Firmware colour / custom colour**: one of the 7 colours selected by the colour nibble, or any RGB value written into the colour table.
- **Dry run**: writes are logged but not sent; reads still go out.
- **Read-modify-write**: read a region, change only the bytes needed, write it back.
- **`5A A5`**: the end marker both regions carry. Its absence means a bad read or a bad frame.

## Sources and references

The comments in `src/protocol/` tag each fact with its source:

| Tag | Source |
| --- | --- |
| `[DRV]` | AULA's F75 driver, `OemDrv.exe` from `AULA F75 Setup v2.0 20260514.exe` (SHA-256 `1dfe4803…ae44a7`), decompiled with Ghidra 12.1.4, never run. Everything about it is in [docs/reverse-engineering/report.md](docs/reverse-engineering/report.md). |
| `[ASL]` | [AulaSofwareLinux](https://github.com/yhuikzdtguioaert/AulaSofwareLinux), `src/proto.rs` and `src/config_page.rs`. Recovered from AULA's own driver and verified on an F75. Its reading of `0x8a`/`0x0a` as per-key colour is wrong (`[DRV]`). |
| `[KBINI]` | AULA's own F75 profile, `references/AulaSofwareLinux/assets/devices/f75-fr/device.ini` |
| `[ORGB]` | OpenRGB's Sinowealth controller: same identity request, model byte `0xCD` = AULA F75 |
| `[CAP]`, `[F87-CAP]` | OEM-app captures of an F87 in `references/Aula-F87-Controller/captures/` |
| `[RS]` | [RustamSheoran/aula-f75](https://github.com/RustamSheoran/aula-f75): `0x8a`/`0x0a` is a 512-byte colour table |
| `[OWNER]` | a backup of the owner's F75 taken with this app (`test/fixtures/f75.ts`) |
| `[UPD]` | AULA's firmware updater, `references/AulaSofwareLinux/assets/devices/f87-pro-wired-wired/Update.exe`, decompiled with Ghidra 12.1.4 through [REA](https://github.com/morluto/rea). Never run. |

The submodules in `references/`:

| Submodule | Use it for | Notes |
| --- | --- | --- |
| `AulaSofwareLinux` | The wired protocol, the settings page, model identities. AULA's F75 profile is in `assets/devices/f75-fr/device.ini`. | Verified on an F75 and derived from AULA's driver. Small, new project. Its `assets/` also holds OEM `Update.exe` files: never run them. |
| `OpenRGB` | `Controllers/SinowealthController/SinowealthKeyboard10cController`: identity, the F75 LED map, direct (streaming) mode for host-driven effects. | Large, code-reviewed project. GPL-2.0-or-later, so use it for facts and don't paste its code. |
| `OpenAula` | Direct mode on the F75, an F75 key layout. | Matches OpenRGB byte for byte. |
| `Aula-F87-Controller` | The 2.4 GHz dongle protocol, and the OEM captures the colour-table layout was first inferred from. | Its `0x13` protocol is the 2.4 GHz path; the F75's wired interface doesn't declare report `0x13`. |

Also worth knowing: [JavaProgswing/aula-f75](https://github.com/JavaProgswing/aula-f75) (the F75's dongle), the [WebHID spec](https://wicg.github.io/webhid/) and [Chrome's WebHID guide](https://developer.chrome.com/docs/capabilities/hid).
