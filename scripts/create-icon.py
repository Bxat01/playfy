"""Create GameDeck's small PNG and ICO app icons using only the Python stdlib."""

from pathlib import Path
import struct
import zlib


ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "src-tauri" / "icons"
PUBLIC_DIR = ROOT / "public"


def rounded_rect(x, y, left, top, right, bottom, radius):
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def make_pixels(size=256):
    scale = size / 256
    pixels = bytearray()

    def inside(x, y, bounds, radius):
        return rounded_rect(x / scale, y / scale, *bounds, radius)

    for py in range(size):
        for px in range(size):
            x, y = px + .5, py + .5
            if inside(x, y, (8, 8, 248, 248), 64):
                color = (24, 21, 32, 255)
                if inside(x, y, (34, 34, 222, 222), 52):
                    t = max(0, min(1, (x / scale + y / scale - 68) / 340))
                    color = (int(198 - 76 * t), int(181 - 77 * t), int(253 - 12 * t), 255)
                    if inside(x, y, (53, 83, 203, 173), 32):
                        color = (35, 28, 50, 255)

                    gx, gy = x / scale, y / scale
                    if 87 <= gx <= 121 and 101 <= gy <= 155 and (abs(gx - 104) < 5 or abs(gy - 128) < 5):
                        color = (238, 229, 255, 255)
                    for dx, dy in ((158, 111), (176, 145)):
                        if (gx - dx) ** 2 + (gy - dy) ** 2 <= 5 ** 2:
                            color = (238, 229, 255, 255)
            else:
                color = (0, 0, 0, 0)
            pixels.extend(color)
    return pixels


def png(size):
    source = make_pixels(size)
    stride = size * 4
    raw = b"".join(b"\0" + source[row:row + stride] for row in range(0, len(source), stride))

    def chunk(name, data):
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data) & 0xffffffff)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


ICON_DIR.mkdir(parents=True, exist_ok=True)
for name, size in (("icon.png", 256), ("128x128@2x.png", 256), ("128x128.png", 128), ("32x32.png", 32)):
    (ICON_DIR / name).write_bytes(png(size))

image = png(256)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
(PUBLIC_DIR / "gamedeck-mark.png").write_bytes(image)
entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(image), 22)
(ICON_DIR / "icon.ico").write_bytes(struct.pack("<HHH", 0, 1, 1) + entry + image)
icns_chunk = b"ic08" + struct.pack(">I", 8 + len(image)) + image
(ICON_DIR / "icon.icns").write_bytes(b"icns" + struct.pack(">I", 8 + len(icns_chunk)) + icns_chunk)
