# Reverse-engineering AULA's F75 driver: plan

Goal: decompile AULA's Windows driver for the F75 (statically, never run) to confirm or correct what the app assumes about the protocol, then write `docs/reverse-engineering/report.md`: a reference detailed enough to build the next features (all effects, brightness and speed, per-key colour, key remapping, macros, live effects).

## Rules

- **Never execute** the installer, the driver or anything unpacked from it. Only parse and decompile.
- Downloaded files are untrusted: give each its own new, empty directory in the scratchpad, keep scripts elsewhere, pass paths as arguments, run Python with `-I`.
- Nothing in this work talks to a keyboard.
- AULA's binaries and unpacked files stay in the scratchpad. Don't commit them; the report cites them by name, version and SHA-256.

## 1. Get the driver

The download page is <https://www.aulagaming.com/pages/download> (F75 entry; a zip with a Setup exe inside).

The egress policy must allow `aulagaming.com`, `www.aulagaming.com`, and the host the download link points to. If the policy still refuses it, check `curl -sS "$HTTPS_PROXY/__agentproxy/status"` (`recentRelayFailures`) and ask the owner to add the host. Don't retry denials.

Unpack:

```sh
mkdir -p "$SCRATCH/aula/zip" && cd "$SCRATCH/aula/zip"   # new, empty directory
curl -sS -L -o f75.zip '<download URL>' && sha256sum f75.zip
7z x f75.zip -o../unzipped
innoextract -e -s -d ../app ../unzipped/*.exe              # Inno Setup installer
```

Look for the main executable (AulaSofwareLinux calls it `OemDrv.exe`), the `Dev/kb/*/KB.ini` profile for the F75 and any DLLs that call HID.

## 2. Tools

```sh
sudo apt-get install -y innoextract p7zip-full
npm install --global rea-agents            # REA 6.4.0 was used; https://github.com/morluto/rea
# Ghidra 12.1.4 (REA needs 12.1.x and a full JDK 21; java/javac 21 are preinstalled).
# GitHub release downloads are blocked here; the SourceForge mirror works.
mkdir -p "$SCRATCH/tools" && cd "$SCRATCH/tools"
curl -sS -L -o ghidra.zip 'https://sourceforge.net/projects/ghidra.mirror/files/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip/download'
echo 'ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db  ghidra.zip' | sha256sum -c -   # official release hash
unzip -q ghidra.zip && rm ghidra.zip
export GHIDRA_INSTALL_DIR="$SCRATCH/tools/ghidra_12.1.4_PUBLIC"
rea doctor --provider ghidra --json        # expect healthy
```

Read REA's skill before analysing: `.agents/skills/reverse-engineer-anything/SKILL.md` and `references/native-and-artifacts.md` in a clone of `morluto/rea` (public; `git clone --depth 1` works).

Each `rea` CLI call re-imports the binary (2–3 minutes for a 2 MB exe), so keep one session open with the bridge:

```sh
nohup python3 -I scripts/rea-bridge.py serve "$SCRATCH/rea.sock" "$SCRATCH/rea.log" > /dev/null 2>&1 &
B="python3 -I scripts/rea-bridge.py"
$B call "$SCRATCH/rea.sock" open_binary '{"path":"/abs/OemDrv.exe","provider_id":"ghidra"}' "$SCRATCH/open.json"
$B call "$SCRATCH/rea.sock" search_strings '{"pattern":"(?i)hidd_|feature","mode":"regex"}' "$SCRATCH/s.json"   # first deep call imports
$B show "$SCRATCH/s.json"
$B call "$SCRATCH/rea.sock" trace_feature '{"query":"HidD_SetFeature"}' "$SCRATCH/t.json"                    # call sites
$B decompile "$SCRATCH/rea.sock" 0x401fe0 "$SCRATCH/f.c"
$B call "$SCRATCH/rea.sock" close_binary '{}' "$SCRATCH/close.json"
```

To stop the bridge, kill it by PID. `pkill -f "rea mcp"` also matches, and kills, the shell running it.

## 3. Questions to answer

Answer each with the function address and the decompiled evidence, and mark it as confirmed, inferred or unknown.

