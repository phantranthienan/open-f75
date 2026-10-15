# Ripples shining (preview 20, type 0x14)

Mode 7 in the F75 profile (`LedOpt7=7,20,1,1,0,1,1`). Code: `ripples-shining.ts`,
`createRipplesShining`. Line numbers are in decomp.c. How presses arrive is described in
`reactive-input.md`.

## Descriptor (FUN_00485860, 88303-88325)

The call is `FUN_00485860(colour, colourful)` (31944). The disassembly at 0x43228b..0x432295
confirms the arguments.

| Slot (byte offset) | Value | Meaning |
|---|---|---|
| [0] | 100 | Size |
| [1] | 0x14 | Type |
| [2] | 0xf | Timer period: **15 ms** |
| [3..8] (0x0c-0x20) | 0xff, 0xffff00, 0xff00, 0xffff, 0xff0000, 0xff00ff | Colourful choices: red, cyan, green, yellow, blue, magenta |
| [9] (0x24) | colour | Effect colour |
| [10] (0x28) | | Last random colour |
| [11..18] (0x2c-0x48) | | The diamond's 4 points: top, left, bottom, right |
| [0x13] (0x4c) | 0x14 | Growth per tick: 20 picture units |
| [0x14] (0x50) | 0 | Active |
| [0x15] (0x54) | -1 | Pressed LED |
| [0x16] (0x58) | 10 | Never read by the engine or the press handler (*unknown*) |
| [0x18] (0x60) | flag | Colourful |

## Press (FUN_0041e640, 20110-20115, with FUN_0041e870, 20121)

- The points start at the key rectangle's edge midpoints: top `(l + (r-l)/2, t)`, left
  `(l, t + (b-t)/2)`, bottom `(cx, b)`, right `(r, cy)`, with integer halves.
- The press sets active = 1 and pressed = led.
- There is a single diamond, so a new press restarts the ripple from the new key.
- The handler also stores red (0xff) in the key's record. Nothing repaints before the next tick
  overwrites it, so the port leaves that out.

## Tick (FUN_0041bbb0, 18711-18778; disasm 0x41c5f4..0x41c7a0)

Nothing happens unless the diamond is active. When it is:

1. Top.y, bottom.y, left.x and right.x each move outwards by 20.
2. `CreatePolygonRgn(points, 4, ALTERNATE)` (FUN_0041e960, 20183) turns them into a region.
3. FUN_0041ba00 (17971) counts how many of the client rectangle's 4 corners lie in the region. If
   all 4 do, the ripple is done: active = 0 and every LED goes off.
4. Otherwise, after `srand(GetTickCount())`, each LED's rectangle (`+0x9c`) is tested the same way:
   - 0 or 4 corners inside: off;
   - 1–3 corners inside (the edge crosses the key): lit with [9], or in colourful mode a fresh pick
     from [3..8] different from the last one, for every key on every tick.
5. On the first tick, the pressed key gets [9] and pressed is set back to -1.

Alpha is not touched. The starter left it at 255 or 200, which is brightness, applied by the
caller.

## What it looks like

- A diamond-shaped ring, about one key thick, spreads from the pressed key.
- From a central key it crosses the whole board in roughly 20-25 ticks (about 0.35 s).
- In colourful mode, the ring sparkles: each key changes colour on every tick.

## Colour, speed, unit files

- Colour: [9], or the per-key random picks in colourful mode.
- Speed: none is passed, so the period is a fixed 15 ms. Following the app's rule (`intervalForSpeed`), the port uses
  30, 21, 15, 11, 8 ms for speeds 0 to 4. The 20-unit growth per tick stays the same.
- No unit file is used.

## Approximations (*inferred*)

- **Client rectangle.** The port uses the keys' bounding box, not the preview window. The window
  is larger, so the driver keeps ticking a little longer with every key already dark. On screen the
  result is identical.
- **PtInRegion.** The port uses an exact point-in-quad test that counts the boundary as inside.
  GDI rasterises the polygon, so results can differ by about a pixel at the edges.
- **Pressed key in colourful mode.** The driver lights it with [9], which is whatever the colour
  picker holds. The port has no colour in that mode, so it picks a random one.

## Without presses

The driver shows nothing: nothing sets "active" except a press, and the shipped `Cfg.ini`
disables presses.

**Not from the driver:** after 2 s with no real press, the port presses a random key whenever no
ripple is running, after a 150-600 ms pause. It starts on the first tick.
