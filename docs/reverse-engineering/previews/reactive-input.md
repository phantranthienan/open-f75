# How AULA's preview receives "presses"

Static analysis of OemDrv.exe: decomp.c line numbers, plus `objdump -d` of the exe and a scan of
the MFC message maps in `.rdata` (read with a small script) where Ghidra lost
register arguments.

## Summary

- **Only real key presses feed the reactive effects, and only `WM_KEYDOWN` messages that reach
  the driver's own window while it has keyboard focus.** The driver installs no keyboard hook and
  does not use raw input. Nothing from the board's HID reports reaches the preview.
- **Mouse clicks on the preview's keys never trigger a reactive effect.** They post `0x481`
  (one key) or `0x482` (a rubber-band selection), and the lighting page uses those only to paint
  keys in the custom per-key mode.
- **The shipped `Cfg.ini` turns the reaction off.** `[OPT] ReactionEffect=0`, so the press
  handler returns at once. Out of the box, the driver's Reaction, Flash away and Ripples shining
  previews stay dark.
- **The driver never simulates presses.** The timer only steps the engine, and no engine branch
  for these types makes up input. Our idle demo is our own addition.

## The keyboard path

1. Three `PreTranslateMessage` overrides catch `WM_KEYDOWN` (0x100) and `WM_KEYUP` (0x101):
   - `FUN_0041e8d0` (20148): the preview control's own.
   - `FUN_00431a20` (31653): the lighting page's. Its preview is at `+0x301c`.
   - `FUN_004751e0` (76677): the main window's. It forwards only while the page at `+0x16f8` is
     visible.

   Each one calls `FUN_0041e640(preview, msg == WM_KEYUP ? 0x80 : 0)`. The disassembly
   (0x431a59..0x431ac9) shows that EAX holds the virtual-key code `wParam`, refined from `lParam`:
   - extended Ctrl becomes 0xa3 (RCtrl);
   - extended Alt becomes 0xa5 (RAlt);
   - Shift with scan-code bit 0x100000 (right Shift, scan code 0x36) becomes 0xa1;
   - extended Enter becomes 0xfd (numpad Enter).

   After forwarding, Enter, Esc, Space and F1 are swallowed (they return 1) so that they don't
   trigger dialog buttons or help (31668-31671).
2. **`FUN_0041e640`** (20020-20118) is the press handler:
   - It returns immediately when `DAT_00659b39 == 0` (20033). That byte is
     `GetPrivateProfileIntW("OPT","ReactionEffect",0,"<app>Cfg.ini")` (10481-10482). The F75
     package's `Cfg.ini` has `ReactionEffect=0`.
   - It ignores key-up (`param_2 != 0`, 20036) and returns if no descriptor is loaded. It does not
     filter auto-repeat, so holding a key re-triggers it at the typematic rate.
   - It maps a plain VK_SHIFT, VK_CONTROL or VK_MENU to the left-hand key (0xa0, 0xa2, 0xa4).
   - It finds the LED record whose `+0x94` equals the VK. That is the 6th field of the profile's
     `[KEY]` line: in `K1=27,33,53,61, 0x02,0x1B,0x00,0`, the VK is 0x1B and the LED is 0. A key
     the profile doesn't list is ignored.
3. What a press does, by the type of the running descriptor (`*(preview+0x1760)`):

   | Type | Effect | What the press does | Lines |
   |---|---|---|---|
   | 0x11 | Reaction | The key's alpha slot gets `desc[5]` (220). Its colour slot gets `desc[3]`, or in colourful mode a random pick from {red, cyan, green, yellow, blue, magenta}. `rand` is reseeded with `time(NULL)` (whole seconds) on every press. | 20059-20078 |
   | 0x12 | preview 18 (FUN_00485770, not ported here) | The alpha slot is set to -50, and the engine brings it back up to 180. | 20079-20082 |
   | 0x13 | Flash away | Claims the first of 10 free wave slots: the key's row and its position in that row (`FUN_004887a0`). The column part (`FUN_004887e0`) only exists for type 0x1a. | 20083-20109 (disasm 0x41e781..0x41e80d) |
   | 0x14 | Ripples shining | Puts the diamond's 4 points on the key's edge midpoints (`FUN_0041e870`) and sets "active" and "pressed key". It also writes red (0xff) into the key's record, but never repaints, so the red is never seen. | 20110-20115 |
   | 0x18 | ? | No branch: the starter flags it, but a press does nothing. | — |

