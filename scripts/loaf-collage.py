"""
The Loaf collage: a hundred of his face, cut out crooked and glued down the
way a five-year-old would, and a sprite sheet of the cutouts for the
canvas. His pictures never leave this PC; nothing here calls out.
"""
import os, random, math
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageOps

SRC = r'C:\Users\weshu\Desktop\loaf'
OUT = r'C:\Users\weshu\CodeProjects\GoOffline'
random.seed(7)

# (file, crop box) picked by eye.
FACES = [
    ('Screenshot 2025-05-04 012552.png', (55, 0, 255, 266)),
    ('Screenshot 2025-05-04 041511.png', (60, 10, 350, 420)),
    ('Screenshot 2025-10-12 040717.png', (120, 60, 700, 720)),
    ('Screenshot 2025-10-17 134520.png', (110, 0, 460, 370)),
    ('Screenshot 2025-10-21 112851.png', (30, 0, 215, 333)),
    ('Screenshot 2025-10-26 021641.png', (40, 20, 360, 378)),
    ('Screenshot 2025-11-04 125830.png', (80, 20, 340, 377)),
    ('Screenshot 2025-11-08 005518.png', (90, 0, 420, 420)),
    ('Screenshot 2025-11-08 014101.png', (30, 10, 551, 552)),
    ('Screenshot 2025-11-08 014554.png', (110, 0, 340, 328)),
    ('Screenshot 2025-11-27 201125.png', (30, 0, 201, 171)),
    ('Screenshot 2025-11-28 220228.png', (90, 20, 260, 200)),
]

def wobbly_oval_mask(w, h, wobble=0.06, border=0):
    """An oval cut out with scissors by someone who is five: the edge wanders."""
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    cx, cy = w / 2, h / 2
    rx, ry = w / 2 - border, h / 2 - border
    points = []
    steps = 48
    bumps = [random.uniform(1 - wobble, 1 + wobble) for _ in range(steps)]
    for i in range(steps):
        a = i / steps * math.tau
        # smooth the wander between neighbours so the edge is bumpy, not spiky
        k = (bumps[i - 1] + bumps[i] + bumps[(i + 1) % steps]) / 3
        points.append((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k))
    draw.polygon(points, fill=255)
    return mask

def cutout(im, size):
    """Face scaled to `size` tall-ish, on a white paper edge, oval, transparent around."""
    im = ImageOps.fit(im, (size, int(size * 1.15)), Image.LANCZOS)
    w, h = im.size
    paper = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    outer = wobbly_oval_mask(w, h, 0.05)
    paper.paste((246, 240, 228, 255), (0, 0), outer)
    inner = wobbly_oval_mask(w, h, 0.05, border=max(3, size // 26))
    face = im.convert('RGBA')
    paper.paste(face, (0, 0), inner)
    # keep the alpha as the paper's edge
    paper.putalpha(outer)
    return paper

faces = [Image.open(os.path.join(SRC, f)).convert('RGB').crop(box) for f, box in FACES]

# --- the collage ------------------------------------------------------------
W, H = 1376, 768
bg = Image.new('RGB', (W, H), (46, 33, 27))
# crayon scribbles on the paper, underneath everything
d = ImageDraw.Draw(bg)
crayons = [(214, 72, 72), (72, 128, 214), (240, 196, 60), (80, 180, 90), (230, 120, 200), (255, 140, 40)]
for _ in range(38):
    c = random.choice(crayons)
    x, y = random.uniform(0, W), random.uniform(0, H)
    pts = [(x, y)]
    for _ in range(random.randint(6, 18)):
        x += random.uniform(-60, 60); y += random.uniform(-40, 40)
        pts.append((x, y))
    d.line(pts, fill=c, width=random.randint(5, 12), joint='curve')
bg = bg.filter(ImageFilter.GaussianBlur(1.2))
bg = ImageEnhance.Brightness(bg).enhance(0.55)

collage = bg.convert('RGBA')
count = 0
placed = []
# biggest first at the back, little ones on top, like a kid running out of room
sizes = sorted([random.randint(70, 230) for _ in range(100)], reverse=True)
for size in sizes:
    face = faces[count % len(faces)] if count < len(faces) else random.choice(faces)
    piece = cutout(face, size)
    piece = piece.rotate(random.uniform(-40, 40), resample=Image.BICUBIC, expand=True)
    # a soft drop shadow, like paper with too much glue
    shadow = Image.new('RGBA', piece.size, (0, 0, 0, 0))
    shadow.putalpha(piece.split()[3].point(lambda a: int(a * 0.5)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(4))
    x = random.randint(-piece.width // 3, W - piece.width * 2 // 3)
    y = random.randint(-piece.height // 3, H - piece.height * 2 // 3)
    collage.alpha_composite(shadow, (x + 5, y + 7))
    collage.alpha_composite(piece, (x, y))
    count += 1

# the whole thing steps down so words on top of it win
collage = collage.convert('RGB')
collage = ImageEnhance.Brightness(collage).enhance(0.62)
collage = ImageEnhance.Contrast(collage).enhance(0.92)
collage.save(os.path.join(OUT, 'web', 'public', 'backdrops', 'loaf.jpg'), quality=86, optimize=True, progressive=True)
print('collage', count, 'faces')

# --- the sprite sheet: one clean cutout per picture, for the canvas -------------
F = 200
sheet = Image.new('RGBA', (F * len(faces), F), (0, 0, 0, 0))
for i, face in enumerate(faces):
    piece = cutout(face, int(F * 0.82))
    sheet.alpha_composite(piece, (i * F + (F - piece.width) // 2, (F - piece.height) // 2))
sheet.save(os.path.join(OUT, 'web', 'public', 'backdrops', 'loaf-faces.png'), optimize=True)
print('sheet', sheet.size)
