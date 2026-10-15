# Engine helpers (OemDrv.exe)

Line numbers are decomp.c lines. `0x…` addresses are instructions; many of these helpers take register arguments that Ghidra drops, so they were read with `objdump -d -M intel` on OemDrv.exe (static disassembly only). TypeScript versions of the pieces used by Fixed on, Breathing and Rainbow are in `driver-helpers.ts`. `palette-cycle.ts` (another port) covers FUN_00484e00 and FUN_00484ef0.

## The LED records follow [KEY] order, not the LED index
`FUN_00473e90` (75980-75996) builds the preview's records at `this+0x88`, stride 0x28. It builds one record per profile `[KEY]` line, in file order (K1 Esc, K2 F1 … K13 F12, K14 End, K15 `, …), and stores the count at `+0x1764` (82 for the FR F75).

Each record holds:
| offset | field |
|---|---|
| +0x88 | colour (COLORREF) |
| +0x8c | alpha (200 at build time) |
| +0x94 | VK, from FUN_00467480 |
| +0x9c..+0xa8 | rect: left, top, right, bottom |

`+0x1778` is `MaxEftKeyIndex`, or 0x90 when that is absent (as on the F75). So the 144-entry per-key arrays in descriptors (types 1 and 3, and others) are indexed by **[KEY] order**. Unit files resolve names to that index too, through FUN_00467cf0. Map an index to an LED with the K-line's last number.

The paint loop (17196-17206) skips records whose colour is 0. `FUN_0041a2b0` fills a key with GDI+ ARGB (alpha = `+0x8c`, 16924) over the key picture. The starter's alpha is 200, or 255 when `KbDrawType=1` (18036; `+0x1790` = KbDrawType, 75971).

## Profile flags the previews read (12022-12028)
- `KbLayout` → `cfg+0x2ea8`: used in the unit-file fallback path.
- `KbDrawType` → `cfg+0x2eac`: 1 raises the alphas from 200/180 to 255 in many previews.
- `RespireType` → `cfg+0x2ea0`: Breathing's colourful mode.

The F75 has KbDrawType=0 and no KbLayout or RespireType, so all three are 0.

## FUN_00484f90 (87804): scale a colour
`ebx` = COLORREF, `esi` = factor. It returns each channel × factor / 10, using integer division. Fixed on and the others call it with 10, which leaves the colour unchanged.

## FUN_0040e4d0 (10217): fade between two colours
`edx` = from, `ecx` = to, stack = (total, pos). For each channel it returns `trunc(from + pos * float32((to - from) / total))`. The FPU is in chop mode (0x40e52b) and the quotient is stored as a float32. This makes results like 50 instead of 51 (280 × f32(255/1400)), so keep the `Math.fround`.

## FUN_00484e00 (87704): set up a colour cycle
`esi` = block, `eax` = number of colours, `ecx` = step, `edx` = fade, stack = (hold, float spread, direction, &palette). It does nothing unless there are at most 25 units, `hold % step == 0` and `fade % step == 0`.

Block layout, as offsets from the block:
| offset | field |
|---|---|
| +0x00 | palette (up to 8 COLORREFs) |
| +0x20 | number of colours |
| +0x24 | hold (ms) |
| +0x28 | fade (ms) |
| +0x2c | cycle = (hold + fade) × colours |
| +0x30 + u·0x90 | unit u: 30 VKs, then at +0x78 the key count, +0x80 the phase, +0x88 the current colour |
| +0xe40 | number of units |

The unit fields at +0x30 + u·0x90 are what FUN_00432970 fills.

Starting phases are `trunc(f32((hold + fade) × spread / units))` apart. A phase that reaches the cycle restarts at 0. With direction 0 the loop runs from index `units` (one past the last) down to 0, so the last unit gets one step and unit 0 gets `units` steps. With direction ≠ 0, unit 0 starts at 0.

## FUN_00484ef0 (87764): one cycle tick
`esi` = block, argument = ms per tick (the descriptor period). For each unit:
1. If the phase is ≥ the cycle, subtract the cycle.
2. `idx = phase / (hold + fade)` and `rem = phase − idx·(hold + fade) − hold`.
3. The colour is `palette[idx]` if `rem < 0`. Otherwise it is `FUN_0040e4d0(palette[idx], palette[idx+1] or palette[0], fade, rem)`.
4. Add the argument to the phase.

The engine then paints:
- **Type 2:** every key gets unit 0's colour.
- **Types 0xe/0x1c/0xd/0x7/0x1e:** each unit's VKs are matched against record `+0x94` (18154).

