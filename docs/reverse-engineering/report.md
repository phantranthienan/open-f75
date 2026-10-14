# AULA's F75 driver, decompiled: report

What AULA's own Windows driver sends to an F75, recovered statically from the binary. It checks the app's protocol code and is the reference for the next features: all effects, brightness and speed, per-key colour, key remapping, macros and live effects.

Each fact carries a confidence:

- **confirmed**: read in the decompiled code, and where possible checked against the owner's board or AulaSofwareLinux's hardware tests
- **inferred**: follows from the code, but no single function shows it end to end
- **unknown**: not settled here

Addresses are the driver's (`FUN_00499af0` is the function at `0x00499af0` in `OemDrv.exe`).

## Contents

1. [Answers in short](#1-answers-in-short)
2. [How it was done](#2-how-it-was-done)
3. [The driver package](#3-the-driver-package)
4. [How the driver finds and handles an F75](#4-how-the-driver-finds-and-handles-an-f75)
5. [The frame](#5-the-frame)
6. [Every command](#6-every-command)
7. [Settings page (128 bytes)](#7-settings-page-128-bytes)
8. [Colour table (512 bytes), settled](#8-colour-table-512-bytes-settled)
9. [Effects](#9-effects)
10. [Per-key colour](#10-per-key-colour)
11. [Direct LED frames](#11-direct-led-frames)
12. [Keys, LEDs and the key matrix](#12-keys-leds-and-the-key-matrix)
13. [Macros](#13-macros)
14. [Battery and firmware version](#14-battery-and-firmware-version)
15. [The 2.4 GHz dongle](#15-the-24-ghz-dongle)
16. [Dangerous paths](#16-dangerous-paths)
17. [Checked against the app](#17-checked-against-the-app)
18. [What each next feature needs](#18-what-each-next-feature-needs)
19. [Open questions](#19-open-questions)
20. [Function index](#20-function-index)

## 1. Answers in short

| Plan question | Answer | Confidence |
| --- | --- | --- |
| Frame | Exactly the app's: report `0x06`, 520 bytes, `06 cmd param 00 packages index lenLo lenHi`. 20 ms before every transfer, and 20 ms between a read's SET_FEATURE and its GET_FEATURE. A failed SET_FEATURE is tried 3 times, 70 ms apart. | confirmed |
| Identity | `06 82 01 00 01 00 06 00`. The 6-byte answer must equal the profile's `Psd=` byte for byte (`03 00 00 00 00 cd` for the F75), or the driver ignores the device. The firmware version comes from USB (`bcdDevice`), not from a command. | confirmed |
| Byte `0x0a`: UI index or hardware number? | The **first** number of the effect's `LedOptN=` line, which the profile's own comment calls `hw`. For the F75 that is 1–18 in list order, 21 for per-key ("Self-define") and 0 for off. The second number only picks the driver's on-screen preview. | confirmed |
| Per-effect slots | One 2-byte slot per effect from `0x3a`, **in list order**: effects 1–18 at slot `effect − 1`, per-key at slot 18 (`0x5e`). Brightness = `LightHW`, speed = `SpeedHW << 4`, colour nibble = 0, or 7 for random. | confirmed |
| Which effects the F75 has | 15 effects, per-key and off. `LedMask=0x22100` hides effects 9, 14 and 18: the driver leaves them out of its effect list (`FUN_004305d0`) and out of the colour table. | confirmed |
| `0x8a`/`0x0a` | A colour table, as the app assumed: one row of 7 RGB colours per effect, row = the effect's `0x0a` value, `5A A5` at 506. The driver calls it `SetLedRgbTab`. It is not per-key colour (AulaSofwareLinux's reading). | confirmed |
| Fixed on in a custom colour | The colour goes into row 1, slot 0, and the settings page selects slot 0, which is what the app's custom path does. | confirmed |
| Full command list | See [§6](#6-every-command). `0x06`/`0x86`, which the driver logs as "SetGame", carries the per-key colours. | confirmed |
| Firmware updates | `OemDrv.exe` never sends report `0x05`. Flashing is done by a separate `Update.exe`, which this package doesn't ship. The F75 profile has no `FwVerNeedToUpdate=` and no `UID=`, so neither the local nor the online update path can start. | confirmed |
| Factory reset | `06 11 00 00 01 00 01 00 00`, sent only when a profile sets `CmdReset=1`. The F75's doesn't, so the driver never sends it to an F75. | confirmed |
| Dongle | Another class (`CDev3632`), using 20-byte interrupt reports `13 cmd total index (flag << 4 \| len) data[14] sum`, with its own command numbers. | confirmed |

The app was right about every byte it sends. The driver showed one gap: it clears the per-key flag at `0x09` whenever the effect isn't per-key, and the app now does the same ([§17](#17-checked-against-the-app)).

## 2. How it was done

Static analysis only. Nothing from the download was executed, and nothing in this work talked to a keyboard.

| Step | Tool | Notes |
| --- | --- | --- |
| Download | `curl` | `https://www.mediafire.com/file/5whrw6wr1bdpst0/AULA+F75+Setup+v2.0+20260514.exe/file`, the F75 entry on <https://www.aulagaming.com/pages/download> (labelled "F75 Pro", the only F75 Windows driver listed). Served by `download2365.mediafire.com` on 2026-10-13. |
| Unpack | innoextract 1.9 | `innoextract -e -s` on the Inno Setup installer. |
| Decompile | Ghidra 12.1.4 PUBLIC (zip SHA-256 `ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db`, the official release hash), OpenJDK 21.0.12 | Headless auto-analysis, then `scripts/ghidra/ExportAll.java`, which writes every string with the functions that use it, every import with its call sites, and the decompiled C of all 13,945 functions with their callers. |
| Vtables | `scripts/pe-vtable.py` (Python 3.13, run with `-I`) | Finds an MSVC class's vtable through its RTTI name, to map virtual calls (`(*this + 0x6c)(…)`) to functions. |
| Spot checks | GNU objdump 2.42 | Disassembly where the decompiler loses a register argument (the factory reset's payload, the effect-name loop). |

The plan called for [REA](https://github.com/morluto/rea) on top of Ghidra. Installing it was refused by the session's permission check, so Ghidra's own headless analyser did the work. `scripts/rea-bridge.py` is still there for a session that can use REA.

To repeat it:

```sh
G=ghidra_12.1.4_PUBLIC
MAXMEM=10G $G/support/analyzeHeadless "$SCRATCH/proj" oemdrv -import /abs/OemDrv.exe \
  -scriptPath scripts/ghidra -postScript ExportAll.java "$SCRATCH/out" -deleteProject
python3 -I scripts/pe-vtable.py /abs/OemDrv.exe CDevG5KB
# one function from the export:
awk -v a=00499af0 '/^\/\/ ==== /{p=($3==a)} p' "$SCRATCH/out/decomp.c"
```

Analysis plus export takes about 9 minutes on 4 cores.

## 3. The driver package

`AULA F75 Setup v2.0 20260514.exe`, 2,440,623 bytes, SHA-256 `1bbd68a9f153384a2b5542a75a4c15f5707613617fdf3fab11db543dbb9d4dee`.

| File (under `app/`) | SHA-256 | What |
| --- | --- | --- |
| `OemDrv.exe` | `1dfe4803efdbe14f66680f970a6d6f26108342fd49754234fa448dd0ebae44a7` | The driver. PE32 i386 MFC app, 2,737,088 bytes, dated 2026-03-17. Everything below comes from it. |
| `Dev/kb/fr/KB.ini` | `fe98fec7f3bbb4bbcc329aaa9c31357b46469dd083c1045aafc6da2ff07a961d` | The F75 profile. UTF-16. After re-encoding it is identical to `references/AulaSofwareLinux/assets/devices/f75-fr/device.ini`, so that copy is cited below as `[KBINI]`. |
| `Cfg.ini` | `ba1e6fd304569a62092601952024943d629c2f02b93ddb194dcb220c094390fb` | App settings (`Ver=0x200`, `UpdateByLocal=0`, `EnableYun=0`). Identical to AulaSofwareLinux's `assets/Cfg.ini`. |
| `Dev/kb/fr/ET/*.txt`, `Cartoon/*.txt` | | Key groups for the driver's music and preview animations. |
| `InitSetup.dll`, `uninstall.dll` | `59db7bfd…de301`, `a55c5443…6326b` | Installer helpers. Not analysed. |

There is no `Update.exe` in this package.

AULA's binaries stay out of this repository. The hashes identify them.

## 4. How the driver finds and handles an F75

**Class.** `FUN_0040bb80` creates one device object per profile from its `Fw=` value. `Fw=0x18` (24, the F75) and `0x1a` get a `CDevG5KB`, `0x19` a `CDevG5MS` (mice), `0x16` another family. *confirmed*

**Interface.** `CDevG5KB::FindHIDDevice` (`FUN_00498fb0`) walks the HID interfaces with the profile's VID/PID (`258A:010C`). For `Fw=24` it opens the one with usage page `0xFF00`, usage `1` and a 520-byte feature report. That is the collection the app's device checks look for. *confirmed*

**Identity gate.** If the profile has a `Psd=` (the F75's is `3,0,0,0,0,cd`), the driver reads the identity (`FUN_0049a430`) and compares all 6 bytes. On a mismatch it logs `Psd unmatch` and skips the device. *confirmed*

**Settings flow.** `CDevG5KB::ApplySetting` (`FUN_0049c020`) writes, in this order and only what changed:

1. reset (`0x11`), only if the profile has `CmdReset=1`
2. key matrix (`0x03`, one frame per layer, 50 ms apart) and macros (`0x05`)
3. per-key colour groups (`0x06`), when the per-key effect is live
4. colour table (`0x0a`), 120 ms after the last write
5. settings page: `WaitTm` (default 30 ms; the F75 profile doesn't set it), then read (`0x84`, retried up to 5 times, 100 ms apart, until it ends in `5A A5`), patch, write (`0x04`) 60 ms (or 100 ms after a colour-table write) later
6. then 500 ms (30 ms without a window) before the driver talks to the board again

The per-key colour groups (step 3) each wait `WaitTm` first. The app keeps these pauses ([§17](#17-checked-against-the-app)). *confirmed*

Only the settings page is read-modify-write. The colour table, matrix and macros are written whole from the driver's own state. *confirmed*

The driver never loads the board's settings into its UI. It keeps its own copy in its profile files. The only page read is the one in step 5. *inferred, from the vtable: `CDevG5KB` has no load function*

## 5. The frame

Built in `FUN_004993c0` (writes) and in eight read functions that inline the same loop (`FUN_00499640`, `…98a0`, `…9af0`, `…9d50`, `…9f60`, `…a190`, `…a430`, `…a5c0`). *confirmed*

| Byte | Value |
| --- | --- |
| 0 | report ID: `0x06` when the profile says `Fw=24`, else `0x09` |
| 1 | command |
| 2 | parameter |
| 3 | `0` |
| 4 | packages, `ceil(total / 512)` |
| 5 | package index, from 0 |
| 6–7 | this package's length, little endian, at most 512 |
| 8… | data, zero padded. Always 520 bytes (`HidD_SetFeature(…, 0x208)`) |

**Write**: for each 512-byte package, wait, then SET_FEATURE. **Read**: for each package, wait 20 ms, SET_FEATURE with the header only (length = bytes wanted), wait 20 ms, GET_FEATURE into the same buffer, take bytes 8 onwards.

**Waits**: 20 ms (`0x14`) for every configuration command, 7 ms for the streaming commands `0x08`, `0x0e` and `0x0f`.

**Retries**: a SET_FEATURE that fails is tried again up to 3 times, 70 ms (`0x46`) apart.

**Error handling quirks**:

- the "gave up" branch can never run (`if (iVar4 < 0)` after a loop that stops at 0), so after 3 failures the driver carries on silently
- a failed GET_FEATURE is only logged, and the stale buffer is copied
- `CDevG5KB` never checks that a reply starts with the command it asked for

The app is stricter on all three.

**Multi-package transfers** exist for macros (4096 bytes = 8 packages). The other commands fit one package.

`0x0c` (screen image pages, `FUN_0049cc30`) is the one command that uses bytes 3 and 4 differently: byte 3 = an image parameter, byte 4 = a running page counter.

## 6. Every command

Wired, `CDevG5KB`. The names are the driver's own, from its log strings. The vtable column is the slot in `CDevG5KB::vftable` at `0x006247f4`.

| Cmd | Param | Length | Driver name | Vtable | Function | What it does | Used for the F75 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `0x82` | `0x01` | 6 | GetPassword | | `FUN_0049a430` | identity read | yes, at discovery |
| `0x83` | layer | 512 | GetMatrix | `+0x60` | `FUN_00499640` | read one key layer | possibly (sync) |
| `0x03` | layer 0–3 | 512 | SetMatrix | `+0x5c` | `FUN_00499600` | write one key layer, [§12](#12-keys-leds-and-the-key-matrix) | yes |
| `0x84` | 0 | 128 | GetLED | `+0x70` | `FUN_00499af0` | settings page read | yes |
| `0x04` | 0 | 128 | SetLED | `+0x6c` | `FUN_00499aa0` | settings page write, [§7](#7-settings-page-128-bytes) | yes |
| `0x85` | 0 | buffer | GetMacro | `+0x68` | `FUN_004998a0` | macro buffer read | possibly |
| `0x05` | 0 | 4096 | SetMacro | `+0x64` | `FUN_00499850` | macro buffer write, [§13](#13-macros) | yes |
| `0x86` | group | 378 | GetGame | `+0x78` | `FUN_00499d50` | per-key colour group read | unknown |
| `0x06` | group | 378 | SetGame | `+0x74` | `FUN_00499cf0` | per-key colour group write, [§10](#10-per-key-colour) | yes, on the per-key effect |
| `0x87` | `0x02` | 2 | ReadPower | `+0x20` | `FUN_0049a5c0` | battery: level, charging | no (`ShowPower=0`) |
| `0x88` | 0 | n | GetRealData | `+0x9c` | `FUN_00499f60` | unknown read | not found in an F75 path |
| `0x08` | 0 | 378 | (real data) | `+0x40` | `FUN_0049a7b0` | direct LED frame, [§11](#11-direct-led-frames) | yes, music effects, wired only |
| `0x0e` | 0 | n | | `+0x44` | `FUN_0049a7e0` | streaming, 7 ms | no caller found |
| `0x0f` | 0 | n | | `+0x58` | `FUN_0049a810` | streaming, 7 ms | no caller found |
| `0x8a` | 0 | 512 | GetLedRgbTab | `+0x80` | `FUN_0049a190` | colour table read | possibly |
| `0x0a` | 0 | 512 | SetLedRgbTab | `+0x7c` | `FUN_0049a140` | colour table write, [§8](#8-colour-table-512-bytes-settled) | yes |
| `0x0b` | 0 | n | SetScreenParam | `+0x54` | `FUN_0049a3e0` | screen settings | no (no screen) |
| `0x0c` | 0 | pages | AccessData_Page | `+0x4c` | `FUN_0049cc30` | screen image upload | no |
| `0x0d` | 0 | 5 | SetGIFParam | `+0x50` | `FUN_0049cfd0` | screen animation parameters | no |
| `0x11` | 0 | 1 | ResetDevice | `+0x34` | `FUN_0049a390` | factory reset, payload `00` | no (`CmdReset` unset) |

All *confirmed* except the "used for the F75" column where marked possibly or unknown.

There is no other command in this class. Firmware commands (report `0x05`) appear nowhere in `OemDrv.exe` ([§16](#16-dangerous-paths)).

## 7. Settings page (128 bytes)

Read with `0x84`, written with `0x04`. The F75 takes the `FUN_0049bbf0` builder, because its profile has no `SubFw=1`. The other builder, `FillCfg_LowDaly` (`FUN_0049b910`), uses different offsets for other firmwares. Don't mix them up: its log line says `Cfg[2](Debounce)`, `Cfg[9](Sleep)`, which are not the F75's offsets.

The owner's page is in `test/fixtures/f75.ts`. Its values are in the last column.

| Offset | Meaning | Written from | Owner's board | Confidence |
| --- | --- | --- | --- | --- |
| `0x03` | debounce | the UI value, default `(ShowDebounce >> 8) & 0xff` = 1. Only when `ShowDebounce` is set (F75: `0x04000101`) | `01` | confirmed (field); range inferred 1–4 |
| `0x09` | per-key effect live: `1` if the selected effect is `GaoshouIndex` (18, i.e. `LedOpt19`), else `0` | | `00` | confirmed |
| `0x0a` | effect: the first number of the selected `LedOptN` | | `01` (Fixed on) | confirmed |
| `0x0b` | `StartGp` (default `0x20`) + selected per-key colour group (F75: one group) | | `20` | confirmed |
| `0x12`–`0x15` | side LEDs (mode, colour, brightness, speed) | only with `ShowSideLED=1`; the F75 has none | | confirmed, n/a |
| `0x16` | a value, or 0 while its flag is set (the default) | | `00` | field confirmed, meaning unknown |
| `0x17` | auto-detect, only with `ShowAutoDetect=1` (F75: no) | | | confirmed, n/a |
| `0x18` | sleep: `SleepHW[n]` for the chosen `SleepUI` entry, or 0 for never | | `0a` (300 s) | confirmed |
| `0x1a` | knob mode, only with `WheelMode` set (F75: no) | | | confirmed, n/a |
| `0x38`–`0x39` | `FF FF` | always | `ff ff` | confirmed |
| `0x3a + 2i` | effect slot `i` (0–18, list order): `LightHW[light]` | | see below | confirmed |
| `0x3b + 2i` | `SpeedHW[speed] << 4 \| (random ? RandomVal : 0)`; `RandomVal` = 7 | | | confirmed |
| `0x60`–`0x7d` | not written by the driver; the read value survives | | `09 37 07 47 …` | unknown |
| `0x7e`–`0x7f` | `5A A5`, when `CRC=1` (F75: default 1) | always | `5a a5` | confirmed |

On reset only (`ApplySetting` flag `0x20`), `ResetItem=` index/value pairs and `CfgVal=` (low byte offset, next byte value) patch arbitrary bytes. The F75 profile sets neither.

Not on this page for the F75: report rate (no field, no UI for this profile) and Win lock (a key function in the matrix, not a setting). *inferred*

The owner's slots, decoded with this layout:

| Slot | Offset | Effect | Brightness | Speed | Colour |
| --- | --- | --- | --- | --- | --- |
| 0 | `0x3a` | Fixed on | 7 | 4 | 6 |
| 1–15 | `0x3c`–`0x58` | Respire … Colorful waterfall | 9 | 4 | 7 |
| 16–18 | `0x5a`–`0x5e` | Blossoming, Rotating storm, Self-define | 9 | 3 | 7 |

So the firmware's own default for the animated effects is brightness 9, colourful.

**Colour nibble.** The driver writes only 0, or 7 for random/colourful, and keeps the chosen colour in slot 0 of the effect's colour-table row ([§8](#8-colour-table-512-bytes-settled)). The firmware also understands 1–6, which select the other slots of the row (AulaSofwareLinux saw `Fn` keys change it). The owner's 6 there was set that way, not by the driver.

## 8. Colour table (512 bytes), settled

Read with `0x8a` (GetLedRgbTab), written with `0x0a` (SetLedRgbTab). Built in `ApplySetting` (`FUN_0049c020`) when the colour flag `0x40` is set and the per-key effect isn't live. *confirmed*

- For each of the 19 effect options not masked by `LedMask` (F75: `0x22100`, which masks options 9, 14 and 18; bit `n` masks list position `n`):
  - `row = ` the option's first `LedOpt` number (its `0x0a` value)
  - 7 colours from the option's colour list go to `row × 21 + slot × 3`, each as R, G, B in `RGBIndex` order (F75: `0,1,2`)
- The default colour list is red, green, blue, yellow, magenta, cyan, white. A `LedOptN` line can override it with colour triples after its seventh number (the F75's lines don't).
- 420 bytes (20 rows) are built. With `CRC=1` they are copied into 512 bytes with `5A A5` at 506 and sent as 512. Without `CRC=1` the 420 bytes are sent as is.
- Slot 0 of a row is the effect's chosen colour, because the settings page always selects slot 0 ([§7](#7-settings-page-128-bytes)).

The per-key option's value is 21, so its row (441–461) falls outside the 420 bytes that are sent. The per-key effect takes its colours from `0x06` instead.

So for **Fixed on in a custom colour** the driver writes the colour to row 1, slot 0 (offsets 21–23), then the settings page with `0x0a = 1` and nibble 0. That is exactly the app's custom path. The owner's table already has this shape (row 1: white, green, blue, yellow, magenta, cyan, white), so slot 0 had been changed to white before.

AulaSofwareLinux's description (3 bytes per LED) is wrong. RustamSheoran/aula-f75 (colour slots) and the F87 captures were right.

## 9. Effects

From `[KBINI]` `LedOpt1`–`LedOpt20`, read by `FUN_00411830`. Each line is stored as a 40-byte record, which also tells which field is which:

| Field | Profile comment | Stored at | Used for |
| --- | --- | --- | --- |
| 1 | `hw` | `+2` | byte `0x0a`, the colour-table row |
| 2 | `effect` | `+1` | only the driver's on-screen preview animation (`FUN_00431ca0`) |
| 3 | `speed` | `+3` | whether the UI offers speed |
| 4 | `light` | `+4` | brightness |
| 5 | `direct` | `+5` | direction |
| 6 | `random` | `+6` | random/colourful |
| 7 | `color` | `+7` | colour |

The names come from `text.xml` `tc_kb_ledN`, loaded by position (`FUN_0042edc0`). *inferred, the loop uses the position*

| # | Name | `0x0a` | Slot (offset) | Preview | Speed | Light | Dir | Random | Colour |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Fixed on | 1 | 0 (`0x3a`) | 1 | – | ✓ | – | ✓ | ✓ |
| 2 | Respire (breathing) | 2 | 1 (`0x3c`) | 3 | ✓ | ✓ | – | ✓ | ✓ |
| 3 | Rainbow | 3 | 2 (`0x3e`) | 2 | ✓ | ✓ | – | – | – |
| 4 | Flash away | 4 | 3 (`0x40`) | 19 | ✓ | ✓ | – | ✓ | ✓ |
| 5 | Raindrops | 5 | 4 (`0x42`) | 15 | ✓ | ✓ | – | ✓ | ✓ |
| 6 | Rainbow wheel | 6 | 5 (`0x44`) | 13 | ✓ | ✓ | – | ✓ | ✓ |
| 7 | Ripples shining | 7 | 6 (`0x46`) | 20 | ✓ | ✓ | – | ✓ | ✓ |
| 8 | Stars twinkle | 8 | 7 (`0x48`) | 16 | ✓ | ✓ | – | ✓ | ✓ |
| 9 | Shadow disappear | 9 | 8 (`0x4a`) | 18 | ✓ | ✓ | – | ✓ | ✓ |
| 10 | Retro snake | 10 | 9 (`0x4c`) | 5 | ✓ | ✓ | – | ✓ | ✓ |
| 11 | Neon stream | 11 | 10 (`0x4e`) | 7 | ✓ | ✓ | – | ✓ | ✓ |
| 12 | Reaction | 12 | 11 (`0x50`) | 17 | ✓ | ✓ | – | ✓ | ✓ |
| 13 | Sine wave | 13 | 12 (`0x52`) | 12 | ✓ | ✓ | – | ✓ | ✓ |
| 14 | Retinue scanning | 14 | 13 (`0x54`) | 8 | ✓ | ✓ | – | ✓ | ✓ |
| 15 | Rotating windmill | 15 | 14 (`0x56`) | 28 | ✓ | ✓ | – | – | – |
| 16 | Colorful waterfall | 16 | 15 (`0x58`) | 30 | ✓ | ✓ | – | – | – |
| 17 | Blossoming | 17 | 16 (`0x5a`) | 14 | ✓ | ✓ | – | – | – |
| 18 | Rotating storm | 18 | 17 (`0x5c`) | 29 | ✓ | ✓ | – | ✓ | ✓ |
| 19 | Self-define (per-key) | **21** | 18 (`0x5e`) | 0 | – | – | – | – | – |
| 20 | OFF | **0** | none | 0 | – | – | – | – | – |

**Brightness**: `Light=0..9` maps to `LightHW=0..9`, the slot's first byte.

**Speed**: `Speed=0..4` maps to `SpeedHW=0..4`, the high nibble of the second byte.

**Sleep**: `SleepUI=60,90,120,180,240,300,600,900,1200` seconds maps to `SleepHW=2,3,4,6,8,10,20,30,40`, so one unit is 30 s.

No F75 effect offers a direction.

**Masked effects.** `LedMask` is read twice, into the device (`FUN_00411830`) and into the UI (`FUN_0040fd80`). The effect list (`FUN_004305d0`) calls `CTreeCtrl::InsertItem` for an effect only when its bit is clear, and the colour-table build skips masked rows. So on an F75 the driver never offers Shadow disappear (9), Retinue scanning (14) or Rotating storm (18). The first version of this report read the mask as "no colour-table row, colourful only"; the app then offered them, and selecting them could leave the keys dark. It no longer does. *confirmed*

To select an effect, the driver writes its value to `0x0a`, sets `0x09` (1 only for per-key), and rewrites all 19 slots from its state ([§7](#7-settings-page-128-bytes)). *confirmed*

## 10. Per-key colour

The per-key effect is option 19 (`GaoshouIndex=18`, 0-based). Selecting it sets `0x0a = 21`, `0x09 = 1` and `0x0b = 0x20 + group`.

Its colours travel with **`0x06`, parameter = group** (`GaoshouGroupNum=1` for the F75, so group 0 only), 378 bytes, written by `ApplySetting` for every group marked dirty. *confirmed*

The layout is **planar, by LED index**: the red plane is bytes 0–125, green 126–251, blue 252–377 (`GameRGBIndex=0,1,2` gives the plane order). Each key's colour goes to `plane + LED index` (the `[KEY]` LED index, [§12](#12-keys-leds-and-the-key-matrix)). Keys without a colour are 0.

The driver's default per-key preset (`GaoshouKey1=1b,57,41,53,44,26,28,25,27`, `clrGaoshou=255,0,0`) lights Esc, W, A, S, D and the four arrows red.

Reading back is `0x86` with the same parameter and length. *inferred, symmetric with the other reads; the driver's use of it was not traced*

## 11. Direct LED frames

`0x08`, parameter 0, 378 bytes = 126 LEDs × 3, **interleaved** R, G, B at `LED index × 3` (`RGBIndex` order).

- sent with the 7 ms wait, and only while the device object's connection type is 1, i.e. on the cable (`FUN_0046f2e0`, `FUN_0048c770`)
- the F75 driver sends it for its music effects (`ShowMusic` defaults to on; the key groups are in `Dev/kb/fr/ET`)
- the frame rate follows the audio, with no fixed period
- the "real-time effects" thread (`ShowRtEffect`) is off for the F75

Over the dongle the driver instead sends small "music" packets: one colour plus a list of keys. *confirmed*

OpenRGB and OpenAula send the same 378-byte frame. The driver doesn't select an effect before streaming. Whether the firmware shows frames on top of any effect, and how fast it accepts them, is not settled here.

## 12. Keys, LEDs and the key matrix

**`[KEY]` lines** (`FUN_00413470`): `Kn = left, top, right, bottom, type, code, modifier, matrix[, led]`.

- the rectangle is in decimal; type, code and modifier are hex
- with one trailing number (as in the F75 profile) it is both the matrix index and the LED index
- type `0x02` is a keyboard key given as a Windows virtual-key code

The F75's 82 keys, `index = key`. The index is `column × 6 + row`, where row 0 is the F-key row:

```
0 Esc      1 `       2 Tab     3 Caps    4 LShift  5 LCtrl
7 1        8 Q       9 A      10 Z      11 LWin
12 F1     13 2      14 W      15 S      16 X      17 LAlt
18 F2     19 3      20 E      21 D      22 C
24 F3     25 4      26 R      27 F      28 V
30 F4     31 5      32 T      33 G      34 B      35 Space
36 F5     37 6      38 Y      39 H      40 N
42 F6     43 7      44 U      45 J      46 M
48 F7     49 8      50 I      51 K      52 ,      53 RAlt
54 F8     55 9      56 O      57 L      58 .      59 Fn
60 F9     61 0      62 P      63 ;      64 /
66 F10    67 -      68 [      69 '      70 RShift
72 F11    73 =      74 ]      75 \      76 ISO <>  77 Left
78 F12    79 Bksp   81 Enter  82 Up     83 Down
84 Knob   85 Del    86 PgUp   87 PgDn   88 End    89 Right
```

**Matrix write** (`ApplySetting` + `FUN_0049b3d0`): `0x03`, parameter = layer 0–3 (layers in `LayerMask`, F75: 0, are skipped), 512 bytes = `MatrixLen` (128) little-endian 32-bit codes, at the key's matrix index. With `CRC=1` the last code is `0xA55A0000`, i.e. bytes 508–511 = `00 00 5A A5`.

The layers are `[KEY]` (base) and the `[FNn]` sections, loaded by `FUN_00413830` three times. The F75 profile has `[FN1]`. *Layer numbering beyond "0 = base" is inferred.*

**Key codes**, as bytes on the wire (`keyinfo_to_hardware_code`, `FUN_0049a920`; `[FNn]` entries of type `0x09` are written high byte first, so `0x00080008` is the wire bytes `00 08 00 08`, after a byte swap in `FUN_00468420`):

| Byte 0 | Kind | Bytes 1–3 | Examples |
| --- | --- | --- | --- |
| `00` | keyboard | modifier bits (1 Ctrl, 2 Shift, 4 Alt, 8 Win; right-hand ones `0x10`–`0x80`), then HID usages | Win+E = `00 08 00 08`, Alt+F4 = `00 04 3d 00`, Win+L = `00 08 0f 00` |
| `01` | mouse | button or action, then parameters | `01 01 01 00`, `01 03 01 00` (which button each is: inferred) |
| `02` | consumer (media) | `00`, usage high, usage low | play/pause `02 00 00 cd`, volume up `02 00 00 e9`, calculator `02 00 01 92` |
| `03` | macro | mode (1 = n times, 2 = while held, 4 = until a key), count, macro number − 1 | |
| `05`, `07`, `08`, `0d`, `0e`, `10` | special functions (LED and profile controls, `Fn`) | | Fn+Esc in the F75 profile: `07 00 00 04` |

*Kinds `00`, `02` and `03`, and the byte order, are confirmed. The meaning of each special code is inferred from the table in `FUN_0049a920` and the profile's `[FN1]`.*

## 13. Macros

**Record**, built by `StMacro_To_HdMacro` (`FUN_0049b000`):

- 1 byte: name length in bytes
- the name in UTF-16LE (up to 30 characters)
- 4 bytes per action:
  - byte 0: `type << 4 | delay >> 16`, plus bit `0x80` for a key or button release
  - bytes 1–2: the rest of the delay in ms, big endian (20 bits in total, at most `0xFFFFF`)
  - byte 3: the code

Action types:

| Type | Action | Byte 3 |
| --- | --- | --- |
| 1 | key | HID usage. Modifiers are `0xE0`–`0xE7`; other keys go through a 115-entry virtual-key-to-usage table at `0x0061a288` |
| 2 | mouse button | mask: 1 left, 2 right, 4 middle, 8 back, `0x10` forward |
| 3 | X move | signed amount |
| 4 | Y move | signed amount |
| 5 | wheel | signed amount |

**Buffer**, assembled in `FUN_0049b3d0` and sent whole with `0x05`, `MacroBufferSize` bytes (default 4096 = 8 packages):

- a table of `(offset, size)` 16-bit pairs, one per macro, with offsets counted from the start of the buffer
- then the records
- zero padding to the end

A key bound to macro *n* gets code `03 mode count n−1` ([§12](#12-keys-leds-and-the-key-matrix)). *confirmed*

## 14. Battery and firmware version

**Battery**: `06 87 02 00 01 00 02 00` returns 2 bytes:

- level
- status: the driver reports a flag that is set when the high nibble is non-zero and the low nibble is 0 (probably "charging", *inferred*)

The F75 profile hides it (`ShowPower=0`). *confirmed*

**Firmware version**: the `VersionNumber` from `HidD_GetAttributes`, i.e. the USB `bcdDevice` (`FUN_00499310`, logged as `FW Version`). WebHID doesn't expose it. *confirmed*

## 15. The 2.4 GHz dongle

When a dongle (`VID_Wireless`/`PID_Wireless`, F75: `3554:FA09`) reports a paired keyboard, `OnNewDongle` (`FUN_0040cc80`) creates a `CDev3632`. Same methods, different transport (`FUN_00493d60`, `FUN_004940f0`, `FUN_00494c20`):

- 20-byte interrupt **output** reports (`WriteFile`), answered by input reports (`ReadFile`), not feature reports
- data packet: `13 cmd total index (flag << 4 | len) data[14] sum`, where `sum` is the 8-bit sum of bytes 0–18
- replies carry the command (bit 7 = checksum error, which makes the driver resend), the totals and up to 14 data bytes
- a 128-byte settings page is 10 packets, as the F87 captures showed
- the online check is report `0x15`, command 7

Command numbers differ from the cable (`CDev3632::vftable` at `0x006221dc`):

| Wired | Dongle write / read |
| --- | --- |
| matrix `0x03`/`0x83` | `0x01` / `0x41` |
| per-key colour `0x06`/`0x86` | `0x02` / `0x42` |
| macros `0x05`/`0x85` | ? / `0x43` |
| settings `0x04`/`0x84` | `0x04` / `0x44` |
| colour table `0x0a`/`0x8a` | `0x09` / `0x49` |
| battery `0x87` | – / `0x4a` (2 bytes) |
| screen `0x0b` | `0x0b` |
| reset `0x11` | `0x06` |
| direct LEDs `0x08` | `0x88`, 10 ms wait |

*confirmed for the transport and the numbers. Which dongle the F75 ships with, and that it answers exactly this, is inferred from the profile.* The app refuses output reports and report `0x13`, so none of this can be sent.

## 16. Dangerous paths

| Path | In `OemDrv.exe` | Can it happen to an F75 with AULA's driver? | How the app refuses it |
| --- | --- | --- | --- |
| Bootloader entry (`05 75 …` on report `0x05`) and flashing | Not present. Every feature report in the driver uses ID 6/9 (`CDevG5KB`), 9 (mouse) or 7/8 (another family). | Only through `Update.exe`, launched by the settings dialog (`FUN_00472810`) when `FwVerNeedToUpdate` ≥ the board's `bcdDevice`, the board is wired, and `Update.exe` exists. `ForceUpdate=1` skips the question; `=2` closes the app if the user declines. The F75 profile comments out both keys and the package has no `Update.exe`. | Report `0x05` is never on the allowlist; `test/safety/allowlist.spec.ts` sends the updater's frames. |
| Online firmware download | `UpdateThread` (`FUN_00463d60`) fetches `http://120.79.152.79/update/`, plain HTTP with no signature check, and downloads firmware for profiles whose `UID=` the server lists. | No: the F75 profile has no `UID=`. | n/a (the app has no update path) |
| Factory reset `0x11` | `06 11 00 00 01 00 01 00 00`, only with `CmdReset=1`, before writing defaults. | No: the F75's Reset button rewrites defaults through the normal writes instead. | Not on the allowlist; the safety test sends this exact frame. |
| Key matrix, macros | A wrong matrix can leave keys dead (recoverable with the board's own `Fn+Esc` reset, per the README). | Normal use. | Not on the allowlist. |
| Cloud features | `logon.php`, `submitprofile.php`, `queryprofile.php`, `submitmacro.php`, `modifypsd.php` (the account password, not the device identity) | Off (`EnableYun=0`) | n/a |

The driver can't brick an F75 by itself. A firmware update needs AULA to ship an `Update.exe` and a profile change.

## 17. Checked against the app

| App | Driver | Result |
| --- | --- | --- |
| `wired.ts` frame, report ID, 520 bytes, header, read = SET then GET | §5 | matches |
| `TRANSFER_DELAY_MS = 20`; app retries 3 times, 70 ms apart | §5 | matches |
| identity request `06 82 01 00 01 00 06 00`, F75 = `03 00 00 00 00 cd` | §4 | matches |
| device checks: usage page `0xFF00`, feature report `0x06` | §4 | matches |
| `settings.ts` `0x0a`, Fixed on = 1, slot at `0x3a`/`0x3b`, colour nibble, `COLORFUL = 7` | §7 | matches. The comment's "position in the list" is true for 1–18 only; it now says what the byte really is |
| slot of an effect = `effect − 1` | slots go by list position | fixed: the effect list (now `EFFECTS` in `src/protocol/effects.ts`) has the 19 values in slot order, so per-key (21) maps to slot 18 and off (0) to none |
| setting Fixed on leaves `0x09` alone | the driver writes `0x09 = 0` for every effect but per-key | **fixed**: the colour plan (now `planLighting`) clears `0x09`; new test "leaving the per-key effect clears its flag, as AULA's driver does" (`test/static-color`). It fails without the fix |
| colour table: rows of 7, row 1 = Fixed on, custom colour in slot 0, `5A A5` at 506 | §8 | matches; comments no longer call it unconfirmed |
| allowlist: five commands, everything else refused | §6, §16 | matches; the safety test now also sends the driver's reset frame and the per-key, streaming, screen and battery commands |
| app offered effects 9, 14 and 18 (as colourful only) | `LedMask` hides them on the F75 (§9) | **fixed**: `supported` is false for them in `effects.ts`; the lighting pane doesn't list them and `planLighting` refuses them. Test "the effects AULA's driver hides on the F75 are not offered" (`test/lighting`) |
| writes 20 ms apart, read back 20 ms after the last write | waits 120 ms before the colour table, 30 ms before per-key colours, 60 or 130 ms before the settings page, then 500 ms (§4) | **fixed**: `keyboard.ts` waits the same, and reads back after 500 ms. The owner's F75 sometimes went dark after a change that read back correctly. Test "a change is paced like AULA's driver" (`test/lighting`) |

Source tag for the code comments: `[DRV]`, this binary.

## 18. What each next feature needs

Every feature below needs new allowlist rules. Each rule must name its exact command, parameter, length and payload check, with this report as the source (CLAUDE.md: no command without a source).

### All effects

- **Status (2026-10-14)**: built, the lighting pane (`src/protocol/effects.ts`, `planLighting`).
- **Write**: `0x0a` = the effect's value (`EFFECTS` in `src/protocol/effects.ts`), `0x09 = (value == 21)`, keep the rest of the page. Same `0x04` write as today, so no new command.
- **Confirmed**: values, slots, which controls each effect takes (§9).
- **Unknown**:
  - how the firmware treats a value outside the list
  - whether it needs the matching colour-table row filled for effects with a colour (the driver always writes the table too)

### Brightness and speed

- **Status (2026-10-14)**: built, in the lighting pane.
- **Write**: slot byte 0 = brightness 0–9, slot byte 1 high nibble = speed 0–4, for the effect's slot. `0x04` only.
- **Confirmed**: field positions and ranges (§7, §9).
- **Unknown**: whether speed matters for Fixed on (the profile hides it).

### Colour per effect

- **Status (2026-10-14)**: built, in the lighting pane.
- **Write**: row = effect value, slot 0 = colour, nibble 0; or nibble 7 for colourful. `0x0a` and `0x04`, both already allowed.
- **Confirmed**: §8.

### Per-key painter

- **Status (2026-10-14)**: built, the keys pane (`src/protocol/per-key.ts`, `planPerKey`), with allowlist rules for `0x06`/`0x86`, parameter 0, 378 bytes. Not yet tried on a board.
- **Write**:
  - settings: `0x0a = 21`, `0x09 = 1`, `0x0b = 0x20`
  - then `0x06`, parameter 0, 378 bytes, planar R/G/B by LED index (§10)
- **Needs**: a new rule for `0x06` (parameter 0, length 378) and the LED index table (§12).
- **Unknown**:
  - the `0x86` read-back layout
  - whether planes must be written before or after the page (the driver writes them first)
  - the firmware's behaviour on LED indices with no key (6, 23, 29, …)

### Key remapping

- **Write**: `0x03`, parameter = layer, 512 bytes of 32-bit codes at the matrix index, `00 00 5A A5` at the end. Read it first with `0x83` and change only the keys asked for.
- **Confirmed**: frame, size, marker, code format for keyboard, consumer and macro keys (§12).
- **Unknown**:
  - which layer numbers the firmware uses for `Fn`
  - the special-function codes
  - the reply format of `0x83`
- **Risk**: a bad matrix can disable keys, including `Fn`.

### Macros

- **Write**: `0x05` with the whole buffer (§13), then the matrix entries that point at it.
- **Confirmed**: record and buffer format.
- **Unknown**:
  - the buffer size the F75 firmware really has (the profile leaves the 4096 default)
  - limits on the number of actions
  - the `0x85` read

### Live effects

- **Write**: `0x08` frames, 378 bytes interleaved RGB by LED index, cable only.
- **Confirmed**: format (§11), same as OpenRGB's.
- **Unknown**:
  - the frame rate the firmware sustains
  - whether a particular effect must be selected first
  - what the board shows when frames stop
  - `0x0e`/`0x0f`
- Frames aren't stored on the board.

## 19. Open questions

1. Byte `0x16`: its meaning. The other page builder logs the same field as "Tap".
2. Bytes `0x60`–`0x7d`: firmware data the driver never writes. Possibly slots for firmware effects the profile doesn't list.
3. The debounce range: whether `ShowDebounce=0x04000101` means 1–4 ms with default 1.
4. `0x0e`, `0x0f`, `0x88`: no F75 caller found.
5. The layer numbering for `[FNn]` and how the firmware reaches them.
6. The exact dongle the F75 pairs with, and that its replies match `CDev3632`. Only matters for a wireless transport, which the app doesn't have.
7. The firmware's behaviour beyond what the driver sends: other effect values, partial matrices, frame rates. Only hardware can tell, so test with dry run off on the owner's board, one write at a time, with a backup.

## 20. Function index

| Address | Name (from logs, vtable or role) |
| --- | --- |
| `0040bb80` | FindOurDevice: picks the device class from `Fw=` |
| `0040c9a0` | wireless discovery |
| `0040cc80` | OnNewDongle: creates `CDev3632` |
| `00411830` | profile (`KB.ini`) parser: `[OPT]`, `LedOptN` |
| `00413470` | `[KEY]` reader |
| `00413830` | `[FNn]` layer reader |
| `0042edc0` | effect list UI (names `tc_kb_ledN`) |
| `00430fd0`, `00431ca0` | effect controls and on-screen preview |
| `00463d60` | UpdateThread: online driver and firmware update |
| `00464340` | update config from `120.79.152.79` |
| `0046f2e0` | PlayThread: real-time `0x08` frames |
| `00472810` | keyboard settings dialog: `Update.exe` check |
| `0048c770` | music effects: `0x08` frames |
| `00493d60`, `004940f0`, `00494c20` | `CDev3632` (dongle) transfers |
| `00494930` | dongle checksum |
| `00498fb0` | `CDevG5KB::FindHIDDevice` |
| `004993c0` | `CDevG5KB::AccessData` (write and read core) |
| `00499310` | firmware version (`bcdDevice`) |
| `00499600`–`0049a810` | command wrappers (§6) |
| `0049a920` | `keyinfo_to_hardware_code` |
| `0049b000` | `StMacro_To_HdMacro` |
| `0049b3d0` | FillMatrix: key layers and macro buffer |
| `0049b910` | `FillCfg_LowDaly` (other firmwares) |
| `0049bbf0` | settings page builder for the F75 |
| `0049c020` | `CDevG5KB::ApplySetting` |
| `0049cc30` | `AccessData_Page` (`0x0c`) |
| `0049cfd0` | SetGIFParam (`0x0d`) |
