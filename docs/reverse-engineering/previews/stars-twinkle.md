# Stars twinkle (preview 16, descriptor type 0x10)

Line numbers are in `decomp.c`. Addresses come from `objdump -d` of OemDrv.exe.

## Dispatcher (31911-31916; asm 0x432131-0x432177)

- It calls `FUN_00487f00(0x50, colourful, colour)` with ESI pointing to the descriptor.
- It then **overwrites descriptor[0x9b]**: 0xff if `KbDrawType == 1`, otherwise 0xb4 = **180** (31915, asm 0x432155-0x432169). The F75 has `KbDrawType=0`, so stars start at alpha 180.
- No unit file is used.

## Descriptor (FUN_00487f00, 89701-89716)

| Slot | Value |
| --- | --- |
| [0] | 0x278 |
| [1] | 0x10 |
| [2] | **80 ms** |
| [0x99] | colour |
| [0x9a] | colourful flag |
| [0x9b] | alpha (generator 200, dispatcher 180) |

## Each tick (18495-18540; asm 0x41c3c4-0x41c4cb)

1. Every record below the LED count (0x90) with alpha > 0 loses 20 alpha. At <= 0 its colour is cleared (18499-18507).
2. Seven slots are drawn, each `rand() % (count + 1)`, so 0..144. Only consecutive picks must differ, so one slot can come up twice (18513-18524).
3. Each picked slot gets alpha [0x9b] = 180 and the colour [0x99], or `DAT_00652488[rand() % 5]` in colourful mode: red, green, blue, magenta, cyan (18525-18537).

A star lasts 9 ticks (180, 160, ... 20), which is 720 ms. Slot 144 is one past the record array and draws nothing. Slots without a key are invisible, so about 55% of picks show. The steady state on the US board is about 25-35 keys lit.

## Timing, colour, speed

- The first frame is drawn on start (`FUN_0041ba70`, 18049), and the port does the same.
- **Speed** is ignored by the driver (timer handler at asm 0x41b550). The port uses `80 * 2^((2 - speed) / 2)` ms.
- **Alpha.** The port draws `alpha / 200` as brightness, so a new star is at 0.9 and fades linearly.
- `srand(GetTickCount())` runs every tick. The port uses `options.random` instead.
- **Not reactive.**

## Inferred

- *inferred:* slots are LED indices, as the other ports assume. `FUN_00473e90` (75914) fills one preview control's records in [KEY] order, and if the effect preview does the same, about 82 rather than 80 of the 145 slots would be visible. That makes no visible difference.
