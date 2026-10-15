# Breathing (preview 3, descriptor type 3)

F75 profile: `LedOpt2 = 2, 3, 1, 1, 0, 1, 1`. That gives preview 3, plus speed, brightness, colourful and colour options.
Port: `breathing.ts` (`createBreathing`), with helpers in `driver-helpers.ts`.

Line numbers are decomp.c lines. `0x…` addresses are OemDrv.exe instructions, read with objdump.

## Dispatcher (FUN_00431ca0, 31875-31894; 0x431f80-0x432026)
1. It fills a local list of seven colours: red, green, blue, yellow, magenta, cyan, white (0xff, 0xff00, 0xff0000, 0xffff, 0xff00ff, 0xffff00, 0xffffff).
2. If the effect is not colourful, the first entry becomes the chosen colour.
3. It calls `FUN_004850e0(period = 0x32)` with `eax` = colourful, `ecx` = &list and `edx` = &desc. The 50 is pushed at 0x431fcd; Ghidra lost it.
4. It sets `desc[0x9c]` = the profile's `RespireType` (31887; read at 12028).
5. It sets `desc[0xa0]` = 0xff when `KbDrawType == 1` (31888).
6. When colourful, it calls `FUN_00432640("breath_unit.txt" (0x612198), &desc[10], 1)`.

## Descriptor (FUN_004850e0, 87872-87927)
| slot | value |
|---|---|
| [0] | 0x28c |
| [1] | 3 (type) |
| [2] | 50 ms |
| [3..9] | the 7-colour list |
| [10..153] | 144 random per-record colours (colourful only); same draw as Fixed on: rand()%6 of {R,G,B,magenta,yellow,white}, never equal to the previous one |
| [0x9a] | the chosen colour (single colour only, 87923) |
| [0x9b] | 7, the list length |
| [0x9c] | RespireType |
| [0x9d] | list index, 0 |
| [0x9e] | direction, 0 (dimming first) |
| [0x9f] | 5, the minimum alpha |
| [0xa0] | 0xb4 = 180, the maximum alpha (0xff when KbDrawType=1; the F75's is 0) |
| [0xa1] | colourful flag |
| [0xa2] | "colours applied" flag, 0 |

## Starter and engine tick (FUN_0041ba70 18022-18027; FUN_0041bbb0 type 3, 18191-18277)
The starter sets every key's alpha to `desc[0xa0]` and runs the first tick straight away.

**First tick only** (when `[0xa2]` is 0), it sets the key colours:
- **Single colour:** `desc[0x9a]` on every key.
- **Colourful, RespireType 0:** `desc[10+i]` on record `i`.
- **Colourful, RespireType ≠ 0:** `desc[3 + desc[0x9d]]` on every key.

**Every tick:**
1. Take key 0's alpha and add or subtract 6, depending on `[0x9e]`.
2. Clamp it to [5, 180] and write it to every key.
3. If the alpha is still above 5, set the direction to "dim" once it reaches 180.
4. Otherwise set the direction to "brighten". If RespireType == 1 and the effect is colourful, also step `[0x9d]` round the 7-colour list and recolour every key (18259-18272).

**Timing:** the alpha runs 174, 168, …, 6, 5 (30 ticks), then 11, …, 179, 180 (30 ticks). That is 60 ticks, or 3.0 s per breath at 50 ms.

## How the port shows it
The driver paints each key with a GDI+ solid fill whose alpha is that value (FUN_0041a2b0, 16924) over the dark key picture. The app shows alpha 200, the F75's normal fill opacity, as full strength (`withAlpha` in `src/ui/lib/animations/driver.ts`), so the top of a breath is at 0.9 and the bottom at about 3% (*inferred*: how the fill over the dark key picture maps to a colour).

## Colourful on the F75
The F75 profile has no `RespireType`, so it is 0. The keys therefore keep the per-key colours, which `breath_unit.txt` repaints completely. The file has 14 units: unit 0 is blue, unit 9 is green and unit 13 is orange (255,128,0). The others are interpolated:

| unit | keys | colour |
|---|---|---|
| 0 | Esc ` Tab Caps LShift LCtrl LWin | 0,0,255 |
| 1 | 1 Q A Z LAlt | 0,28,226 |
| 2 | F1 2 W S X | 0,56,198 |
| 3 | F2 3 E D C | 0,85,169 |
| 4 | F3 4 R F V | 0,113,141 |
| 5 | F4 5 T G B Space | 0,141,113 |
| 6 | 6 Y H N | 0,170,84 |
| 7 | F5 7 U J M | 0,198,56 |
| 8 | F6 8 I K , | 0,226,28 |
| 9 | F7 9 O L . Fn | 0,255,0 |
| 10 | F8 0 P ; / RCtrl | 63,223,0 |
| 11 | F9 - [ ' F10 = ] | 127,191,0 |
| 12 | F11 F12 Bksp \ Enter RShift Left Up Down | 191,159,0 |
| 13 | Del PgUp PgDn End Right | 255,128,0 |

The odd values, such as 169 rather than 170, come from the driver's float32 step and truncation. The whole board breathes together. The 7-colour list is unused on the F75, so the RespireType=1 path is not ported.

Key-name mapping is the same as in fixed-on.md: `ralt` maps to LED 53, `fn` to LED 59, `|` to LED 80, and `rctrl`, `k45`, `app` and `home` are skipped. If the file is missing, the random per-key colours stay; there is no default.

## Speed and reaction
- **Speed:** the period is the constant 50. The port scales the interval by `2 ** ((2 - speed) / 2)`: 100 / 70.7 / 50 / 35.4 / 25 ms, so a breath takes 6 s down to 1.5 s.
- **Reaction:** none.

## Confidence
High for the timing, alpha steps and colours. *Inferred*: the alpha-to-RGB scaling, and the US key mapping, as in Fixed on.
