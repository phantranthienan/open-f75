# Reaction (preview 17, type 0x11)

Mode 12 in the F75 profile (`LedOpt12=12,17,1,1,0,1,1`): speed, brightness, colourful flag and
colour, no direction. Code: `reaction.ts`, `createReaction`. Line numbers are in decomp.c. How
presses reach the engine is described in `reactive-input.md`.

## Descriptor (FUN_00485720, 88219-88233)

The dispatcher calls it as `FUN_00485720(colour, colourful)` (31917-31920). The decompiler dropped
the arguments; the disassembly at 0x43218c..0x432194 shows them.

| Slot | Value | Meaning |
|---|---|---|
| [0] | 0x4a0 | Size: 296 ints |
| [1] | 0x11 | Type |
| [2] | 0x32 | Timer period: **50 ms** |
| [3] | colour | COLORREF from the picker (`+0x5d10`) |
| [4] | flag | Colourful (`+0x5688`) |
| [5] | 0xdc | Alpha given to a pressed key (220) |
| [6] | 0x28 | Alpha lost per tick (40) |
| [8 + led] | 0 | Colour slot per LED (0x90 of them) |
| [0x98 + led] | 0 | Alpha slot per LED (0x90 of them) |

## Press (FUN_0041e640, 20059-20078)

- The key's alpha slot is set to 220.
- Its colour slot is set to [3]. In colourful mode, `srand(time(NULL))` runs first, then
  `rand() % 6` picks from {0xff, 0xffff00, 0xff00, 0xffff, 0xff0000, 0xff00ff}: red, cyan, green,
  yellow, blue, magenta.
- `time()` counts whole seconds, so **every press within the same second gets the same colour**.
  We reproduce this with seconds of tick time: elapsed ms = ticks × interval (*inferred*
  equivalence: the port has no clock).
- The LED record is not touched until the next tick.

## Tick (FUN_0041bbb0, the else-branch of `!= 0x11` at 18541, body 19721-19741)

For each LED whose alpha slot is not 0:

1. The slot loses 40. A value below 1 becomes 0.
2. The record gets the slot's colour and alpha.

A press is therefore seen on the next tick at alpha 180, then 140, 100, 60 and 20, then off: five
visible frames, 250 ms. Pressing a lit key restarts it at 220.

## Starter and paint

- The starter (17999-18062) zeroes every record's colour and sets every alpha to 255 or 200
  (`+0x1790`, line 18036). The engine overwrites a key's alpha once that key has been pressed.
- The paint (FUN_0041a2b0, 16882) fills each key whose colour is not 0 using
  `GdipCreateSolidFill(ARGB)`, with A taken from the record's alpha.
- The app shows alpha 200, the F75's normal fill opacity, as full strength (`withAlpha` in
  `src/ui/lib/animations/driver.ts`), so a press's 220 is capped there. *Inferred*: blending over
  the dark key picture is about the same as scaling towards black.

## Colour, speed, randomness, unit files

- Colour: [3], or the per-second random pick in colourful mode.
- Speed: the dispatcher passes no speed and the period is fixed at 50 ms. Following the app's rule (`intervalForSpeed`), the
  port treats 50 ms as speed 2 and scales by `2 ** ((2 - speed) / 2)`: 100, 71, 50, 35, 25 ms for
  speeds 0 to 4.
- No unit file is used.

## Without presses

The driver shows nothing. No branch lights a key unless its alpha slot was set by a press, and
the shipped `Cfg.ini` (`ReactionEffect=0`) disables presses entirely.

**Not from the driver:** once 2 s pass with no real press, the port presses random keys by itself,
one every 120-420 ms, like typing. It starts on the first tick.
