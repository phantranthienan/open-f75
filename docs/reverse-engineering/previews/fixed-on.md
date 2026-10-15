# Fixed on (preview 1, descriptor type 1)

F75 profile: `LedOpt1 = 1, 1, 0, 1, 0, 1, 1`. That gives preview 1, no speed option, brightness, no direction, and both colourful and colour options.
Port: `fixed-on.ts` (`createFixedOn`), with helpers in `driver-helpers.ts`.

Line numbers are decomp.c lines. `0x…` addresses are OemDrv.exe instructions, read with `objdump -d` where Ghidra dropped the register arguments.

## Dispatcher (FUN_00431ca0, 31869-31874; 0x431f40-0x431f7b)
- `FUN_00485000(colour, colourful)` with `eax` = the descriptor buffer (`push esi; push eax` at 0x431f49).
- When colourful: `FUN_00432640(this, "fixon_unit.txt" (0x612178), &desc[3], 1)`, then the starter.

## Descriptor (FUN_00485000, 87818-87870)
| slot | value |
|---|---|
| [0] | 0x24c (588 bytes) |
| [1] | 1 (type) |
| [2] | 300: the timer period in ms (87837) |
| [3..146] | 144 COLORREFs, one per LED *record* |

The records follow the profile's `[KEY]` order, not the LED index (see helpers.md).

- **Single colour:** every slot is `FUN_00484f90(colour, 10)`, which is the colour times 10/10 and so unchanged (0x4850b5-0x4850cc).
- **Colourful:** the generator calls `srand(time(0))`. For each slot it takes `rand() % 6` from {red, green, blue, magenta, yellow, white}, drawing again while the result equals the previous slot (87840-87858).

## Unit file (colourful only)
`FUN_00432640` (32028) reads `<device dir>\Cartoon\fixon_unit.txt`. If that is missing it falls back to `<app dir>\Cartoon\<KbLayout>\fixon_unit.txt`. The file has 10 units. Three have colours: O is red, unit 5 is green and unit 9 is blue. The units between them are interpolated with FUN_0040e4d0 (truncating, float32 step).

| unit | keys (US board) | colour |
|---|---|---|
| 0 | O | 255,0,0 |
| 1 | 9 0 I K L P | 204,51,0 |
| 2 | F8 8 U J M , . ; [ - | 153,102,0 |
| 3 | F7 7 Y H N / ' ] = F9 | 102,153,0 |
| 4 | F6 6 T G B Fn F10 | 51,204,0 |
| 5 | F5 5 R F V Space RCtrl RShift Enter \ Bksp F11 | 0,255,0 |
| 6 | F4 4 E D C | 0,191,63 |
| 7 | F3 3 W S X Left Up PgUp PgDn Del F12 | 0,127,127 |
| 8 | F2 2 Q A Z LAlt Down End | 0,63,191 |
| 9 | F1 1 Esc ` LCtrl Tab Caps LShift LWin Right | 0,0,255 |

Every one of the 80 US keys is in a unit, so on the F75 the random colours never show and the colourful preview is this fixed gradient. The port still draws the random colours first, to stay faithful.

If both paths for the file are missing, `FUN_00432640` returns without touching anything (32075-32082). There is no built-in default, so the preview would show the random per-key colours.

## Key names
`ralt` maps to LED 53 and `fn` to LED 59, through the FR profile's VK-to-LED table (K75 = VK 0xa5 on LED 53, K76 = VK 0xfa on LED 59). On the US board those LEDs are Fn and RCtrl. The profile has no `rctrl` key (VK 0xa3), so the driver skips that name.

One could map `rctrl` to LED 59, right Ctrl on the US board. Following it would move RCtrl from unit 5 to unit 6.

`|` (VK 0xdc) is the ISO key at LED 75 in the FR profile. That key is absent on the US board, so `|` is mapped to the US backslash, LED 80 (*inferred*). `k45` and `app` are dropped.

## Engine tick (FUN_0041bbb0 type 1, 18121-18136)
Each tick copies `desc[3+i]` into record `i` for `i < 0x1778` (144), so nothing ever changes.

The starter sets every key's alpha to 200 (18036). It is 255 only when the profile has `KbDrawType=1`, and the F75's value is 0. The alpha is constant, so the port returns full colours.

## Period, speed, reaction
- **Period:** 300 ms, a constant.
- **Speed:** the preview ignores it, so the port scales the interval by `2 ** ((2 - speed) / 2)`, giving 600 / 424 / 300 / 212 / 150 ms. The effect is static, so this is moot.
- **Reaction:** none. Type 1 is not among the reactive types (18053-18060).

## Confidence
High. The only *inferred* parts are the `|`/`rctrl` key mapping for the US board and the random fill order, which never shows on the F75.
