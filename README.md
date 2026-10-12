# open-f75

A lighting controller for the AULA F75 keyboard, built as a WebHID web app (Vite, React, TypeScript, shadcn/ui). A Tauri menu-bar app comes later and will reuse this UI.

**Status:** the app runs end to end against the mock keyboard. The protocol comes from the AULA F87, which reports the same USB IDs (`258A:010C`). Nobody has checked it on an F75 yet, so dry run is on by default.

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

1. Plug the F75 in by cable and switch it to wired mode. Look up the factory-reset key combo first.
2. **Connect** and pick the board. The Device card lists every HID interface and runs the Phase 0 checks: vendor ID, wired product ID, a vendor-defined collection, and input and output report `0x13` with 19 data bytes. If any check fails, the app sends nothing.
3. **Copy JSON** on the Device card and keep it. That is your Phase 0 record.
4. **Back up config** downloads the current config frames and every feature report as JSON.
5. Pick red and click **Dry run**. The app reads the config for real, then logs the 48 frames it would write without sending them. Compare them with the F87 frames in `test/golden/`.
6. Turn dry run off, send red, then unplug and replug to see whether the colour stays.

## Layout

```
src/
  protocol.ts         pure packet builders (checksum, config read, static colour, palette, save)
  transport.ts        Transport interface: send, receiveFeature, onInput, onDisconnect
  safe-send.ts        allowlist guard: the only code allowed to call Transport.send
  keyboard.ts         operations: read config, set static colour (waits for each echo), backup
  device-check.ts     Phase 0 checks that gate every send
  log.ts              packet log store
  transports/
    webhid.ts         Chrome/Edge; the only file that touches navigator.hid
    mock.ts           fake board that speaks the same protocol
  ui/                 React app; components/ui holds the shadcn components
test/golden/          frames extracted from the F87 repo's captures of the OEM app
scripts/pcap-frames.py  turns a USBPcap (Windows) or macOS USB capture into a golden file
references/           OpenAula and Aula-F87-Controller as git submodules
```

`git submodule update --init` fetches the reference repos.

## How a colour is set

It is not one packet. The board takes 20-byte output reports (`13 cmd sub seq … checksum`), and a colour that survives a replug is a read-modify-write:

| Step | Frames | Command |
| --- | --- | --- |
| Read config | 1 out, 10 back | `0x44` |
| Write config (effect "Fixed on", single colour) | 10, each echoed | `0x04` |
| Write palette (colour in frame 1) | 37, each echoed | `0x09` |
| Save | 1, echoed | `0x0A` |

`protocol.ts` cites a source for every byte. The tests check the read request, all 37 palette frames, config frame 0 and the save frame byte for byte against the OEM app's red, green and blue captures.

## Safety

- Every write goes through `safe-send.ts`. Only the four commands above pass, and only with a valid checksum and sequence number. Feature report writes, per-key and audio commands, and anything else are refused. `src/guard.test.ts` fails if any other file calls a raw send.
- Dry run is on at every page load. It blocks writes but lets the config read through, so the logged frames are built from your board's real config.
- Each write waits for its echo. The first missing echo stops the sequence before the save.
- Every frame is logged as hex before it goes out.
- Nothing is sent to a device that fails the Phase 0 checks, for example the 2.4 GHz dongle or a board that came back with a different product ID.

## Adding shadcn components

`components.json` uses the new-york style and puts components in `src/ui/components/ui`:

```sh
npx shadcn@latest add dialog
```

## Golden files

`test/golden/f87-fixed-on-{red,green,blue}.json` come from `references/Aula-F87-Controller/captures/macos-host-wireshark-vm/config-changes/`. They were recorded on an F87 through its 2.4 GHz dongle (`3554:FA09`), not on an F75. Once you have F75 captures, add them the same way:

```sh
python3 -I scripts/pcap-frames.py my-capture.pcapng > test/golden/f75-fixed-on-red.json
```
