# Colorful waterfall (F75 LedOpt16, preview 30, descriptor type 0x1e)

Port: `colorful-waterfall.ts`, on the shared engine in `palette-cycle.ts`. Line numbers are decomp.c; `0x…` addresses are from `objdump -d OemDrv.exe`. The engine tick and starter are the same as in `blossoming.md`, section "One tick".

## What it looks like

Each of the six key rows is one unit cycling green → blue → magenta → yellow. Each colour holds for 2 ticks, then fades over 4 ticks. The top row leads and every row below follows 3 ticks (600 ms) later, so colour bands about two rows tall pour down the board. One cycle is 24 ticks (4.8 s at 200 ms).

## Dispatch and generator

- Dispatcher `FUN_00431ca0` case `0x1e` (31964-31967; asm 0x432340-0x432383). It calls `FUN_00486440(direction, engine)` with `ecx = dev+0x2d44` (the profile's `KeyLineStart` bytes, parsed at 12109 into `[ebp+0x2d44]`, asm 0x41258a) and `edi` = descriptor. **No unit file**, colour or colourful flag is involved.
- Direction is 0: LedOpt16 = `16,30,1,1,0,0,0`, and byte +5 is 0 (31834-31837).
- Generator `FUN_00486440` (88815-88910; asm 0x486440-0x486616):
  - Row anchors are VK F1, 1, Q, A, Z, LCtrl (0x4864c9-0x4864f1). If `KeyLineStart` is set, its 6 bytes are used instead; the F75 profile has no `KeyLineStart`.
  - For each anchor, `FUN_0041e4f0` (19936-20018) finds the anchor's LED record. It takes the anchor's vertical centre, `top + (bottom−top)/2` with integer division, and collects every key whose rectangle spans it (top ≤ y ≤ bottom), sorted by left edge. It returns their VKs.
  - Only rows that found keys become units (0x486553-0x486572).
  - On the US F75 the rows are: Esc+F-row (13 keys), number row (15), Tab row with \ and PgUp (15), Caps row with Enter and PgDn (14), Shift row with Up and End (14), bottom row (9). That is 80 keys, each once.

## Descriptor (0xe64 bytes, ints)

| Slot | Value |
| --- | --- |
| [0] | 0xe64 |
| [1] | 0x1e |
| [2] | **200 ms**, hard-coded (0x486494) |
| [7..10] | palette: 0xff00, 0xff0000, 0xff00ff, 0xffff = green, blue, magenta, yellow (0x4865db-0x4865f3) |
| [0xf] | 4 |
| [0x10] | hold A = 400 ms (`push 0x190`, 0x4865c9) |
| [0x11] | fade B = 800 ms (`mov edx,0x320`, 0x4865d6) |
| [0x12] | cycle = 1200·4 = 4800 ms |
| units | rows as above; [0x397] = 6 |
| [0x398] | alpha. The dispatcher sets 0xff or 0xaa (31966); ignored. |

`FUN_00484e00` is called with spread = float 3.0 (0x626e90). The step is (1200·3)/6 = **600 ms**. With direction 0, the bottom row gets 600 and the top row 3600, so the top row leads and the colour falls downward. A non-zero direction would make it rise.

## Options

- **Colour / colourful**: ignored by the driver, so ignored by the port.
- **Speed**: ignored by the preview (constant 200 ms). As the app does for every preview (`intervalForSpeed` in `src/ui/lib/animations/driver.ts`), the interval is `200·2^((2−speed)/2)`: 400, 283, 200, 141, 100 ms.
- **Randomness**: none. **Reactive**: no.

## Inferred

- Rows come from the caller's key rectangles (`x, y, w, h` → left, top, right = x+w, bottom = y+h), as `FUN_0041e4f0` does with the profile's `[KEY]` rectangles. These are the same numbers for every key both layouts share.
- On the US board this puts the backslash key in the Q row and Enter in the A row. That is a reading of the geometry, not something the driver shows: the driver package has only the FR picture.
