# open-f75

A lighting controller for the AULA F75 keyboard, built as a WebHID web app (Vite, React, TypeScript, shadcn/ui). A Tauri menu-bar app comes later and will reuse this UI.

**Status:** the app runs end to end against a mock board built from real F75 data: its HID descriptor and a settings dump read off an F75. The wired protocol and the firmware-colour path come from [AulaSofwareLinux](https://github.com/yhuikzdtguioaert/AulaSofwareLinux), which was verified on an F75. Nobody has run this app on an F75 yet, so dry run is on by default.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173, open it in desktop Chrome or Edge
npm test           # Vitest
npm run build      # typecheck + production build into dist/
npm run lint       # oxlint
```

WebHID only works in Chromium browsers, on `https` or `localhost`. In other browsers, or without the keyboard, switch on **Mock keyboard**.

## First session with the real board

1. Plug the F75 in by cable and switch it to wired mode. The hardware factory reset is `Fn+Esc`, held.
2. **Connect** and pick the board. The app opens every interface the browser grants. If the checks then say feature report `0x06` is missing, connect again and pick the board's other entry.
3. The Device card runs the checks: vendor ID, wired product ID, and feature report `0x06` with 519 bytes on a vendor collection. If they pass, the app sends exactly one command, the identity read, and expects `03 00 00 00 00 cd` (AULA F75). Other models share the USB IDs, so nothing else is sent until this check passes.
4. **Copy JSON** on the Device card and keep it. That is your Phase 0 record.
5. **Back up config** downloads the identity, the 128-byte settings page and the 512-byte colour table.
6. Pick a colour the board isn't showing (green, say) and click **Dry run**. The app reads for real, then logs the bytes it would change and the frames it would write, without sending them.
7. Turn dry run off and send a firmware colour such as green. Then unplug and replug to see whether it stays.
8. Only then try a custom colour (see below).

## How a colour is set

Over the cable the board takes 520-byte feature reports, report ID `0x06`:

```
06  cmd  param  00  packages  index  len(lo)  len(hi)  payload… (zero padded to 520)
```

A read sends that header, then fetches the reply with GET_FEATURE. A change is a read-modify-write: read the region, patch only the bytes that need changing, write it back, then read it again to check the bytes stuck.

| Region | Read | Write | What the app changes |
| --- | --- | --- | --- |
| Settings page, 128 bytes, ends `5A A5` | `0x84` | `0x04` | `0x0a` effect = 1 (Fixed on); `0x3b` low nibble = colour 0–6 |
| Colour table, 512 bytes | `0x8a` | `0x0a` | custom colours only: row 1, slot 0 (offsets 21–23) |

There are two paths:

- **Firmware colour** (red, green, blue, yellow, magenta, cyan, white). One byte in the settings page. AulaSofwareLinux confirmed it on an F75: pressing `Fn+Tab` moved exactly that byte, and a test here checks the app changes the same byte.
- **Custom colour.** Also writes the colour table. This is a hypothesis built from the F87's OEM captures: their palette reassembles into rows of 7 colours, and the OEM app put the custom colour in row 1, slot 0. The F75 projects disagree on what `0x0a` holds, so the app only writes the table when your board's own table has exactly that layout. If it doesn't, it refuses and offers the 7 firmware colours.

`src/protocol/` cites a source for every byte.

## Layout

```
src/
  protocol/
    wired.ts          0x06 feature-report framing and commands (the F75 over USB)
    settings.ts       settings page and colour table: offsets, checks, planStaticColor
    dongle.ts         0x13 20-byte framing (2.4 GHz dongle); not sent by the app, kept for its tests
    ids.ts            USB IDs and model identities
    bytes.ts          hex and colour helpers
  hid-descriptor.ts   HID report descriptor parser (mock today, hidapi later)
  transport.ts        Transport interface: send, receiveFeature, onInput, onDisconnect
  safe-send.ts        allowlist guard: the only code allowed to call Transport.send
  keyboard.ts         identify, read, set static colour (with read-back), backup
  device-check.ts     the checks that gate every send
  log.ts              packet log store
  transports/
    webhid.ts         Chrome/Edge; the only file that touches navigator.hid
    mock.ts           fake board speaking the wired protocol
    mock-data.ts      the real F75 descriptor and settings dump it starts from
  ui/                 React app; components/ui holds the shadcn components
test/golden/          frames from the F87 repo's OEM captures (dongle and wired)
scripts/pcap-frames.py  turns a USBPcap (Windows) or macOS USB capture into a golden file
references/           reference repos as git submodules
```

## Safety

- Every transfer goes through `safe-send.ts`. Five commands pass: identity read, settings read and write, colour table read and write. Each header field must match, padding must be zero, and writes must carry their `5A A5` marker. Factory reset, key matrix, macros, direct LEDs, firmware and anything unknown are refused. `src/guard.test.ts` fails if any other file calls a raw send.
- Until the board identifies as an F75, the identity read is the only command sent. The USB IDs `258A:010C` are shared by the F87, F99, H108 and boards from other brands, and OpenRGB disabled some Sinowealth keyboard detectors after reused IDs bricked Redragon boards.
- Dry run is on at every page load. It blocks writes but lets reads through, so the logged changes are computed from your board's real data.
- Every write is read back. If a changed byte didn't stick, the app says which.
- Every frame is logged as hex before it goes out, without the zero padding.

## References

`git submodule update --init` fetches them. OpenRGB is a shallow clone (about 60 MB).

| Submodule | Use it for | Notes |
| --- | --- | --- |
| `AulaSofwareLinux` | The wired protocol, the settings page, model identities. AULA's own F75 profile is in `assets/devices/f75-fr/device.ini`. | Verified on an F75 and derived from AULA's driver. Small, new project. Its `assets/` also holds OEM `Update.exe` files; never run them. |
| `OpenRGB` | `Controllers/SinowealthController/SinowealthKeyboard10cController`: identity, F75 LED map, direct (streaming) mode for Phase 5. | Large, code-reviewed project. GPL-2.0-or-later, so use it for facts and don't paste its code. |
| `OpenAula` | Direct mode on the F75, an F75 key layout. | Matches OpenRGB byte for byte. |
| `Aula-F87-Controller` | The dongle protocol and the OEM captures behind `test/golden/`. | Its `0x13` protocol is the 2.4 GHz path; the F75's wired interface doesn't declare report `0x13`. |

Other sources worth knowing: [RustamSheoran/aula-f75](https://github.com/RustamSheoran/aula-f75) (WebHID, same wired framing, a second opinion), [JavaProgswing/aula-f75](https://github.com/JavaProgswing/aula-f75) (the F75 dongle), the [WebHID spec](https://wicg.github.io/webhid/) and [Chrome's WebHID guide](https://developer.chrome.com/docs/capabilities/hid).

## Adding shadcn components

`components.json` uses the new-york style and puts components in `src/ui/components/ui`:

```sh
npx shadcn@latest add dialog
```

## Golden files

- `test/golden/f87-dongle-fixed-on-{red,green,blue}.json`: an F87 through its 2.4 GHz dongle (`3554:FA09`), from `references/Aula-F87-Controller/captures/macos-host-wireshark-vm/config-changes/`.
- `test/golden/f87-wired-direct.json`: an F87 over the cable, the OEM app's direct-mode frames, from `captures/windows-npcap-wireshark/raining-silk.pcapng`.

None are from an F75. Once you have F75 captures (Windows, USBPcap, the official app), add them the same way:

```sh
python3 -I scripts/pcap-frames.py my-capture.pcapng > test/golden/f75-fixed-on-red.json
```
