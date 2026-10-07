# Firma "NAYA" en rojo sobre las fotos analógicas. Trabaja desde copias limpias para no firmar dos veces.
import sys, os, glob, shutil
from PIL import Image, ImageOps
raiz = sys.argv[1]                      # carpeta nayart-web
fotos = os.path.join(raiz, 'img/fotos'); limpias = os.path.join(raiz, 'escaneos/_fotos_limpias')
logo = Image.open(os.path.join(raiz, 'img/logo-naya.png')).convert('RGBA')
a = logo.split()[3]
rojo = Image.new('RGBA', logo.size, (196, 30, 36, 255)); rojo.putalpha(a.point(lambda v: int(v*0.92)))
for sub in ['', 'm']:
    src = os.path.join(fotos, sub); bak = os.path.join(limpias, sub); os.makedirs(bak, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(src, '*.jpg'))):
        b = os.path.join(bak, os.path.basename(f))
        if not os.path.exists(b): shutil.copy2(f, b)        # primera vez: guardo la limpia
        im = Image.open(b).convert('RGB'); W, H = im.size
        w = int(min(W, H) * 0.16); h = int(w * logo.height / logo.width)
        L = rojo.resize((w, h), Image.LANCZOS); m = int(min(W, H) * 0.035)
        im.paste(L, (W - w - m, H - h - m), L)
        im.save(f, quality=82 if sub == '' else 80, optimize=True, progressive=True)
        print('firmada', sub, os.path.basename(f))
