# Neon stream (preview 7, descriptor type 7)

F75 option 11 (`LedOpt11=11,7,1,1,0,1,1`). Port: `neon-stream.ts`, `createNeonStream`.
Line numbers are decomp.c. Wherever the decompiler lost register arguments, the
claim was checked against an `objdump -d` of OemDrv.exe (addresses given).

## Call (dispatcher FUN_00431ca0)

- Line 31856: `FUN_00432970()` loads `Cartoon\stream_unit.txt` (string 0x612158), then
  `FUN_00485ec0(desc, randomFlag, colour, 0x3c, direction, unitCount)`, with the unit
  buffer in EAX (asm 0x431eb5-0x431ee5). The decompiler shows only the first three arguments.
- colour = `local_8224`, a COLORREF from `+0x5d10` (31810). randomFlag = `+0x5688` (31811).
- direction = `local_8220`: set to 0 (31834) and taken from `+0x5b1c` only when the option's
  "direct" byte is set (31837). The F75's is 0, so direction = **0**.
- Line 31859: alpha `desc[0x398]` becomes 0xff when device `+0x2eac` == 1.
- Line 32020: `FUN_0041ba70()` starts it.

## Unit file

- `FUN_00432970` (32171) builds `<device dir>\Cartoon\stream_unit.txt` and returns the unit
  count, or 0 when the file is missing (asm 0x432a6a and 0x432b21, `ret 8`). The F75 package
  has no stream_unit.txt. `ET/stream_h.txt` is read only by FUN_0048c770 (line 92709), which
  is not the preview.
- The generator falls back to the built-in table `FUN_00486010` (88696) when
  `count - 1 > 24` unsigned (88660), so a count of 0 falls back. That table has **20 units**
  (it returns 0x14) of virtual-key codes: one column of a full-size board per unit, Esc
  column first. The last four units are numpad keys.
- Key codes are matched against each LED record's `+0x94`, the VK from the profile's [KEY]
  table (lines 18158-18186). Mapped to our LEDs, units 16-19 are empty. VK 0xA5 (RAlt)
  lands on LED 53 and VK 0xFA (FN) on LED 59. VK 0xA3 (RCtrl), 0x5C, 0x5D and 0xE2 match
  nothing. *US adaptation*: the profile puts VK 0xDC on the ISO key (LED 75). Here it is the
  US backslash, LED 80. Without that, LED 80 would never light.

## Descriptor (FUN_00485ec0, 88629; asm 0x485ec0)

| Field | Value |
| --- | --- |
| `[0]` | 0xe64 bytes |
| `[1]` | 7 |
| `[2]` | period: **60 ms** (`push 0x3c`, asm 0x431ed2) |
| `[7..10]` | palette, n = 4 (see below) |
| `[15]` | n |
| `[16]` | hold A = 2 × period = 120 |
| `[17]` | fade B = 4 × period = 240 (EDX, asm 0x485fdf) |
| `[18]` | wrap = (A + B) × n = 1440 |
| `[0x13 + 36u ...]` | unit u's VK list, 0-terminated |
| `[0x33 + 36u]` | unit u's phase in ms |
| `[0x35 + 36u]` | unit u's current colour |
| `[0x397]` | unit count (20) |
| `[0x398]` | alpha: floor(160.0) = 160, minimum 50 (88654-88659) |

The palette, phases and timings are set by `FUN_00484e00` (87704, asm 0x484e00), with
EAX = n, EDX = B, ECX = period, and stack arguments A, 2.5f, direction, palette:

- Colourful (randomFlag ≠ 0): 0xff00, 0xff0000, 0xff00ff, 0xffff, which is green, blue,
  magenta, yellow.
- One colour: [c, c·3/10, c, c·3/10]. The dimming is `FUN_00484f90` (87804) with ESI = 3:
  each channel × 3 / 10, integer division.
- Unit spacing: trunc((A + B) × 2.5 / count) = trunc(900 / 20) = **45 ms**.
- With direction 0 the phases are assigned from slot `count` down to 0 (asm 0x484eb9).
  Unit u starts at (20 − u) × 45 (unit 0 = 900, unit 15 = 225). A value that reaches wrap
  resets to 0, but none does here.

## One engine tick (FUN_0041bbb0, shared branch 18154-18189)

1. `FUN_00484ef0(period)` (87764, asm 0x484ef0, ESI = desc + 0x1c). For each unit:
   - if phase ≥ wrap, subtract wrap;
   - i = phase / (A + B);
   - r = phase mod (A + B) − A;
   - colour = r < 0 ? palette[i] : `FUN_0040e4d0(B, r)`, a per-channel
     `trunc(from + r·float32((to − from)/B))` from palette[i] to palette[i + 1], or palette[0] after
     the last (10217, asm 0x484f3b-0x484f52). The `fistp` truncates rather than rounds: FUN_0040e4d0
     puts the FPU in chop mode first (`or eax,0xc00` at 0x40e52b), so the app truncates (`fade` in driver.ts);
   - phase += period.
2. For each unit whose first VK is non-zero, every LED whose VK matches takes the unit's
   colour and `desc[0x398]` as alpha. A later unit overwrites an earlier one.
3. `InvalidateRect`. Keys in no unit stay black, because the starter zeroed them (18044-18048).

The starter draws the first frame at once (18049). Then WM_TIMER 0x7a (handler at asm
0x41b550, mode `+0x1788` == 2) calls the engine every 60 ms.

## What it looks like

The board is cut into columns, and every column runs the same loop: it holds each colour
for 120 ms, then fades to the next over 240 ms. Colourful mode goes green, blue, magenta,
yellow and back to green. The left column is 45 ms ahead of its right neighbour, so the
colours sweep from left to right, about 1.3 columns per tick. The loop repeats every 24
ticks (1.44 s), and the visible 16 columns show about half of it at once. In one-colour
mode the colour pulses between full and 30 %, 2 pulses per loop.

## Speed, randomness, reactivity

- **Speed**: not used. The dispatcher passes a fixed 0x3c, and nothing in the generator
  or engine reads Speed. Following the app's rule (`intervalForSpeed`), 60 ms is treated as speed 2 and
  `interval = 60 × 2^((2 − speed)/2)`: 120, 85, 60, 42 and 30 ms for speeds 0-4. Each tick
  still advances the phase by 60 "driver ms".
- **Random**: none. The flag only picks the palette, and `options.random` is not used.
- **Reactive**: no. Type 7 is not in the starter's 0x11/0x12/0x13/0x14/0x18 list (18053-18058).
- Alpha (160 or 255) is the driver's drawing opacity for the preview only. Not ported:
  colours are full strength.

## Inferred / open

- *Inferred*: `+0x2eac` (alpha 255) is a display preference. Its meaning was not traced.
- VK 0xDC → LED 80 is a US-board choice, not driver behaviour. If keys were mapped by name
  instead, with `rctrl` = LED 59, LED 59 would take unit 12's colour rather than unit 10's.
  This port follows the driver, where LED 59 carries VK 0xFA.
