# Retro snake (preview 5, descriptor type 5)

Line numbers are in `decomp.c`. Addresses come from `objdump -d` of OemDrv.exe, needed where Ghidra dropped the register and stack arguments.

## Dispatcher (FUN_00431ca0, 31849-31855)

- It calls `FUN_00432970` with the file name in ECX, `paoma_unit.txt` (string 0x612138, call at 0x431e5c). The file is not in `Dev/kb/fr/Cartoon/`. The loader builds `<device>\Cartoon\<file>` (32210-32216). When the file is missing it writes nothing and returns 0 (asm 0x432a6a jumps to the epilogue with EAX = PathFileExistsW = 0).
- It then calls `FUN_00485350(colour, colourful, units, unitCount = 0)`. ESI points to the descriptor and ECX to the profile's `KeyLineStart` bytes (asm 0x431e66-0x431e88).
- If `KbDrawType == 1`, descriptor[0x107] is set to 0xff (31852-31853). The F75 profile has `KbDrawType=0` (loaded at 12024), so it stays 200.

## Descriptor (FUN_00485350, 88004-88212)

| Slot | Value |
| --- | --- |
| [0] | 0x42c (88034-88035) |
| [1] | 5 |
| [2] | **10 ms** (88037) |
| [3..] | the path, as virtual keys |
| [0x103] | position |
| [0x104] | path length |
| [0x105] | colour |
| [0x106] | last random colour |
| [0x107] | head alpha, 200 |
| [0x108] | 10 (unused by the engine) |
| [0x10a] | colourful flag (88208-88211) |

**Fallback path (no unit file).** `unitCount - 1 > 0x18` takes the fallback branch. With no `KeyLineStart` in the profile, the six row seeds are VK `0x70 0x31 0x51 0x41 0x58 0x20`: F1, 1, Q, A, X, Space (88049-88063).

For each seed, `FUN_0041e4f0` (19936) finds the seed's record. It takes `c = top + (bottom-top)/2` and collects every record with `top <= c <= bottom`, sorted by left.

The path is:

1. The rows top to bottom, alternating direction, with the first row left to right.
2. Then rows n-2 down to 1, still alternating (88082-88142).

On our keys the path is 138 steps: Esc..F12, Del..\`, Tab..PgUp, PgDn..Caps, LShift..End, Right..LCtrl, LShift..End, PgDn..Caps, Tab..PgUp, Del..\`.

## Engine tick (FUN_0041bbb0, 18317-18356; asm 0x41bf02)

1. Every one of the 0x90 records with alpha > 0 loses 8 alpha. At <= 0 its colour is cleared (18320-18326).
2. `FUN_0041b530` (17691) finds the record whose VK is `path[pos]`. That record gets the colour [0x105], or in colourful mode `DAT_00652488[rand() & 3]` re-drawn until it differs from [0x106] (18332-18343). Its alpha is set to 200 (18349).
3. `pos = (pos + 1) % length` (18351-18354).

This gives a 25-key tail: 200, 192, ... 8.

`DAT_00652488` (.data, read with `objdump -s`) holds red, green, blue, magenta, cyan and yellow as COLORREF.

## Timing, colour, speed

- **First frame.** `FUN_0041ba70` sets every LED dark at alpha 200 (18032-18045) and runs one tick before `SetTimer(0x7a, 10)` (18049-18051). The port runs one tick in `create`.
- **Speed.** The timer handler (asm 0x41b550) runs exactly one tick per WM_TIMER, and the dispatcher never reads speed. So speed is ignored by the driver. The port uses `10 * 2^((2 - speed) / 2)` ms.
- **Alpha.** The port draws `alpha / 200` (200 is the driver's normal fill opacity, 0xc8) as the brightness of a lit key.
- **Not reactive.** Type 5 is not in the 0x11-0x14/0x18 set (18057-18062), and FUN_0041e640 does not handle it.

## Inferred

- *inferred:* we use our own key geometry for the rows. The driver uses the FR profile's rectangles, which match ours for every key both layouts share.
- *inferred:* Windows rounds a 10 ms timer up to about 15.6 ms, so the real preview runs about 1.5x slower than the descriptor says.
