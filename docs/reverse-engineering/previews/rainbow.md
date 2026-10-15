# Rainbow (preview 2, descriptor type 2)

F75 profile: `LedOpt3 = 3, 2, 1, 1, 0, 0, 0`. That gives preview 2, speed and brightness options, and no colour or colourful option.
Port: `rainbow.ts` (`createRainbow`), using `fade` from `driver-helpers.ts`.

Line numbers are decomp.c lines. `0x…` addresses are OemDrv.exe instructions, read with objdump.

## Dispatcher (FUN_00431ca0, 31895-31898; 0x43202b-0x432064)
- It sets `edi = 0x46 = 70` (`lea edi,[eax+0x44]` with eax = 2) and `eax` = &desc, then calls `FUN_004851e0`.
- It then overwrites `desc[0x398]` (the alpha) with 0xff if `KbDrawType == 1`, else 0xb4 = 180. The F75's KbDrawType is 0.
- It does not use the colour or the colourful flag.

## Descriptor (FUN_004851e0, 87929-87956; 0x4851e0-0x4852b2)
| slot | value |
|---|---|
| [0] | 0xe64 |
| [1] | 2 (type) |
| [2] | 70 ms |
| from [7] (desc+0x1c) | the colour-cycle block of FUN_00484e00 (helpers.md) |
| [7..11] | palette: red, green, blue, magenta, orange (0xff, 0xff00, 0xff0000, 0xff00ff, 0x80ff), from 0x48527e |
| [0xf] | 5 colours |
| [0x10] | hold 70 |
| [0x11] | fade 1400 (= 20 × 70) |
| [0x12] | cycle 7350 |
| [0x13] | unit 0's key list: VK 0x41 ('A') |
| [0x31] | unit 0's key count, 1 |
| [0x33] | unit 0's phase |
| [0x35] | unit 0's colour |
| [0x397] | 1 unit |
| [0x398] | alpha |

The generator first stores `max(50, ftol(FUN_005b3760(220.0)))` in [0x398], but the dispatcher overwrites it.

`FUN_00484e00` is called with hold 70, step 70, fade 1400, spread 1.0 and direction 0. It hands out phases from the slot after the last unit backwards, so unit 0 starts at phase 1470, which is green.

## Engine tick (FUN_0041bbb0 type 2, 18138-18153; 0x41bc4c-0x41bc9b)
`FUN_00484ef0(70)` runs one step of the cycle:
1. If the phase is at or past 7350, subtract 7350.
2. `idx = phase / 1470` and `rem = phase % 1470 − 70`.
3. If `rem < 0`, the colour is `palette[idx]`. Otherwise it is `fade(palette[idx], palette[idx+1 mod 5], 1400, rem)`.
4. Add 70 to the phase.

Then every key record gets unit 0's colour and the alpha, stopping at the first record with no VK, which comes after the last key. Unit 0's key list ('A') is ignored for type 2.

**What it looks like:** the whole board is one colour. Each palette colour lasts 21 ticks: 2 pure frames, then 19 fade steps. The order from the start is green, blue, magenta, orange, red, then green again: 105 ticks, or 7.35 s per cycle.

The alpha is a constant 180, so the port returns full colours.

## Speed and reaction
- **Speed:** the period is the constant 70, and the phase always advances by 70 per tick. The port scales only the interval, by `2 ** ((2 - speed) / 2)`: 140 / 99 / 70 / 49.5 / 35 ms, so a cycle takes 14.7 s down to 3.7 s.
- **Reaction:** none.

## Confidence
High. Every constant was read from the disassembly. The preview is a uniform colour cycle, not a moving wave. What the keyboard itself shows for this effect is not covered here.