## FUN_00432970 (32171): load a unit file's key lists ("Init_KeyUnit")
`ecx` = file name, stack = (dialog, out). Path resolution is the same as FUN_00432640. The out array has a stride of 0x90 per unit: up to 30 VKs, a terminating 0, and the count at +0x78. It returns the number of units. If the file is missing it returns 0 and leaves `out` alone (the dispatcher zeroes it beforehand). There is no built-in default here, though some generators supply their own: per the Blossoming port, FUN_00486620 falls back to the built-in units of FUN_00486740. Over 25 units shows a message box.

## FUN_00432640 (32028): load unit colours onto per-key colours
`ecx` = dialog, `edx` = file name, stack = (per-key COLORREF array indexed by [KEY] order, interpolate).

1. **Find the file.** Try `<device dir>\Cartoon\<file>`. If that directory is missing, use `<app dir>\Cartoon\<KbLayout>\<file>`. If neither exists, return with nothing changed (32075-32082).
2. **Parse it** with FUN_00485ac0, which gives the units' VK lists and colours (0 = none).
3. **Clear.** Zero the first *n* per-key slots, where *n* is the number of coloured units (32098). This looks like a bug, and is harmless on the F75.
4. **Interpolate.** This happens only when some units have no colour and interpolate is set (32104-32140). From each coloured unit, fade toward the next coloured unit: unit k of a span gets `FUN_0040e4d0(start, end, span, k)`. After the last coloured unit, the previous `end` is reused. Message boxes appear if there are more than 26 units, or if the first or last unit has no colour.
5. **Paint.** For each unit in order and each VK, `FUN_00467cf0` finds the key index, and `arr[index]` is set to the unit's colour. Later units win. Keys in no unit keep their previous colour.

## FUN_00485ac0 (88455): parse a unit file
The file is read with CStdioFile in text mode. Lines starting with `;` and empty lines are skipped. Each line is `names[:r,g,b]`. Names are split on `,`, trimmed of spaces (FUN_004859e0) and turned into VKs by FUN_0048afa0, at most 30 per unit. Names that do not resolve are dropped. A line with no resolvable name is not a unit. The colour is stored as COLORREF r | g<<8 | b<<16. At most 30 units are read.

## FUN_0048afa0 (91584): key name → VK
The match is case-insensitive.
- **Letters and digits:** their ASCII code (lowercase − 0x20).
- **F keys:** `f1`–`f9` are 0x70–0x78; `f10`–`f13` are 0x79–0x7c.
- **Editing and navigation:** `esc` 0x1b, `tab` 9, `caps` 0x14, `back` 8, `enter` 0xd, `space` 0x20, `ins` 0x2d, `del` 0x2e, `home` 0x24, `end` 0x23, `pgup` 0x21, `pgdn` 0x22.
- **Punctuation:** `[` 0xdb, `]` 0xdd, `|` 0xdc, `~` 0xc0, `-` 0xbd, `=` 0xbb, `;` 0xba, `'` 0xde, `<` 0xbc, `>` 0xbe, `?` 0xbf.
- **Modifiers:** `shift` 0xa0, `ctrl` 0xa2, `win` 0x5b, `alt` 0xa4, `rshift` 0xa1, `rctrl` 0xa3, `rwin` 0x5c, `ralt` 0xa5.
- **Arrows:** `left` 0x25, `up` 0x26, `right` 0x27, `down` 0x28.
- **Others:** `app` 0x5d, `k45` 0xe2, `k56` 0xc1, `fn` 0xfa, `fn2` 0xfb.

The table also has numpad and media names.

## FUN_00467cf0 (68099): VK → key index
`edi` = VK, `edx` = profile key table (cfg+0x18, stride 0x10). It returns the index of the first [KEY] entry with that VK; for modifier entries the mask bits are matched instead. It returns −1 if there is none.

On the FR F75 profile:
- `ralt` (0xa5) resolves to K75, LED 53, which is Fn on the US board.
- `fn` (0xfa) resolves to K76, LED 59, which is RCtrl on the US board.
- `|` (0xdc) resolves to K57, LED 75, the ISO key, which the US board lacks.
- `k45` (0xe2) resolves to K77, LED 76, also absent on the US board.
- `rctrl`, `app` and `home` resolve to nothing.

## Random numbers
`FUN_005ada90` is `srand`. `_rand` is the MSVC linear congruential generator: `s = s·214013 + 2531011; return (s >> 16) & 0x7fff`. Generators seed it with `time(0)`, so ports use `options.random` instead.

`FUN_005b2580` is `_ftol2`, which truncates.
