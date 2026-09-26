"""Lay each screen from the phone tour out across every device in one picture.

    python scripts/phone-sheet.py [.shots/phone-tour]

Writes <tour>/sheets/<nn-screen>.png: the same screen on each phone, side by
side at the same physical scale (CSS pixels), with each phone's name and
anything the tour measured written underneath. One picture per screen is
what makes "does this break on the small phone" a glance instead of a hunt.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.shots/phone-tour')
SCALE = 1.0  # CSS pixels per sheet pixel
GAP = 24
CAPTION = 120


def font(size):
    for name in ('segoeui.ttf', 'arial.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


def main():
    devices = [d for d in sorted(ROOT.iterdir()) if (d / 'report.json').exists()]
    if not devices:
        sys.exit(f'no tour under {ROOT}')
    reports = {d.name: json.loads((d / 'report.json').read_text(encoding='utf-8')) for d in devices}
    order = ['iphone', 'iphone-se', 'webkit-iphone', 'pixel', 'galaxy']
    devices.sort(key=lambda d: order.index(d.name) if d.name in order else 99)
    files = sorted({entry['file'] for r in reports.values() for entry in r['report']})
    out = ROOT / 'sheets'
    out.mkdir(exist_ok=True)
    title, small = font(22), font(15)

    for file in files:
        tiles = []
        for d in devices:
            path = d / file
            if not path.exists():
                continue
            info = reports[d.name]['device']
            entry = next((e for e in reports[d.name]['report'] if e['file'] == file), {})
            img = Image.open(path).convert('RGB')
            img = img.resize((round(info['width'] * SCALE), round(info['height'] * SCALE)), Image.LANCZOS)
            notes = []
            if entry.get('error'):
                notes.append('FAILED: ' + entry['error'][:60])
            if entry.get('scrollsSideways'):
                notes.append('scrolls sideways')
            if entry.get('offEdge'):
                notes.append('off edge: ' + '; '.join(entry['offEdge'][:2])[:70])
            if entry.get('zoomOnFocus'):
                notes.append('iOS zoom: ' + ', '.join(entry['zoomOnFocus'][:2])[:70])
            tiles.append((f"{info['label']} {info['width']}x{info['height']}", notes, img))
        if not tiles:
            continue
        width = sum(t[2].width for t in tiles) + GAP * (len(tiles) + 1)
        height = max(t[2].height for t in tiles) + CAPTION + GAP * 2 + 40
        sheet = Image.new('RGB', (width, height), (32, 32, 36))
        draw = ImageDraw.Draw(sheet)
        draw.text((GAP, 10), file[:-4], fill=(240, 240, 240), font=title)
        x = GAP
        for label, notes, img in tiles:
            sheet.paste(img, (x, 50))
            y = 50 + img.height + 8
            draw.text((x, y), label, fill=(200, 200, 200), font=small)
            for line in notes[:4]:
                y += 20
                draw.text((x, y), line[:48], fill=(255, 140, 110), font=small)
            x += img.width + GAP
        sheet.save(out / file)
    print(f'wrote {len(files)} sheets to {out}')


if __name__ == '__main__':
    main()