## The mouse path (does not feed the effects)

The preview control's message map (`.rdata` 0x6106b0..0x610728) routes four messages:

- **`WM_LBUTTONDOWN` → `FUN_0041b580`.** Starts a rubber-band selection, but only in lighting
  mode (`+0x1788 == 2`) with `+0x17b0` set.
- **`WM_MOUSEMOVE` → `FUN_0041b840`.** Grows the rubber band. Otherwise it hit-tests, and in
  key-assignment mode (`+0x1788 == 1`) it posts `0x484` (hover) when the key under the mouse
  changes.
- **`WM_LBUTTONUP` → `FUN_0041b600`** (17738):
  - If a rubber band bigger than one key was dragged, it collects every key with a corner inside
    the band into a list at `+0x17d8` and posts `0x482`.
  - Otherwise `FUN_0041b970` hit-tests the click (17929): `PtInRect` on each record's rectangle
    at `+0x9c`, or a GDI+ path for the one key at `+0x1710`. It then posts `0x481` with the
    record index.
  - In key-assignment mode, `FUN_0041ab10` (17213) first rejects keys on an exclusion list
    (`+0x1794`, 20 bytes) and Fn keys (VK 0xfa/0xfb, when `+0x17a8` is set).
- **`WM_TIMER` → `FUN_0041b550`** (disasm only): for timer 0x7a in lighting mode, it calls the
  engine `FUN_0041bbb0` with the stored descriptor (`+0x1760`). It does nothing else.

The lighting page's message map (`.rdata` 0x611fc8..0x612040) handles the posted messages:

- **`0x481` → `FUN_004309b0`** (31019): works only when the selected mode is the custom per-key
  mode (tree item data == device `+0x2ebc`). It toggles the clicked key between the picked colour
  and off, stores that in the per-key table and sends it to the board (`FUN_004756a0`).
- **`0x482` → `FUN_00430af0`** (31079): paints every key in the band the same way.
- **`WM_LBUTTONDOWN` on the page → `FUN_00431b00`** (31678): starts a window drag. If
  ReactionEffect is set, it also gives the page focus so that typing reaches it.

Neither handler calls `FUN_0041e640`, so a click is never a "press".

## The +0x178c flag

The starter `FUN_0041ba70` sets `+0x178c` to 1 for types 0x11, 0x12, 0x13, 0x14 and 0x18
(18053-18059, disasm 0x41bb53..0x41bb7c). The constructor clears it (16660). No instruction in
`.text` reads `[reg+0x178c]`; a grep of the full disassembly finds only the two writes. It looks
like a dead "reactive" flag. A read through some computed address can't be ruled out.

## Other input sources: none

- `SetWindowsHookExW` is called only by MFC internals: `AfxHookWindowCreate` (WH_CBT),
  `_AfxMsgFilterHook` (WH_MSGFILTER), and two WH_MOUSE hooks for menus and tooltips. There is no
  WH_KEYBOARD or WH_KEYBOARD_LL hook.
- There are no `RegisterRawInputDevices` or `GetRawInputData` imports.
- `FUN_0041e640` has exactly the three callers above, so the board's input reports can't reach it.
- `0x481` also appears at decomp 78554 (`FUN_00477eb0`), but there it is the macro-sharing
  download thread posting to a different window. It is unrelated.

## In our port

- `press(led)` stands in for `FUN_0041e640`, called with the LED index of the pressed key. The
  page calls it on keydown while focused and, as our own extension, when a key on the map is
  clicked.
- To match the driver, call it on every keydown, auto-repeat included, and ignore keyup. Keys
  missing from `options.keys` are ignored.
- The driver's ReactionEffect gate is not ported. Our preview always reacts.
- When nobody has pressed anything for a while, each of our three effects presses random keys by
  itself, so that the preview isn't blank. This is clearly marked in the code as **not from the
  driver**.
