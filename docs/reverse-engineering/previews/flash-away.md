# Flash away (preview 19, type 0x13)

Mode 4 in the F75 profile (`LedOpt4=4,19,1,1,0,1,1`). Code: `flash-away.ts`, `createFlashAway`.
Line numbers are in decomp.c. How presses arrive is described in `reactive-input.md`.

## Descriptor (FUN_00488820, 90062-90344)

The call is `FUN_00488820(colour, colourful, 0, preview, 0, 0)`. The disassembly at
0x43220d..0x432227 confirms it; the decompiler shows only three arguments (31937).

| Slot | Value | Meaning |
|---|---|---|
| [0] | 0x4080 | Size |
| [1] | 0x13 | Type |
| [2] | 0x1e | Timer period: **30 ms** |
| [3 + r·0x91 + i] | VK codes | 6 row tables |
| [3 + r·0x91 + 0x90] | count | Length of row *r* |
| [0x369 + c·0x91 …] | VK codes | 22 column tables (see below) |
| [0xfdf + 6s …] | | 10 wave slots `{row, left, right, col, up, down}`. The four counters start at -1 (90096-90135). |
| [0x101b] | colour | Effect colour |
| [0x101c] | | Last random colour |
| [0x101d] | flag | Colourful |
| [0x101e] | 0xdc | Alpha of a newly lit key (220) |
| [0x101f] | 0x2d | Alpha lost per tick (45) |

**The column tables stay empty for this effect.** They are filled with a full-size 104-key layout
only when the third argument is not 0 (`if (param_3 != 0)`, 90183 on). That happens for type 0x1a,
preview 26 (31941), not for preview 19. Flash away therefore runs only along rows.

## Rows (FUN_0041e4f0, 19936-20018)

- There is one row per seed key, in this order: F1, 1, Q, A, X, Space (VK 0x70, 0x31, 0x51, 0x41,
  0x58, 0x20; disasm 0x4889c5..0x488a26).
- A row holds every key whose rectangle satisfies top ≤ the seed's `top + (bottom-top)/2` ≤ bottom,
  sorted by left edge.
- A missing seed gives no row, and the remaining rows close up.
- On our US F75, the 6 rows cover all 80 keys:
  - Esc, F1–F12
  - \` to Backspace, Delete
  - Tab to \\, PgUp
  - Caps to Enter, PgDn
  - LShift to RShift, Up, End
  - LCtrl, LWin, LAlt, Space, Fn, RCtrl, Left, Down, Right

## Press (FUN_0041e640, 20083-20109; disasm 0x41e781..0x41e80d)

1. FUN_004887a0 (89990) finds the first row containing the key, and the key's position *p* in it.
2. The first slot whose left and right counters are both below 0 is claimed:
   `row = r, left = right = p`.
3. If all 10 slots are busy, the press is dropped.

FUN_004887e0 (90026) looks the key up in the empty column tables and finds nothing, so the
up/down counters stay at -1.

## Tick (FUN_0041bbb0, 18585-18708)

First, `srand(GetTickCount())`. Then, for each slot in order:

- **Left counter ≥ 0:** light `rows[row][left]` with colour [0x101b] and alpha 220, then
  decrement the counter. In colourful mode, the colour is a pick from DAT_00652488 that differs
  from [0x101c]. That pick also becomes the tick's pick (`local_ec`).
- **Right counter ≥ 0:** light `rows[row][right]`, then increment the counter. Once it reaches
  the row's length, it becomes -1. In colourful mode, the colour is the tick's latest left pick,
  or a fresh pick if this tick has none yet. A fresh pick updates [0x101c] but not the tick's
  pick.
- **Up and down counters:** the same, using the column tables. They are always -1 here.

After the slots, every LED with colour ≠ 0 and alpha ≠ 0 loses 45 alpha. Below 0, the LED goes off.

DAT_00652488, read from the exe's `.data`, holds 0xff, 0xff00, 0xff0000, 0xff00ff, 0xffff00 and
0xffff: red, green, blue, magenta, cyan, yellow.

## What it looks like

- Two flashes leave the pressed key and run left and right along its row at one key per 30 ms.
- Each flash drags a 4-key tail: alpha 175, 130, 85, 40 (the fade also runs on the tick a key
  lights).
- In colourful mode, both flashes share one colour, and that colour changes at every step.
- Up to 10 waves can run at once.

## Colour, speed, unit files, alpha

- Colour: [0x101b], or the random picks in colourful mode.
- Speed: none is passed, so the period is a fixed 30 ms. Following the app's rule (`intervalForSpeed`), the port uses
  60, 42, 30, 21, 15 ms for speeds 0 to 4.
- No unit file is used.
- Alpha is drawn as the fill alpha. The app shows alpha 200, the F75's normal fill opacity, as full
  strength (`withAlpha` in `src/ui/lib/animations/driver.ts`), so a flash's 220 is capped there
  (*inferred*, as for Reaction).

## Does it animate on its own? No

- The slots start empty, and only the press handler fills them.
- The timer handler (0x41b550) only calls the engine.
- The shipped `Cfg.ini` disables presses, so the driver's preview stays dark.

**Not from the driver:** after 2 s with no real press, the port presses a random key every
300-900 ms. It starts on the first tick.

## Open questions

- Type 0x1a (preview 26) shares this engine branch, but the press handler has no 0x1a case and the
  starter doesn't flag it. As far as the decompilation shows, that preview never lights. It is not
  ported here.
