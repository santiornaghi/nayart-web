#!/usr/bin/env python3
"""Agrega la autoría (EXIF Artist/Copyright/Descripción) a todas las JPG de img/.
No recomprime: solo inserta/reemplaza el bloque EXIF, la imagen queda idéntica.
Uso: python3 scripts/autoria-imagenes.py   (desde la carpeta nayart-web)"""
import os, struct, sys

ARTISTA   = 'Santiago Ornaghi (NAYA)'
COPYRIGHT = '(c) Santiago Ornaghi - Naya Lab - nayaart.com. Todos los derechos reservados.'
DESC      = 'Obra de Santiago Ornaghi. Prohibida su reproduccion sin autorizacion. nayaart.com'

def exif_bloque():
    # TIFF little-endian con IFD0: ImageDescription(0x010E), Artist(0x013B), Copyright(0x8298)
    tags = [(0x010E, DESC), (0x013B, ARTISTA), (0x8298, COPYRIGHT)]
    datos = [t[1].encode('utf-8') + b'\x00' for t in tags]
    n = len(tags)
    ifd_off = 8
    data_off = ifd_off + 2 + n * 12 + 4
    ent = b''; blob = b''
    for (tag, _), d in zip(tags, datos):
        ent += struct.pack('<HHI', tag, 2, len(d))          # tipo 2 = ASCII
        if len(d) <= 4:
            ent += d.ljust(4, b'\x00')
        else:
            ent += struct.pack('<I', data_off + len(blob)); blob += d
            if len(blob) % 2: blob += b'\x00'
    tiff = b'II*\x00' + struct.pack('<I', ifd_off) + struct.pack('<H', n) + ent + struct.pack('<I', 0) + blob
    payload = b'Exif\x00\x00' + tiff
    return b'\xFF\xE1' + struct.pack('>H', len(payload) + 2) + payload

def procesar(ruta, app1):
    b = open(ruta, 'rb').read()
    if b[:2] != b'\xFF\xD8': return 'no-jpg'
    i = 2; segs = []
    while i < len(b) - 4 and b[i] == 0xFF:
        m = b[i+1]
        if m in (0xDA, 0xD9): break             # inicio de datos de imagen
        L = struct.unpack('>H', b[i+2:i+4])[0]
        segs.append((m, b[i:i+2+L])); i += 2 + L
    resto = b[i:]
    # si el EXIF viejo trae orientación, no tocar el archivo (podría rotarse)
    for m, s in segs:
        if m == 0xE1 and s[4:10] == b'Exif\x00\x00' and (b'\x12\x01\x03\x00' in s[:400] or b'\x01\x12\x00\x03' in s[:400]):
            if b'\x12\x01\x03\x00\x01\x00\x00\x00\x01\x00' not in s[:400] and b'\x01\x12\x00\x03\x00\x00\x00\x01\x00\x01' not in s[:400]:
                return 'saltada (orientacion)'
    # quitar EXIF previo (APP1 'Exif'); conservar JFIF, ICC, etc.
    segs = [(m, s) for (m, s) in segs if not (m == 0xE1 and s[4:10] == b'Exif\x00\x00')]
    out = b'\xFF\xD8'
    puesto = False
    for m, s in segs:
        out += s
        if m == 0xE0 and not puesto: out += app1; puesto = True   # después de JFIF
    if not puesto: out = b'\xFF\xD8' + app1 + out[2:]
    out += resto
    if out != b:
        open(ruta, 'wb').write(out); return 'ok'
    return 'igual'

if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else 'img'
    app1 = exif_bloque(); c = {}
    for raiz, _, fs in os.walk(base):
        for f in fs:
            if f.lower().endswith(('.jpg', '.jpeg')):
                r = procesar(os.path.join(raiz, f), app1); c[r] = c.get(r, 0) + 1
    print(c)
