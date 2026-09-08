# 生成 PWA 图标（纯标准库手写 PNG，无需 Pillow）
import zlib, struct, os, sys

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'www', 'icons')
BG = (79, 70, 229, 255)   # 主色 #4F46E5
FG = (255, 255, 255, 255)


def rounded(x, y, size, r):
    cx = min(max(x, r), size - r)
    cy = min(max(y, r), size - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size):
    px = [[(0, 0, 0, 0)] * size for _ in range(size)]
    r = size * 0.20
    m = size * 0.24
    cell = (size - 2 * m) / 3
    t = max(2.0, size * 0.045)
    for y in range(size):
        row = [None] * size
        for x in range(size):
            if not rounded(x + 0.5, y + 0.5, size, r):
                row[x] = (0, 0, 0, 0)
                continue
            c = BG
            if m <= x <= size - m and m <= y <= size - m:
                for i in (1, 2):
                    if abs(x - (m + cell * i)) <= t / 2 or abs(y - (m + cell * i)) <= t / 2:
                        c = FG
                if (abs(x - m) <= t / 2 or abs(x - (size - m)) <= t / 2
                        or abs(y - m) <= t / 2 or abs(y - (size - m)) <= t / 2):
                    c = FG
            # 高亮第一节课的格子
            if (m + t * 0.9) <= x <= (m + cell - t * 0.9) and (m + t * 0.9) <= y <= (m + cell - t * 0.9):
                c = FG
            row[x] = c
        px[y] = row

    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw += struct.pack('BBBB', *px[y][x])

    def chunk(typ, data):
        return (struct.pack('>I', len(data)) + typ + data
                + struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff))

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for s in (192, 512):
        p = os.path.join(OUT, 'icon-%d.png' % s)
        with open(p, 'wb') as f:
            f.write(render(s))
        print('written', p, os.path.getsize(p), 'bytes')
