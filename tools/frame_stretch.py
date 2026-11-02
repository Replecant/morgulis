# Растянуть пиксельную рамку (картинку 1536×1024) до нового размера, вставляя повторяющиеся
# куски там, где это незаметно: балюстрада сверху, трубы снизу, складки штор по бокам.
# Использование: python3 tools/frame_stretch.py рамка.webp выход.webp ширина высота
# Так из рамки автора сделана src/assets/inv-frame.webp (2286×1524, затем уменьшена до 1920×1280).
import sys
import numpy as np
from PIL import Image
src = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.int32)
H, W, _ = src.shape
TOP, BOT, LEFT, RIGHT = 252, 869, 184, 1354   # внутреннее поле: x LEFT..RIGHT, y TOP..BOT
TW, TH = int(sys.argv[3]), int(sys.argv[4])
addw, addh = TW - W, TH - H

def best_chunk(band, lo, hi, pmin, pmax, axis, quiet=0):
    """band: срез картинки; ищем [s, s+p) в lo..hi с минимальным швом между s и s+p."""
    best = None
    for p in range(pmin, pmax + 1):
        for s in range(lo, hi - p):
            if axis == 1: d = np.abs(band[:, s] - band[:, s + p]).sum()
            else: d = np.abs(band[s, :] - band[s + p, :]).sum()
            d = d / band.shape[0 if axis == 1 else 1]
            if quiet: d += band[:quiet, s:s + p].std() * 4  # над куском — пустое небо, без дыма
            if best is None or d < best[0]: best = (d, s, p)
    return best

def tile(chunk, n, axis):
    reps = -(-n // chunk.shape[axis]) + 1
    t = np.concatenate([chunk] * reps, axis=axis)
    return t[:, :n] if axis == 1 else t[:n]

def widen(band, cuts, add, axis=1, pmin=10, pmax=60, quiet=0):
    """cuts: [(lo, hi)] области поиска; добавка делится поровну между ними."""
    parts, pos = [], 0
    share = [add // len(cuts) + (1 if i < add % len(cuts) else 0) for i in range(len(cuts))]
    found = []
    for (lo, hi), n in zip(cuts, share):
        d, s, p = best_chunk(band, lo, hi, pmin, min(pmax, hi - lo - 1), axis, quiet)
        found.append((s, p, round(d, 1)))
        if axis == 1:
            parts += [band[:, pos:s + p], tile(band[:, s:s + p], n, 1)]
        else:
            parts += [band[pos:s + p], tile(band[s:s + p], n, 0)]
        pos = s + p
    parts.append(band[:, pos:] if axis == 1 else band[pos:])
    print('chunks', found, file=sys.stderr)
    return np.concatenate(parts, axis=axis)

# 1) по ширине: верх — балюстрады у готических башен, низ — прямые участки труб, середина — тёмное поле
Q = 160  # выше — небо: вставки сверху берём из чистого неба, ниже — балюстрада
def widen_top(band, cuts, add):
    lower = band[Q:]
    parts, pos = [], 0
    share = [add // len(cuts) + (1 if i < add % len(cuts) else 0) for i in range(len(cuts))]
    sky = band[:Q, 4:28]
    for (lo, hi), n in zip(cuts, share):
        d, s, p = best_chunk(lower, lo, hi, 10, 40, 1)
        print('top chunk', s, p, round(d, 1), file=sys.stderr)
        ins = np.concatenate([tile(sky, n, 1), tile(lower[:, s:s + p], n, 1)], axis=0)
        parts += [band[:, pos:s + p], ins]; pos = s + p
    parts.append(band[:, pos:])
    return np.concatenate(parts, axis=1)
top = widen_top(src[:TOP], [(196, 240), (1225, 1345)], addw)
mid = widen(src[TOP:BOT], [(400, 470), (1000, 1070)], addw)
bot = widen(src[BOT:], [(296, 372), (1000, 1110)], addw)
img = np.concatenate([top, mid, bot], axis=0)
# 2) по высоте: складки штор и стойки по бокам (ряд целиком — внутреннее поле однородно)
img = widen(img, [(300, 560), (520, 840)], addh, axis=0, pmin=90, pmax=220)
Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(sys.argv[2], quality=90)
print('inner', LEFT, TOP, TW - (W - RIGHT), TH - (H - BOT), file=sys.stderr)
