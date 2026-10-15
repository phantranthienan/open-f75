# Rainbow wheel (preview 13, descriptor type 0xd)

F75 option 6 (`LedOpt6=6,13,1,1,0,1,1`). Port: `rainbow-wheel.ts`, `createRainbowWheel`.
Line numbers are decomp.c. Wherever the decompiler lost register arguments, the
claim was checked against an `objdump -d` of OemDrv.exe (addresses given). The engine
branch is the same as Neon stream's (see neon-stream.md, "One engine tick").

## Call (dispatcher FUN_00431ca0)

- Line 31903: `FUN_00432970()` loads `Cartoon\wheel_unit.txt` (string 0x6121d4).
- Then `FUN_0048a5f0(desc, colourPtr, 0x3c, direction, unitCount)`, with the unit buffer in
  EAX (asm 0x4320b0-0x432101). colourPtr is `&local_8224` in one-colour mode and NULL when
  the colourful flag is set (31908).
- direction: when the option has no "direct" byte (the F75's is 0), it is the byte at device
  `+0x2d8e` (31906). That byte is `[OPT] XYDirect`, read with default **1** (12089), and the
  F75 profile doesn't set it. So direction = **1**.
- Line 31909: alpha `desc[0x398]` is overwritten with 0xaa (170), or 0xff when device
  `+0x2eac` == 1.
- Line 32020: `FUN_0041ba70()` starts it.

## Unit file

`Dev/kb/fr/Cartoon/wheel_unit.txt` ships with the F75. FUN_00432970 (32171) calls the parser
FUN_00485ac0 (88455) with no colour array, so any `:r,g,b` would be ignored, and this file
has none anyway. Lines starting with `;` are skipped. Each name becomes a VK through
FUN_0048afa0 (91584; values read from asm 0x48afa0-0x48c040), and VKs match the LED records'
profile VK. That gives 19 units, wedges ringing the board clockwise from the top-left:

`tab,~,esc,1` · `f1,f2,2,3,q,w` · `f3,f4,4,5,e,r` · `f5,f6,6,7,t,y,u` ·
`f7,f8,8,9,0,i,o,p` · `f9,f10,-,=,[` · `f11,f12,back,],|` · `del,home,pgup` ·
`pgdn,end,right` · `enter,up,down` · `',rshift,left` · `?,;,rctrl` · `l,>,fn` ·
`k,<,ralt` · `j,m,h,n,space` · `f,g,v,b` · `s,d,x,c` · `a,z,alt` · `caps,shift,k45,ctrl,win`

On the F75 profile:

- `fn` is VK 0xFA, on LED 59 (our RCtrl).
- `ralt` is VK 0xA5, on LED 53 (our Fn).
- `rctrl` (0xA3), `home` (0x24) and `k45` (0xE2) match no key.
- *US adaptation*: `|` is VK 0xDC, which the profile puts on the ISO key (LED 75). Here it is
  the US backslash, LED 80.

All 80 US keys belong to exactly one unit. If the built-in fallback `FUN_0048a750` (91263)
were used, it would apply only when the file is missing or has 0 or more than 25 units.

## Descriptor (FUN_0048a5f0, 91191; asm 0x48a5f0)

| Field | Value |
| --- | --- |
| `[1]` | 0xd |
| `[2]` | period: **60 ms** |
| `[0x397]` | 19 units |
| `[0x398]` | floor(180.0) = 180, then 170 or 255 from the dispatcher |

`FUN_00484e00` gets EAX = n, EDX = B = 6 × period = 360, ECX = 60, and stack arguments
A = 0, (float)n, direction, palette (asm 0x48a719-0x48a73a):

- Colourful: n = 5, palette 0xff00, 0xff0000, 0xff00ff, 0xff, 0xffff, which is green, blue,
  magenta, red, yellow.
- One colour: n = 6, [c, c/10, c, c/10, c, c/10]. The dimming is FUN_00484f90 with ESI = 1.
- Hold A = 0 and fade B = 360, so a unit is always mid-fade. Wrap = 360 × n: 1800 ms, or
  2160 ms in one-colour mode.
- Unit spacing: trunc(360 × n / 19) = wrap / count, truncated: **94 ms** (colourful) or
  **113 ms** (one colour). The 19 wedges span exactly one palette cycle.
- With direction 1 the phases are assigned forwards (asm 0x484e8c): unit u starts at u × 94
  (or u × 113).

## One engine tick

Each tick is FUN_0041bbb0's shared branch (18154-18189) with FUN_00484ef0 (87764). For each
unit:

- if phase ≥ wrap, subtract wrap;
- i = phase / 360;
- colour = a blend from palette[i] to palette[i + 1], or palette[0] after the last, at
  phase mod 360 out of 360 (FUN_0040e4d0, 10217);
- phase += 60.

Then each LED in the unit takes the colour. The first frame is drawn at start (18049), then
one per 60 ms timer tick.

## What it looks like

A rainbow ring around the board in which every wedge shows a different hue, all fading
continuously. Higher-numbered wedges are ahead in the cycle, so the colours travel against
the file's clockwise order. They run anticlockwise: right along the bottom, up the right
side, left along the top. One full turn takes 30 ticks (1.8 s). In one-colour mode the ring
shows three bright-to-dim waves of the colour turning the same way. A key repeats every 12 ticks (720 ms).

## Speed, randomness, reactivity

- **Speed**: not used. The period is a fixed 0x3c, so as for every preview (`intervalForSpeed`):
  `interval = 60 × 2^((2 − speed)/2)`, which is 120, 85, 60, 42 or 30 ms.
- **Random**: none, and `options.random` is not used.
- **Reactive**: no. 0xd is not in the reactive list (18053-18058).
- Alpha 170 or 255 is preview drawing opacity only and is not ported.

## Inferred / open

- *Inferred*: what `+0x2eac` means (alpha 255).
- LED 80 for `|` is a US-board choice. Mapping `rctrl` to LED 59 gives the same picture,
  because LED 59 is painted by the later `l,>,fn` unit either way.
- XYDirect = 0 (the F75 profile does not set it) would reverse the rotation.
