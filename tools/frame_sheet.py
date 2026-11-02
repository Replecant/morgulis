import sys
import numpy as np
from PIL import Image
# Рамка листа персонажа (со скелетом справа): левая часть удлиняется вставками, у ниши
# со скелетом вытягиваются арки постамента, стык спрятан в тёмном промежутке.
# Использование: python3 tools/frame_sheet.py рамка.webp выход.png  (результат 1920×1280)
import os
SRC, OUT = sys.argv[1], sys.argv[2]
sys.argv = ['x', SRC, OUT, '1920', '1280']
here = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(here, 'frame_stretch.py')).read().split("# 1) по ширине")[0])  # best_chunk / tile / widen
src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.int32)
H, W, _ = src.shape
TW, TH = 1920, 1280
N = TH - H                # добавка по высоте
XS = 1162                 # правее — ниша со скелетом (её не растягиваем, а сдвигаем вниз целиком)
TOPB = 216                # верхняя полоса (небо, балюстрада, арка) не двигается

# --- граница: выше 790 — по тёмному промежутку x=1162, ниже — по стенке постамента x=1232
YB, XL, XR = 790, 1162, 1232
src = src.copy()
dark = src[400:470, 1172:1222]
def dark_fill(h, w):
    return tile(tile(dark, w, 1), h, 0)
src[YB:860, 1205:XR] = dark_fill(860 - YB, XR - 1205)   # обломок карниза постамента слева от стенки
# левая часть (рамка, шторы, трубы): вставка рядов в середине
L = src[:, :XL]
d, s1, p1 = best_chunk(L, 330, 720, 90, 220, 0)
print('L rows', s1, p1, round(d, 1), file=sys.stderr)
yL = s1 + p1
# правая часть (постамент): вставка рядов в прямой части арок
P = src[:, XR:]
d, s2, p2 = best_chunk(P[:, :260], 872, 945, 12, 50, 0)
print('pedestal rows', s2, p2, round(d, 1), file=sys.stderr)
yR = s2 + p2
img = np.zeros((H + N, W, 3), np.int32)
for y in range(H):
    xs = XL if y < YB else XR
    oy = y if y < yL else y + N
    img[oy, :xs] = src[y, :xs]
    oy = y if y < yR else y + N
    img[oy, xs:] = src[y, xs:]
img[yL:yL + N, :XL] = tile(src[s1:s1 + p1, :XL], N, 0)
img[yR:yR + N, XR:] = tile(src[s2:s2 + p2, XR:], N, 0)
img[YB:YB + N, XL:XR] = dark_fill(N, XR - XL)

# --- по ширине: верх — у левой башенки (небо + балюстрада), середина — тёмное поле, низ — прямые трубы
addw = TW - W
TOP2, BOT2 = TOPB, 800 + N
Q = 122
def widen_top(band, cuts, add):
    lower = band[Q:]; parts, pos = [], 0
    share = [add // len(cuts) + (1 if i < add % len(cuts) else 0) for i in range(len(cuts))]
    sky = band[:Q, 4:28]
    for (lo, hi), n in zip(cuts, share):
        d, s, p = best_chunk(lower, lo, hi, 10, 40, 1)
        print('top chunk', s, p, round(d, 1), file=sys.stderr)
        ins = np.concatenate([tile(sky, n, 1), tile(lower[:, s:s + p], n, 1)], axis=0)
        parts += [band[:, pos:s + p], ins]; pos = s + p
    parts.append(band[:, pos:])
    return np.concatenate(parts, axis=1)
top = widen_top(img[:TOP2], [(190, 300)], addw)
mid = widen(img[TOP2:BOT2], [(500, 600)], addw)
bot = widen(img[BOT2:], [(460, 560), (975, 1090)], addw)
out = np.concatenate([top, mid, bot], axis=0)
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(OUT)
print('size', out.shape, file=sys.stderr)
