"""Pack a drum sample folder into kombinat/samples.js so the page can load it
from disk (a file:// page cannot fetch files, so the WAVs ride inside a script
as base64).

    python -I docs/spikes/pack-samples.py <free-drum-samples/drum-samples> docs/spikes/kombinat/samples.js

Source: github.com/Boochi44/free-drum-samples, CC0 1.0. Kits: 01-hard-trap,
02-bounce, 03-soulful-vintage. The fx folder (cymbals) is left out.
"""
import base64, json, pathlib, sys

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
KITS = {'01-hard-trap': 'trap', '02-bounce': 'bounce', '03-soulful-vintage': 'vintage'}
CATS = {'kicks': 'kick', '808s': '808', 'snares': 'snare', 'claps': 'clap', 'hi-hats': 'chat', 'open-hats': 'ohat', 'percs': 'perc'}

kits = {}
for kit_dir in sorted(src.iterdir()):
    kit = KITS.get(kit_dir.name)
    if not kit:
        continue
    kits[kit] = {}
    for cat_dir in sorted(kit_dir.iterdir()):
        cat = CATS.get(cat_dir.name)
        if not cat:
            continue
        kits[kit][cat] = [
            {'name': f'{kit} {f.stem}', 'wav': base64.b64encode(f.read_bytes()).decode()}
            for f in sorted(cat_dir.glob('*.wav'))
        ]

out.write_text(
    '// Drum one-shots, CC0 1.0, from github.com/Boochi44/free-drum-samples. Made by pack-samples.py; do not edit.\n'
    'window.K = window.K || {};\n'
    'K.SAMPLES = ' + json.dumps(kits) + ';\n',
    encoding='utf-8',
)
n = sum(len(v) for k in kits.values() for v in k.values())
print(f'{n} samples, {out.stat().st_size // 1024} KB -> {out}')
