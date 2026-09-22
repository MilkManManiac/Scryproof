"""
Sprite sheets for the /<name>-jump commands, cut from Wes's own Meepo
auto-battler (`CodeProjects/meepo-auto-battler/public/characters`). Each
character's five processed jump frames (128x128, transparent) go side by
side into one 640x128 PNG at `web/public/meepo/<name>.png`, and the
first frame doubles as the character's picture in the chat line.

Run once, from the repo root, whenever a character is added over there:
    python scripts/meepo-sheets.py
It prints the list that belongs in `web/src/lib/commands.ts`.
"""
import glob, os, sys
from PIL import Image

SRC = os.path.expanduser('~/CodeProjects/meepo-auto-battler/public/characters')
OUT = os.path.join(os.path.dirname(__file__), '..', 'web', 'public', 'meepo')
os.makedirs(OUT, exist_ok=True)

names = []
for folder in sorted(os.listdir(SRC), key=str.lower):
    frames = sorted(glob.glob(os.path.join(SRC, folder, 'processed', '[Jj]ump', '*.png')))
    if len(frames) < 2:
        print('skip', folder, file=sys.stderr)
        continue
    frames = frames[:5]
    sheet = Image.new('RGBA', (128 * len(frames), 128), (0, 0, 0, 0))
    for i, path in enumerate(frames):
        frame = Image.open(path).convert('RGBA')
        if frame.size != (128, 128):
            frame = frame.resize((128, 128), Image.NEAREST)
        sheet.paste(frame, (128 * i, 0))
    slug = folder.lower()
    sheet.save(os.path.join(OUT, f'{slug}.png'), optimize=True)
    names.append((slug, folder, len(frames)))

for slug, folder, n in names:
    print(f"  {{ id: '{slug}', name: '{folder}', frames: {n} }},")
