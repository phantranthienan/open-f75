# Raindrops (preview 15, descriptor type 0xf)

Line numbers are in `decomp.c`. Addresses come from `objdump -d` of OemDrv.exe.

## Dispatcher (31899-31902; asm 0x43206e-0x4320ab)

- It calls `FUN_00432970` with `rain_unit.txt` (string 0x6121b8). The file is not in the F75 package, so the loader returns 0 (see retro-snake.md).
- It then calls `FUN_00486b80(colour, colourful)` with ESI pointing to the descriptor, EBX to the unit array and EDI = 0 units.
- There is no `KbDrawType` override.

## Descriptor (FUN_00486b80, 89089-89260)

| Slot | Value |
| --- | --- |
| [0] | 0xed4 |
| [1] | 0xf |
| [2] | **40 ms** (89104) |
| [3] | colour |
| [0x2b] | 1 |
| [0x3b2] | 10 (brightness /10, so the colour is unchanged) |
| [0x3b4] | colourful flag (89106-89108) |

**Built-in units.** Because there are no units (89109), the generator writes **23 built-in units** (89110-89243). They are columns of virtual keys from a full-size ANSI board. Each unit is 0x24 ints: up to 30 keys, the count at +0x1e, and the drop position at +0x23 (= [0x4f + 0x24*i]). Every position starts at -1, meaning idle (89244-89249).

The columns, mapped VK to LED through the F75 profile's [KEY] table:

| Unit | Keys |
| --- | --- |
| 0 | Esc \` Tab Caps LShift LCtrl |
| 1 | Esc \` Tab Caps ISO<> (absent) LWin |
| 2 | 1 Q A Z LAlt |
| 3-6 | F1..F4 with the digit, letter and Space columns |
| 7 | 6 Y H N |
| 8 | F5 7 U J M |
| 9 | F6 8 I K , RAlt (LED 53 = our Fn) |
| 10 | F7 9 O L . 0xFA (LED 59 = our RCtrl) |
| 11 | F8 0 P ; / Apps (absent) |
| 12 | F9 - [ ' |
| 13 | F10 = ] |
| 14 | F11 |
| 15 | F12 Bksp \\ Enter RShift (plus 2 absent) |
| 16 | PrtSc Ins Del Left |
| 17 | ScrLk Home End Up Down |
| 18 | Pause PgUp PgDn Right |
| 19-22 | numpad, all absent |

## Each tick (18425-18494; asm 0x41c1f9-0x41c3bf)

`srand(time)` runs first. For each unit in order:

- **Idle (pos < 0).** The unit is added to the idle list.
- **pos >= count.** The last key is cleared and the unit goes idle (pos = -1). It is *not* counted as idle this tick.
- **Otherwise:**
  - The key at `pos` gets the colour [3]. In colourful mode it gets `DAT_00652488[rand() & 3]`, re-drawn until it differs from the colour last picked this tick. A new colour is picked every step, so a colourful drop changes colour as it falls (18440-18456).
  - The key at `pos - 1` is cleared.
  - `pos++`.
  - A key the profile lacks is skipped (`FUN_0041b530` returns -1), but the drop still spends a tick on it.

After the loop, `idle - 2` picks are made with replacement, each `rand() % idle`, and each picked unit restarts at pos 0 (18482-18490).

Alpha is never touched, so lit keys stay at the starter's 200 (full). There is no fade: each column shows one lit key moving down 1 key per 40 ms. Columns that start together stay in step, so the visible count pulses (about 5 to 17 keys).

## Timing, colour, speed

- On the first tick (on start, 18049) every unit is idle, so 21 picks are made and nothing lights. The port runs that tick in `create`.
- **Speed** is ignored by the driver (timer handler at asm 0x41b550). The port uses `40 * 2^((2 - speed) / 2)` ms.
- **Not reactive.**

## Inferred

- *inferred:* VK 0xdc ('\\') is mapped to our LED 80. The FR profile puts 0xdc on the ISO '#' key (LED 75), which the US board does not have, and the default table is ANSI.
- *inferred:* RAlt and 0xFA follow the profile's LEDs 53 and 59, which are our Fn and RCtrl, matching the other ports.
