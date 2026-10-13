"""pe-vtable.py EXE CLASS: print the MSVC vtable of CLASS in a 32-bit PE, found through its RTTI.

Reads the file only. Run it with python3 -I on untrusted binaries.
"""
import struct, sys
data = open(sys.argv[1], 'rb').read()
pe = struct.unpack_from('<I', data, 0x3c)[0]
nsec = struct.unpack_from('<H', data, pe + 6)[0]
optsize = struct.unpack_from('<H', data, pe + 20)[0]
base = struct.unpack_from('<I', data, pe + 24 + 28)[0]
secs = []
for i in range(nsec):
    o = pe + 24 + optsize + 40 * i
    name = data[o:o + 8].rstrip(b'\0').decode()
    vsize, va, rsize, raw = struct.unpack_from('<IIII', data, o + 8)
    secs.append((name, base + va, max(vsize, rsize), raw))
def off(v):
    for n, va, sz, raw in secs:
        if va <= v < va + sz: return raw + v - va
def va_of(o):
    for n, va, sz, raw in secs:
        if raw <= o < raw + sz: return va + o - raw
def sec(v):
    for n, va, sz, raw in secs:
        if va <= v < va + sz: return n
name = ('.?AV%s@@' % sys.argv[2]).encode() + b'\0'
td = va_of(data.index(name) - 8)
for p in range(0, len(data) - 4, 4):
    if struct.unpack_from('<I', data, p)[0] != td: continue
    col = p - 12
    sig, offset = struct.unpack_from('<II', data, col)
    if sig or offset: continue
    colva = va_of(col)
    needle = struct.pack('<I', colva)
    q = data.find(needle)
    while q >= 0:
        vt = va_of(q + 4)
        print('vtable at 0x%x' % vt)
        i = 0
        while True:
            f = struct.unpack_from('<I', data, q + 4 + 4 * i)[0]
            if sec(f) != '.text': break
            print('  +0x%02x  FUN_%08x' % (4 * i, f))
            i += 1
        q = data.find(needle, q + 1)
