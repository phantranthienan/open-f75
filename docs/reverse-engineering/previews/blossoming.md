# Blossoming (F75 LedOpt17, preview 14, descriptor type 0xe)

Port: `blossoming.ts`, on the shared engine in `palette-cycle.ts`. Line numbers are decomp.c; `0x…` addresses are from `objdump -d OemDrv.exe` where Ghidra hid register arguments.

## What it looks like

Eleven rings of keys centred on **O** cycle through red → yellow → green → blue → cyan → magenta. The centre leads, so each colour opens outward from O like a flower. Colour bands are about 1.8 colours wide from the centre to the edge. One full colour cycle takes 42 ticks (2.52 s at 60 ms).

## Dispatch and generator

- Dispatcher `FUN_00431ca0` case `0xe` (32000-32005; asm 0x43254d-0x43257b). It calls `FUN_00432970(this, buf)` with `ecx = L"flower_unit.txt"` (string 0x61225c), then `FUN_00486620(period = 0x3c, direction, unitCount)` with `eax` = unit buffer and `ebx` = descriptor. Colour (`local_8224`) and colourful (`iVar1`) are **not** passed.
- Direction is `this+0x5b1c` only when the effect record's byte +5 (direct) is non-zero (31834-31837). LedOpt17 is `17,14,1,1,0,0,0`, so direction = **0**.
- Unit file: `FUN_00432970` (32171-32233) looks for `<device>\Cartoon\flower_unit.txt`. `Dev\kb\fr\Cartoon` exists but has no such file. `PathFileExistsW` fails and its 0 is returned as the unit count (asm 0x432a68 → 0x432b21).
- Generator `FUN_00486620` (88913-88963; asm 0x486620-0x486730). Because the count is outside 1..25, it calls `FUN_00486740` (88970-89087), which writes 11 built-in units and returns 11 (`lea eax,[ecx-8]`, ecx = 0x13, at 0x486b72).
- `Dev\kb\fr\ET\flower.txt` belongs to a different feature. It is read by `FUN_0048c770` (`"%s\\flower.txt"`, `"init_flower failed"`, near 92697) together with stream_h, audiobar and happy, which is the music visualiser. This preview never reads it.

## Descriptor (0xe64 bytes, ints)

| Slot | Value |
| --- | --- |
| [0] | 0xe64 |
| [1] | 0xe |
| [2] | 60: timer period, and the counter step |
| [7..12] | palette (COLORREF): 0xff, 0xffff, 0xff00, 0xff0000, 0xffff00, 0xff00ff = red, yellow, green, blue, cyan, magenta (0x4866f3-0x48671b) |
| [0xf] | 6 colours |
| [0x10] | hold A = 2·period = 120 ms (0x4866de) |
| [0x11] | fade B = 5·period = 300 ms (0x4866e8) |
| [0x12] | cycle = (A+B)·6 = 2520 ms |
| [0x13 + 0x24·i] | unit i: VK codes, zero-terminated; +0x1e count; +0x20 phase counter (ms); +0x22 current colour |
| [0x397] | 11 units |
| [0x398] | key alpha. The generator computes floor(180.0) = 180, clamped to ≥ 50. The dispatcher sets 0xff when `dev+0x2eac == 1`. It is preview opacity only and is ignored (the caller applies brightness). |

`FUN_00484e00` (87704-87762; asm 0x484e00-0x484eec) is called with spread = float 1.8 (0x626e8c). It only proceeds if units ≤ 25 and A and B are multiples of the period, which they are. The phase step is trunc(float((A+B)·1.8/11)) = trunc(68.73) = **68 ms**. With direction 0, the phases are handed out from the phantom slot 11 backwards: unit 10 gets 68, …, unit 0 (O) gets 748. A phase that reaches the cycle restarts at 0, which never happens here.

## Default units (FUN_00486740), resolved to F75 LEDs

VK → LED comes from the profile `[KEY]` (`device.ini` lines 69+). VKs the F75 lacks are dropped, as the engine finds no record for them: numpad keys, Ins, Home, PrtSc, ScrLk, Pause, NumLock, Apps 0x5d, RWin 0x5c, RCtrl 0xa3, 0xc1 and 0xfd. The ISO key 0xe2 (LED 76) is dropped too, because the US board does not have it. All 80 US keys are covered, each exactly once.

O · 9 0 I K L P · F8 8 U J M , . ; [ - · F7 F9 7 Y H N Space RAlt(LED 53) / ' ] = · F6 F10 6 T G B RShift Enter \ Bksp 0xfa(LED 59) · F5 F11 F12 5 R F V Left Del · F4 4 E D C Up Down End · F3 3 W S X Right PgUp PgDn · F2 2 Q A Z LAlt · F1 1 Caps LShift LWin · Esc ` Tab LCtrl

## One tick (types 0x7/0xd/0xe/0x1c/0x1e: branch at 18154-18187 plus `FUN_00484ef0` 87764-87798)

For each unit:

1. If the counter is ≥ the cycle, subtract the cycle.
2. idx = c / (A+B) and r = c mod (A+B) − A.
3. The colour is `pal[idx]` if r < 0. Otherwise it fades from `pal[idx]` to `pal[(idx+1) mod 6]` with `FUN_0040e4d0(B, r)` (10217-10240). Each channel is trunc(from + r·float((to−from)/B)); the FPU is set to chop at 0x40e52b.
4. Add the period to the counter.

Then every VK of every unit is looked up in the LED records (+0x94 = VK) and gets the unit's colour (+0x88) and alpha (+0x8c). The asm is 0x41e1a3-0x41e258, with `esi = desc+0x1c`.

Starter `FUN_0041ba70` (18001-18063):

- zeroes every LED colour (keys outside all units stay dark),
- draws frame 0 at once on the stored copy (0x41bb30),
- arms timer 0x7a at [2] ms,
- sets the reactive flag to 0 (only types 0x11-0x14 and 0x18 set it).

Ticks come from the OnTimer at 0x41b550: id 0x7a, while `this+0x1788 == 2`.

## Options

- **Colour / colourful**: ignored by the driver for this effect (not passed, see above), so the port ignores `options.color`.
- **Speed**: ignored by the preview, because the period is the constant 0x3c. As the app does for every preview (`intervalForSpeed` in `src/ui/lib/animations/driver.ts`), 60 ms is taken as speed 2 and the interval is `60·2^((2−speed)/2)`: 120, 85, 60, 42, 30 ms. Only the interval changes; the frame sequence is the driver's.
- **Randomness**: none. **Reactive**: no.

## Inferred

- LED 53 (Fn on the US board) and LED 59 (RCtrl on the US board) take the FR profile's VKs, 0xa5 (RAlt) and 0xfa (its FN). So they join the RAlt and Fn rings, not the RCtrl ring: the profile has no key with VK 0xa3.
- LED 80 (US backslash) is not in the FR profile. It was given VK 0xdc (backslash), the profile's LED 75, which the US board lacks.
- The package ships no US profile, so this is the best match for how the driver would draw the owner's board.