1. **Frame.** Report `0x06`, 520 bytes, header `06 cmd param 00 packages index lenLo lenHi`. Delay between transfers, retries, how replies are read (GET_FEATURE right after?), multi-package transfers.
2. **Identity.** `0x82` parameter `0x01`, the 6-byte answer, how the driver maps it to a model (`Psd=` in KB.ini). Other `0x82` parameters (firmware version?).
3. **Settings page** (`0x84` read, `0x04` write, 128 bytes, ends `5A A5`). Every field the driver writes. Most important: **does offset `0x0a` hold the effect's UI index or its hardware number?** In the F75 profile, `LedOpt2=2,3,…` (UI 2, hardware 3); AulaSofwareLinux writes the UI index. Also: the per-effect slots at `0x3a` (brightness, speed, colour, and where direction and random live), sleep at `0x18` (SleepHW), debounce, Win-lock, report rate, anything else.
4. **Region `0x8a`/`0x0a` (512 bytes).** The app treats it as a colour table: rows of 7 RGB colours, `5A A5` at 506, row 1 = Fixed on, custom colour in slot 0. AulaSofwareLinux calls it per-key RGB, 3 bytes per LED. Which is it, and **how does the driver set "Fixed on" to a custom colour?** This decides whether the app's custom-colour path is right.
5. **Full command list**, with what each does: `0x03`/`0x83` key matrix (encoding, layers), `0x05`/`0x85` macros (record format), `0x06`/`0x86` game mode, `0x08` direct LEDs (frame format, LED order, rate), `0x0b`, `0x11` factory reset, `0x87` battery, anything else.
6. **Dangerous paths.** Firmware update entry (the updater uses `05 75 00 00 00 00` on report `0x05`; see below), whether the driver can auto-update firmware (`FwVerNeedToUpdate=`/`ForceUpdate=` are commented out in the F75 profile AulaSofwareLinux ships), and any other reset or boot command. The allowlist must keep refusing all of them.
7. **The 2.4 GHz dongle** (`3554:FA09`): report IDs and how commands are wrapped, if the driver supports it.

Then check each answer against the app: `src/protocol/wired.ts`, `src/protocol/settings.ts`, `src/allowlist.ts`. Fix anything wrong (with an end-to-end test), and cite the driver as a new source tag (for example `[DRV]`, with file name, version and SHA-256).

## 4. The report

Write `docs/reverse-engineering/report.md` and link it from the README's sources:

- how it was done: tools, versions, hashes, static only
- the frame and every command, byte by byte, each with its evidence and confidence
- the settings page: a full offset table
- the `0x8a`/`0x0a` region, settled
- effects: UI index, hardware number and the controls each accepts (from KB.ini `LedOptN=`: ui, hw, speed, light, direction, random, colour)
- the key map and LED indices (KB.ini `[KEY]`, `[FN1]`)
- dangerous commands and how the app refuses them
- for each next feature (all effects, brightness/speed, per-key painter, remapping, macros, live effects): what's needed, what's confirmed and what's still unknown
- open questions

## Already established (2026-10-12/13)

**Firmware updater.** `references/AulaSofwareLinux/assets/devices/f87-pro-wired-wired/Update.exe` (SHA-256 `95366eda7e0c2a7cb846c9214432f0e2d2783019f38f37ca522726356c229843`), an MFC app that calls `HidD_SetFeature`/`HidD_GetFeature`:

- `FUN_004084a0`: sends `05 75 00 00 00 00` ('u') on feature report `0x05` to the running board, which restarts into its bootloader as `0603:1020`. The target IDs come from `config.ini` `[Device] VID/PID`.
- `FUN_00408cd0`: probes the bootloader with `05 52 f0 fc 04 00` and expects an 'a' reply.
- `FUN_00401fe0`: erase (report `0x05` filled with `0x45` 'E'), write, read back, burn (filled with `0x55` 'U').
- `FUN_00402af0`: write: `05 57 00 00 sizeLo sizeHi` ('W', size = firmware length rounded up to 2 KB), then 2050-byte reports `06 77 …` carrying 2048 bytes each.
- `FUN_00402810`: read back: `05 52 00 00 sizeLo sizeHi` ('R'), then GET_FEATURE `06 72 …` in 2048-byte blocks, compared with the file.

The app refuses all of it: report `0x05` is never sent, `0x06` frames must be 520 bytes with one of five commands, and only `258A:010C` is talked to. `test/safety/allowlist.spec.ts` sends those exact frames.

**AULA's F75 profile** (`references/AulaSofwareLinux/assets/devices/f75-fr/device.ini`, from the driver package):

- IDs `258A:010C` wired and `3554:FA09` wireless; `Psd=3,0,0,0,0,cd`
- `Light=0..9`, `Speed=0..4`
- `SleepUI=60,90,120,180,240,300,600,900,1200` maps to `SleepHW=2,3,4,6,8,10,20,30,40`. The owner's board reads `0x0a` = 300 s.
- 19 effects, `LedOpt1`–`LedOpt19`. Fields: ui, hw, speed, light, direction, random, colour. `LedOpt19=21,0,…` is "off".
- 82 keys in `[KEY]`: rectangle, function type, code, modifier, LED index. `[FN1]` holds the Fn layer.
