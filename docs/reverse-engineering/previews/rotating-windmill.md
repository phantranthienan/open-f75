# Rotating windmill (F75 LedOpt15, preview 28, descriptor type 0x1c)

Port: `rotating-windmill.ts`, on the shared engine in `palette-cycle.ts`. Line numbers are decomp.c; `0x…` addresses are from `objdump -d OemDrv.exe` where Ghidra hid register arguments. The engine tick and starter are the same as in `blossoming.md`, section "One tick".

## What it looks like

The board is split into 13 sectors around its middle. Each sector cycles green → blue → magenta → yellow. Neighbouring sectors are offset so that the sectors together span all four colours, which gives four coloured blades that sweep **clockwise**: bottom-centre, then left, top and right. One turn takes 16 ticks (960 ms at 60 ms).

Sector centroid angles in the picture's coordinates, measured as on a math plot with y up and the angle decreasing in sweep order: −33°, −85°, −145°, −166°, 171°, 147°, 69°, 27°, 16°, 0°, −9°, −14°, −21°. The sectors were laid out for a full-size board, so the last four are bunched on the F75's right edge. The blades sweep quickly there.

## Dispatch and generator

- Dispatcher `FUN_00431ca0` case `0x1c` (31992-31996; asm 0x4324c3-0x432522). It calls `FUN_00432970(this, buf)` with `ecx = L"rotate_unit.txt"` (string 0x61227c), then `FUN_00487140(period = 0x3c, direction, unitCount)` with `eax` = unit buffer and `ebx` = descriptor. Colour and colourful are **not** passed.
- The file is **rotate_unit.txt, not windmill_unit.txt**. `windmill_unit.txt` (0x612238) is loaded by case 0x1d (preview 29, Rotating storm).
- Direction is 0: LedOpt15 = `15,28,1,1,0,0,0`, and byte +5 is 0 (31834-31837).
- Unit file: `FUN_00432970` (32171-32233) finds no `Dev\kb\fr\Cartoon\rotate_unit.txt` and returns 0 (asm 0x432a68 → 0x432b21).
- Generator `FUN_00487140` (89263-89310; asm 0x487140-0x48724d). It falls back to `FUN_00487250` (89324-89453), which writes 13 sector units with their key counts and returns 13 (`eax = 0xd` from 0x487615, which is also VK_RETURN).

## Descriptor (0xe64 bytes, ints)

| Slot | Value |
| --- | --- |
| [0] | 0xe64 |
| [1] | 0x1c |
| [2] | 60 ms |
| [7..10] | palette: 0xff00, 0xff0000, 0xff00ff, 0xffff = green, blue, magenta, yellow (0x487220-0x487238) |
| [0xf] | 4 |
| [0x10] | hold A = period = 60 ms (`push edi`, 0x487217) |
| [0x11] | fade B = 3·period = 180 ms (`lea edx,[edi+edi*2]`, 0x487214) |
| [0x12] | cycle = 240·4 = 960 ms |
| units | as in blossoming.md; [0x397] = 13 |
| [0x398] | alpha. The dispatcher sets it to 0xff or 0xaa depending on `dev+0x2eac` (31995); ignored. |

`FUN_00484e00` is called with spread = float 4.0 (0x626e88). The step is trunc(240·4/13) = **73 ms**. With direction 0, unit 12 gets 73, …, unit 0 gets 949, which is just under the 960 ms cycle, so the 13 sectors cover one full colour turn.

## Default sectors (FUN_00487250), in sweep order, as F75 LEDs

1. L . , RAlt(53) / 0xfa(59)
2. K M N Space
3. G H J C V B LAlt
4. A S D F Z X LCtrl LShift LWin Caps
5. Esc ` 1 2 Tab Q W E R T
6. F1-F4 3 4 5 6 7 Y U I
7. F5-F8 8 9 O
8. F9 F10 0 P -
9. F11 F12 = Bksp [ ]
10. PgUp Del End PgDn \
11. Enter ' ;
12. Up
13. RShift Down Left Right

Dropped because the F75 lacks them:

- RWin
- PrtSc
- ScrLk, Pause, Ins, Home, NumLock
- all numpad keys and 0xfd
- RCtrl 0xa3, Apps and 0xc1
- the ISO key 0xe2 (LED 76), absent on the US board

All 80 US keys are covered, each exactly once.

## Options

- **Colour / colourful**: ignored by the driver, so ignored by the port.
- **Speed**: ignored by the preview (constant 0x3c). As the app does for every preview (`intervalForSpeed` in `src/ui/lib/animations/driver.ts`), the interval is `60·2^((2−speed)/2)`: 120, 85, 60, 42, 30 ms.
- **Randomness**: none. **Reactive**: no.

## Inferred

- The VK → LED mapping for the US board is inferred, as in blossoming.md. LED 53 is VK 0xa5 and LED 59 is VK 0xfa, both from the FR profile, so the US RCtrl (LED 59) joins sector 1 rather than sector 13. LED 80 is given VK 0xdc.
- The words "clockwise" and "blades" are my reading of the centroid angles and the 4.0 spread. The driver gives no name to either.
