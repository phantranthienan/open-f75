# Sine wave (preview 12, descriptor type 0xc)

Line numbers are in `decomp.c`. Addresses come from `objdump -d` of OemDrv.exe.

## Dispatcher (31863-31868; asm 0x431f12-0x431f37)

- It calls `FUN_00488750(colour, 0x1e, colourful)` with ESI pointing to the descriptor.
- If `KbDrawType == 1`, descriptor[7] is set to 0xff. The F75 has `KbDrawType=0`, so it stays 200.
- No unit file is used.

## Descriptor (FUN_00488750, 89969-89986)

| Slot | Value |
| --- | --- |
| [0] | 0x3c |
| [1] | 0xc |
| [2] | **30 ms** |
| [3] | colour |
| [4] | 10 (brightness /10 for FUN_00484f90, so the colour is unchanged) |
| [6] | colourful flag |
| [7] | 200 (alpha) |

The engine fills the rest on its first tick, slots [8]..[0xe].

## First tick set-up (18359-18373; asm 0x41bff1-0x41c071)

`FUN_0041e330` (19818) gives the bounding box of all keys: left 27, top 33, w 626, h 243. From it:

| Slot | Formula | Value |
| --- | --- | --- |
| [0xb] | `trunc(left + 5)` | 32 |
| [0xc] | `trunc(top + h/2)` | 154 |
| [9] (amplitude) | `trunc(h/2 - 10)` | 111 |
| [10] (phase) | | 360 |
| [0xd] (sweep) | 360, or 450 if there are more than 90 keys (`FUN_0041e2e0`, 19779) | 360 |
| [0xe] | `(float)(w / sweep)` | |

The constants 5.0, 0.5, 10.0 and 8.0 and the degree-to-radian factor 0.0174532925 were read from .data.

## Each tick (18375-18423; asm 0x41c074-0x41c1f4)

1. Every record with alpha > 0 loses 50 alpha. At <= 0 its colour is cleared (18375-18383). A key is therefore lit for 4 ticks: 200, 150, 100, 50.
2. For `t = 0, 8, ... 360` (46 samples):
   - `x = [0xb] + floor((float)(t * [0xe]))`
   - `y = [0xc] + floor((float)(sin((float)((phase + t) * 0.0174532925)) * A))`
   - `FUN_005b3a90` is the CRT `_CIsin`. Its SSE2 body is the same routine as `_sin`: small x returns x, and the table index has no quarter shift. `FUN_005b3760` is floor and `FUN_005b2580` is ftol.
3. `FUN_0041e430` (19891) returns the first record whose rectangle contains the point (PtInRect, so the right and bottom edges are excluded). The space bar is special: it only counts inside a box as wide as record 0 (26 units), centred on the bar.
4. **Only a dark key is lit** (`colour == 0`, 18403). It gets the colour [3], or `DAT_00652488[rand() % 6]` in colourful mode (6 colours including cyan and yellow), and alpha [7] = 200 (18406-18411). Keys under a still part of the curve therefore re-light every 4 ticks.
5. The phase drops by 20. Once it is negative it returns to 360 (18418-18422). A cycle is 19 ticks (360 and 0 draw the same curve), about 570 ms. The wave moves left to right.

## Timing, colour, speed

- The first frame is drawn on start (`FUN_0041ba70`, 18049), and the port does the same.
- **Speed** is ignored by the driver (the timer handler at asm 0x41b550 runs one tick per WM_TIMER). The port uses `30 * 2^((2 - speed) / 2)` ms.
- **Alpha.** The port draws `alpha / 200` as brightness: 1, 0.75, 0.5, 0.25.
- **Not reactive.**

## Inferred

- *inferred:* record 0's width (Esc, 26) is taken from our lowest LED index. Records are assumed to be in LED order, as the other ports assume.
- *inferred:* the port emulates the x87 float32 stores with `Math.fround`, but not the 80-bit intermediates. A sample on an exact key edge could land one unit off.
