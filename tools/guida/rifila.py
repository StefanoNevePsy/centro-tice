#!/usr/bin/env python3
"""Toglie lo spazio vuoto in fondo alle schermate (carta uniforme sotto il contenuto)."""
import sys, glob, os
from PIL import Image, ImageChops

for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.png'))):
    im = Image.open(f).convert('RGB')
    w, h = im.size
    fondo = im.getpixel((w // 2, h - 3))
    # dal basso si risale finché le righe sono tutte (quasi) del colore di fondo
    y = h - 1
    while y > 200:
        riga = im.crop((0, y, w, y + 1))
        diff = ImageChops.difference(riga, Image.new('RGB', (w, 1), fondo)).getextrema()
        if max(c[1] for c in diff) > 18:
            break
        y -= 4
    if y < h - 60:
        im.crop((0, 0, w, min(h, y + 40))).save(f, optimize=True)
        print('rifilata', os.path.basename(f), h, '→', y + 40)

# copie JPEG leggere per il PDF (le PNG restano per chi vuole riusarle)
for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.png'))):
    Image.open(f).convert('RGB').save(f[:-4] + '.jpg', quality=82, optimize=True, progressive=True)
