#!/usr/bin/env python3
"""Extract AULA HID frames from a USB pcapng capture.

Two framings are recognised:
  0x06  520-byte feature reports, the wired protocol (SET_REPORT = tx, GET_REPORT = rx)
  0x13  20-byte output/input reports, the 2.4 GHz dongle protocol

Prints one JSON object per capture: {"source": ..., "frames": [{"dir": "tx"|"rx", "hex": ...}]}.
Use it to turn your own captures into golden files for the Vitest suite.

Supported link types:
  249 (USBPcap, Windows + Wireshark)
  266 (Darwin USB, Wireshark on macOS)

Usage:
  python3 -I scripts/pcap-frames.py capture.pcapng > test/golden/my-capture.json
"""
import json
import struct
import sys

LINKTYPE_USBPCAP = 249
LINKTYPE_USB_DARWIN = 266
# report ID -> frame length including the report ID
FRAMES = {0x06: 520, 0x13: 20}
SET_REPORT_SETUP = bytes([0x21, 0x09])


def packets(path):
    """Yield (linktype, packet_bytes) for each Enhanced Packet Block."""
    data = open(path, "rb").read()
    off, endian, links = 0, "<", []
    while off + 12 <= len(data):
        btype = struct.unpack_from(endian + "I", data, off)[0]
        if btype == 0x0A0D0D0A:  # Section Header Block sets the byte order
            bom = struct.unpack_from("<I", data, off + 8)[0]
            endian = "<" if bom == 0x1A2B3C4D else ">"
        blen = struct.unpack_from(endian + "I", data, off + 4)[0]
        body = data[off + 8 : off + blen - 4]
        if btype == 1:  # Interface Description Block
            links.append(struct.unpack_from(endian + "H", body, 0)[0])
        elif btype == 6:  # Enhanced Packet Block
            iface, _, _, caplen, _ = struct.unpack_from(endian + "IIIII", body, 0)
            yield links[iface], body[20 : 20 + caplen]
        off += blen


def split(link, pkt):
    """Return (endpoint, payload) for one USB packet."""
    if link == LINKTYPE_USB_DARWIN:
        return pkt[30], pkt[pkt[2] :]
    if link == LINKTYPE_USBPCAP:
        header_len = struct.unpack_from("<H", pkt, 0)[0]
        return pkt[21], pkt[header_len:]
    raise SystemExit(f"unsupported link type {link}")


def frames(path):
    out = []
    for link, pkt in packets(path):
        endpoint, payload = split(link, pkt)
        # A SET_REPORT setup stage may carry the data stage right after the 8 setup bytes.
        if payload[:2] == SET_REPORT_SETUP and len(payload) - 8 in FRAMES.values():
            payload = payload[8:]
        if not payload or FRAMES.get(payload[0]) != len(payload):
            continue
        out.append({"dir": "rx" if endpoint & 0x80 else "tx", "hex": payload.hex()})
    return out


if __name__ == "__main__":
    for path in sys.argv[1:]:
        print(json.dumps({"source": path, "frames": frames(path)}, indent=2))
