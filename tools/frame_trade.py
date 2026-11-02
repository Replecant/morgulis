import sys, os
import numpy as np
from PIL import Image
# Рамка торговли (два скелета торгуются над полем): верх удлиняется у балюстрад возле
# готических башенок (выше — чистое небо), середина — тёмным полем, низ — по прямым трубам,
# по высоте — складками штор.
# Использование: python3 tools/frame_trade.py рамка.webp выход.png  (результат 2286×1524)
SRC, OUT = sys.argv[1], sys.argv[2]
sys.argv = ['x', SRC, OUT, '2286', '1524']
here = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(here, 'frame_stretch.py')).read().split("# 1) по ширине")[0])  # best_chunk / tile / widen
src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.int32)
H, W, _ = src.shape
TW, TH = 2286, 1524
TOPB, BOTB = 234, 779
addw, addh = TW - W, TH - H
Q = 140
def widen_top(band, cuts, add):
    """cuts: [(x вставки, (lo, hi) — где искать образец нижней части)]; сверху вставка — чистое небо."""
    lower = band[Q:]; parts, pos = [], 0
    share = [add // len(cuts) + (1 if i < add % len(cuts) else 0) for i in range(len(cuts))]
    sky = band[:Q, 4:28]
    for (at, (lo, hi)), n in zip(cuts, share):
        d, s, p = best_chunk(lower, lo, hi, 10, 40, 1)
        print('top chunk', at, s, p, round(d, 1), file=sys.stderr)
        ins = np.concatenate([tile(sky, n, 1), tile(lower[:, s:s + p], n, 1)], axis=0)
        parts += [band[:, pos:at], ins]; pos = at
    parts.append(band[:, pos:])
    return np.concatenate(parts, axis=1)
# слева — между готической башенкой и первой трубой (выше — пустое небо), образец — кирпич под трубами
top = widen_top(src[:TOPB], [(219, (228, 300)), (1306, (1290, 1342))], addw)
mid = widen(src[TOPB:BOTB], [(400, 470), (1000, 1070)], addw)
bot = widen(src[BOTB:], [(460, 560), (975, 1090)], addw)
img = np.concatenate([top, mid, bot], axis=0)
img = widen(img, [(300, 500), (520, 740)], addh, axis=0, pmin=90, pmax=200)
Image.fromarray(img.clip(0, 255).astype(np.uint8)).save(OUT)
print('inner', 135, TOPB, TW - (W - 1401), TH - (H - BOTB), file=sys.stderr)
