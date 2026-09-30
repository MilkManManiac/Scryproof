#!/usr/bin/env python3
"""
geo-stock.py - build the photo stock for the daily "where in the world" game.

What it does
  Samples street-level photos from Panoramax (https://panoramax.xyz, a
  federation of open street-level imagery instances; photos are CC-BY-SA-4.0),
  spread over as many countries as Panoramax covers, filters out junk
  (night, blur, mostly sky/road, duplicates), strips every byte of metadata,
  and writes:
    - <out-dir>/<id>.jpg              the photos (long edge <= 1600, no EXIF/GPS/XMP)
    - server/src/geo/stock.json       one record per photo (location, country, credit)
    - <out-dir>/geo-stock-state.json  progress, so a rerun resumes or extends

Why it is built this way
  The photos are open-licensed, downloaded once by this script, and served
  from our own box. The app never contacts Panoramax at runtime, so players'
  browsers leak nothing to a third party. Filenames are random (g_ + 12 hex)
  and carry no trace of the source, and the files carry no GPS, so the answer
  can't be read out of the image.

How it samples
  Each country (from the game's own outlines in web/src/lib/travle-map.ts)
  gets a weight of sqrt(area). The builder repeatedly picks the most
  under-served country, drops a random point inside it, asks Panoramax for the
  photos nearest that point, and keeps the best new one. A country is retired
  when repeated tries find nothing new. Limits: no country above --max-share of
  the stock, photos >= --min-km apart, no two from the same sequence within
  --seq-km, and at most --per-seq from any one sequence. Real street-level
  captures beat park4night snapshots; flat beats 360, and a 360 panorama is
  used only as a cropped forward view. The automatic filters can't see
  indoor shots, menus or burned-in overlays, so eyeball the contact sheets
  and --drop what slips through.

Usage
  python scripts/geo-stock.py --count 650          # build, or resume, or extend
  python scripts/geo-stock.py --sheets --labels    # contact sheets (labels = country + id; spoilers)
  python scripts/geo-stock.py --drop g_ab..,g_cd..  # remove junk spotted on a sheet; rerun refills
  python scripts/geo-stock.py --write-only         # rewrite stock.json from state

Requires Python 3.9+ and Pillow. Polite by default: ~3 requests/second,
retries with exponential backoff.
"""

import argparse
import io
import json
import math
import os
import random
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageStat

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAP_TS = os.path.join(REPO, "web", "src", "lib", "travle-map.ts")
DEFAULT_STOCK = os.path.join(REPO, "server", "src", "geo", "stock.json")
DEFAULT_OUT = os.path.join(os.path.expanduser("~"), "Documents", "Scryproof-keep", "game-photos", "geo")

API = "https://api.panoramax.xyz/api/search"
USER_AGENT = "scryproof-geo-stock/1 (one-time download for a private game)"
LICENSES = {"CC-BY-SA-4.0"}  # keep the stock under one licence
# park4night's imported campsite photos cover the whole world, but they are
# snapshots (often a camper van in front), not street-level captures. Use them
# only where no real street-level sequence is near the sampled point.
LOW_PRIORITY_PRODUCERS = {"p4n-pics"}

LONG_EDGE = 1600      # output long edge (never upscaled)
MIN_LONG_EDGE = 1000  # skip sources smaller than this
MAX_ASPECT = 2.4      # wider than this is a stitched strip, not a view
JPEG_QUALITY = 78

# Quality thresholds, measured on a 500px-wide greyscale copy (see measure()).
MIN_BRIGHT, MAX_BRIGHT = 72, 205   # mean luma: night / blown-out fog
MIN_EDGE = 4.5                     # mean edge strength: fog, blank walls, lens covered
MIN_CRISP = 90                     # 99th-percentile edge strength: motion / focus blur
MIN_TEXTURE = 6 / 16               # share of grid cells with real detail: sky / road surface
MIN_SAT = 14                       # mean saturation: greyscale / IR / washed out
DUP_BITS = 10                      # dHash Hamming distance under this = near-duplicate


# ---------------------------------------------------------------------------
# Country outlines: parsed straight out of the TS module (x = lon, y = -lat)
# ---------------------------------------------------------------------------

def load_countries(path=MAP_TS):
    """Return {iso3: {"rings": [[(lon, lat), ...], ...], "bbox": ..., "area": km2}}."""
    src = open(path, encoding="utf-8").read()
    out = {}
    for iso, d in re.findall(r"(\w{3}): \{ d: '([^']*)'", src):
        rings, ring = [], []
        for cmd, x, y in re.findall(r"([MLZ])\s*(?:(-?[\d.]+)[ ,](-?[\d.]+))?", d):
            if cmd == "M":
                if len(ring) > 2:
                    rings.append(ring)
                ring = [(float(x), -float(y))]
            elif cmd == "L":
                ring.append((float(x), -float(y)))
            elif cmd == "Z":
                if len(ring) > 2:
                    rings.append(ring)
                ring = []
        if len(ring) > 2:
            rings.append(ring)
        boxes = [ring_bbox(r) for r in rings]
        areas = [ring_area_km2(r) for r in rings]
        out[iso] = {
            "rings": rings,
            "boxes": boxes,
            "areas": areas,
            "area": sum(areas),
        }
    return out


def ring_bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return (min(xs), min(ys), max(xs), max(ys))


def ring_area_km2(ring):
    """Shoelace area in degrees, scaled by cos(latitude) to roughly km2."""
    a = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        a += x1 * y2 - x2 * y1
    lat = sum(p[1] for p in ring) / len(ring)
    return abs(a) / 2 * 111.32 * 111.32 * math.cos(math.radians(lat))


def in_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def in_country(lon, lat, c):
    """Even-odd over all rings, so holes (e.g. Lesotho inside South Africa) work."""
    hits = 0
    for ring, (x0, y0, x1, y1) in zip(c["rings"], c["boxes"]):
        if x0 <= lon <= x1 and y0 <= lat <= y1 and in_ring(lon, lat, ring):
            hits += 1
    return hits % 2 == 1


def seg_dist_deg(px, py, ax, ay, bx, by):
    k = math.cos(math.radians(py))  # squash longitude so distances are ~isotropic
    px, ax, bx = px * k, ax * k, bx * k
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def country_of(lon, lat, countries, tolerance_deg=0.1):
    """ISO3 of the country containing the point. The outlines are thinned, so
    a coastal point that falls just outside every polygon goes to the nearest
    outline within ~10 km; farther than that it is None."""
    for iso, c in countries.items():
        if in_country(lon, lat, c):
            return iso
    best, best_d = None, tolerance_deg
    for iso, c in countries.items():
        for ring, (x0, y0, x1, y1) in zip(c["rings"], c["boxes"]):
            if not (x0 - best_d <= lon <= x1 + best_d and y0 - best_d <= lat <= y1 + best_d):
                continue
            for a, b in zip(ring, ring[1:] + ring[:1]):
                d = seg_dist_deg(lon, lat, a[0], a[1], b[0], b[1])
                if d < best_d:
                    best, best_d = iso, d
    return best


def random_point_in(c, rng):
    """Area-weighted random point inside a country (rejection sampling)."""
    for _ in range(400):
        i = rng.choices(range(len(c["rings"])), weights=[a + 1e-6 for a in c["areas"]])[0]
        x0, y0, x1, y1 = c["boxes"][i]
        lon, lat = rng.uniform(x0, x1), rng.uniform(y0, y1)
        if in_country(lon, lat, c):
            return lon, lat
    ring = rng.choice(c["rings"])
    return rng.choice(ring)


# ---------------------------------------------------------------------------
# HTTP: one polite client for API calls and image downloads
# ---------------------------------------------------------------------------

class PushBack(Exception):
    """A server said no (403/429), answered oddly (202, any non-200) or sent a
    challenge page instead of data. We stop the whole run instead of pushing on;
    progress is saved, so rerun later."""


class Http:
    def __init__(self, min_interval=0.34):
        self.min_interval = min_interval
        self.last = 0.0
        self.count = 0

    def get(self, url, want, tries=5):
        """Fetch url. `want` is "json" or "image": the body must be that, or we
        stop. 404/410 mean the picture is gone: skip it. Network errors and 5xx
        are retried with exponential backoff."""
        delay = 2.0
        for attempt in range(tries):
            wait = self.last + self.min_interval - time.time()
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
            self.count += 1
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=60) as r:
                    ctype = (r.headers.get("Content-Type") or "").lower()
                    if r.status != 200:
                        raise PushBack(f"HTTP {r.status} from {url}")
                    body = r.read()
                ok = ("json" in ctype) if want == "json" else ctype.startswith("image/")
                if not ok:
                    raise PushBack(f"expected {want}, got {ctype or 'no content-type'} from {url}")
                return body
            except urllib.error.HTTPError as e:
                if e.code in (404, 410):
                    return None  # this picture is gone: skip it
                if e.code < 500:
                    raise PushBack(f"HTTP {e.code} from {url}")
                err = e
            except PushBack:
                raise
            except Exception as e:  # timeouts, resets, DNS hiccups
                err = e
            if attempt < tries - 1:
                print(f"    retry in {delay:.0f}s ({err})", flush=True)
                time.sleep(delay)
                delay *= 2
        print(f"    gave up on {url} ({err})", flush=True)
        return None

    def json(self, url):
        body = self.get(url, "json")
        return json.loads(body) if body else None

    def image(self, url):
        return self.get(url, "image")


def search(http, lon, lat, r, limit):
    bbox = [max(-180, lon - r), max(-90, lat - r), min(180, lon + r), min(90, lat + r)]
    # With a bbox and no sortby, Panoramax returns the pictures nearest its centre.
    q = urllib.parse.urlencode({"limit": limit, "bbox": ",".join(f"{v:.5f}" for v in bbox)})
    d = http.json(f"{API}?{q}")
    return (d or {}).get("features", [])


# ---------------------------------------------------------------------------
# Picture metadata helpers
# ---------------------------------------------------------------------------

def fov_of(f):
    io_ = f["properties"].get("pers:interior_orientation") or {}
    return io_.get("field_of_view")


def is_360(f):
    fov = fov_of(f)
    return fov is not None and fov >= 300


def dims_of(f):
    io_ = f["properties"].get("pers:interior_orientation") or {}
    d = io_.get("sensor_array_dimensions")
    return (int(d[0]), int(d[1])) if d and len(d) == 2 else None


def license_of(f):
    return str(f["properties"].get("license") or "").strip("[] ")


def credit_of(f):
    for p in f.get("providers") or []:
        if "producer" in (p.get("roles") or []) and p.get("name"):
            return p["name"]
    return f["properties"].get("geovisio:producer") or None


def self_link(f):
    for l in f.get("links") or []:
        if l.get("rel") == "self":
            return l["href"]
    return None


def captured_of(f):
    p = f["properties"]
    s = p.get("datetimetz") or p.get("datetime")
    return s[:10] if s else None


def km_between(a_lat, a_lon, b_lat, b_lon):
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1.0, h)))


# ---------------------------------------------------------------------------
# Image handling: crop 360s, measure quality, strip metadata
# ---------------------------------------------------------------------------

def open_image(data):
    im = Image.open(io.BytesIO(data))
    im = ImageOps.exif_transpose(im)  # bake orientation into pixels before stripping EXIF
    return im.convert("RGB")


def forward_view(im):
    """Central ~100 deg of an equirectangular panorama, 35%..70% of its height."""
    w, h = im.size
    half = w * 50 / 360
    return im.crop((int(w / 2 - half), int(h * 0.35), int(w / 2 + half), int(h * 0.70)))


def measure(im):
    """Cheap quality numbers on a 500px-wide greyscale copy."""
    w, h = im.size
    small = im.resize((500, max(1, round(500 * h / w))), Image.BILINEAR)
    g = small.convert("L")
    bright = ImageStat.Stat(g).mean[0]
    sat = ImageStat.Stat(small.convert("HSV").split()[1]).mean[0]
    edges = g.filter(ImageFilter.FIND_EDGES)
    # Crop off the 1px border FIND_EDGES leaves, then look at a 4x4 grid:
    # a cell "has detail" if its mean edge strength clears a low bar.
    ew, eh = edges.size
    edges = edges.crop((1, 1, ew - 1, eh - 1))
    ew, eh = edges.size
    sharp = ImageStat.Stat(edges).mean[0]
    # Blur shows as the *strongest* edges being weak; smooth landscapes still
    # have a few crisp edges, so use a high percentile, not the mean.
    hist, acc, crisp = edges.histogram(), 0, 255
    total = sum(hist)
    for i, n in enumerate(hist):
        acc += n
        if acc >= 0.99 * total:
            crisp = i
            break
    cells = 0
    for gy in range(4):
        for gx in range(4):
            cell = edges.crop((gx * ew // 4, gy * eh // 4, (gx + 1) * ew // 4, (gy + 1) * eh // 4))
            if ImageStat.Stat(cell).mean[0] > 7:
                cells += 1
    return {"bright": round(bright, 1), "sat": round(sat, 1), "sharp": round(sharp, 2), "crisp": crisp, "texture": cells / 16}


def verdict(m):
    if m["bright"] < MIN_BRIGHT:
        return "dark"
    if m["bright"] > MAX_BRIGHT:
        return "overexposed"
    if m["sharp"] < MIN_EDGE:
        return "blank"
    if m["crisp"] < MIN_CRISP:
        return "blurry"
    if m["texture"] < MIN_TEXTURE:
        return "featureless"
    if m["sat"] < MIN_SAT:
        return "colourless"
    return None


def dhash(im):
    g = im.convert("L").resize((9, 8), Image.BILINEAR)
    px = list(g.tobytes())  # one byte per pixel in mode L
    bits = 0
    for row in range(8):
        for col in range(8):
            bits = (bits << 1) | (px[row * 9 + col] > px[row * 9 + col + 1])
    return bits


def save_clean(im, path):
    """Resize (never upscale) and save a JPEG with no metadata at all:
    a fresh RGB image built from raw pixels has no EXIF, XMP, ICC or comment."""
    w, h = im.size
    scale = min(1.0, LONG_EDGE / max(w, h))
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    clean = Image.frombytes("RGB", im.size, im.convert("RGB").tobytes())
    tmp = path + ".tmp"
    clean.save(tmp, "JPEG", quality=JPEG_QUALITY, progressive=True, optimize=True)
    os.replace(tmp, path)
    return clean.size


# ---------------------------------------------------------------------------
# State (resumable) and output
# ---------------------------------------------------------------------------

def load_state(out_dir):
    path = os.path.join(out_dir, "geo-stock-state.json")
    if os.path.exists(path):
        st = json.load(open(path, encoding="utf-8"))
    else:
        st = {"accepted": [], "seen": [], "countries": {}, "rejects": {}}
    # Drop records whose file has gone missing, so a rerun refills them.
    st["accepted"] = [a for a in st["accepted"] if os.path.exists(os.path.join(out_dir, a["id"] + ".jpg"))]
    return st, path


def save_state(st, path):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(st, fh, ensure_ascii=False)
    os.replace(tmp, path)


PUBLIC_KEYS = ["id", "lat", "lng", "country", "width", "height", "credit", "license", "source", "captured"]


def write_stock(st, stock_path):
    recs = [{k: a[k] for k in PUBLIC_KEYS} for a in st["accepted"]]
    random.SystemRandom().shuffle(recs)  # order carries no information
    os.makedirs(os.path.dirname(stock_path), exist_ok=True)
    with open(stock_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in recs) + "\n]\n")
    print(f"wrote {len(recs)} records to {stock_path}")


def contact_sheets(st, out_dir, labels, rejects=False):
    """5x5 grids of thumbnails for eyeballing. With labels, each tile shows its
    country (spoils the game, so keep labelled sheets away from players)."""
    sheet_dir = os.path.join(out_dir, "sheets")
    os.makedirs(sheet_dir, exist_ok=True)
    if rejects:
        items = [(os.path.join(out_dir, "rejects", n), n.split("_")[0]) for n in sorted(os.listdir(os.path.join(out_dir, "rejects")))]
        prefix = "rejects"
    else:
        items = [(os.path.join(out_dir, a["id"] + ".jpg"), f'{a["country"] or "?"} {a["id"]}') for a in st["accepted"]]
        prefix = "sheet"
    tw, th = 320, 213
    for n in range(0, len(items), 25):
        sheet = Image.new("RGB", (tw * 5, th * 5), (20, 20, 20))
        draw = ImageDraw.Draw(sheet)
        for k, (p, label) in enumerate(items[n:n + 25]):
            im = Image.open(p).convert("RGB")
            im.thumbnail((tw - 4, th - 4))
            x, y = (k % 5) * tw + 2, (k // 5) * th + 2
            sheet.paste(im, (x, y))
            if labels:
                draw.rectangle((x, y, x + 6 * len(label) + 6, y + 13), fill=(0, 0, 0))
                draw.text((x + 3, y + 1), label, fill=(255, 255, 0))
        out = os.path.join(sheet_dir, f"{prefix}_{n // 25 + 1:02d}.jpg")
        sheet.save(out, quality=80)
    print(f"sheets in {sheet_dir}")


# ---------------------------------------------------------------------------
# The builder
# ---------------------------------------------------------------------------

class Builder:
    def __init__(self, args, countries, st, state_path):
        self.a = args
        self.countries = countries
        self.st = st
        self.state_path = state_path
        self.http = Http()
        self.rng = random.Random(args.seed)
        self.seen = set(st["seen"])
        self.hashes = [a["_dhash"] for a in st["accepted"]]
        self.rejects = Counter(st.get("rejects", {}))
        self.cap = max(1, int(args.count * args.max_share))
        # sqrt(area) weights: big countries get more, but not proportionally more.
        self.weight = {iso: math.sqrt(max(c["area"], 1.0)) for iso, c in countries.items()}
        # Small countries can't hold many photos 2 km apart without it getting samey.
        self.area_cap = {iso: max(4, int(c["area"] / 1500)) for iso, c in countries.items()}

    def cstate(self, iso):
        return self.st["countries"].setdefault(iso, {"fails": 0, "empty": 0, "done": False})

    def counts(self):
        return Counter(a["country"] for a in self.st["accepted"])

    def pick_country(self):
        counts = self.counts()
        live = [
            iso for iso in self.countries
            if not self.cstate(iso)["done"] and counts[iso] < min(self.cap, self.area_cap[iso])
        ]
        if not live:
            return None
        return min(live, key=lambda iso: (counts[iso] / self.weight[iso], self.rng.random()))

    def reject(self, f, why):
        self.seen.add(f["id"])
        self.rejects[why] += 1

    def allowed(self, f, lon, lat):
        """Spacing rules against everything already in the stock."""
        seq = f["collection"]
        per_seq = 0
        for a in self.st["accepted"]:
            d = km_between(lat, lon, a["lat"], a["lng"])
            if d < self.a.min_km:
                return False
            if a["_seq"] == seq:
                per_seq += 1
                if d < self.a.seq_km or per_seq >= self.a.per_seq:
                    return False
        return True

    def candidates(self, iso, lon, lat):
        """Nearest pictures to (lon, lat) that are inside the country and usable.
        Widens the search box until something turns up (and past snapshots, looking
        for street-level). Returns (list, found_any)."""
        c = self.countries[iso]
        x0 = min(b[0] for b in c["boxes"]); x1 = max(b[2] for b in c["boxes"])
        y0 = min(b[1] for b in c["boxes"]); y1 = max(b[3] for b in c["boxes"])
        span = max(x1 - x0, y1 - y0)
        radii = [r for r in (0.25, 1.5, 6.0) if r < span] + [min(span, 30.0)]
        found_any = False
        snapshots = []
        for r in radii:
            feats = search(self.http, lon, lat, r, 80 if r < span else 200)
            good = []
            for f in feats:
                if any(f["id"] == g["id"] for g in snapshots):
                    continue
                flon, flat = f["geometry"]["coordinates"][:2]
                if country_of(flon, flat, self.countries) != iso:
                    continue
                found_any = True
                if f["id"] in self.seen or license_of(f) not in LICENSES:
                    continue
                if not self.allowed(f, flon, flat):
                    continue
                d = dims_of(f)
                if d and not is_360(f) and (d[1] > d[0] or max(d) < MIN_LONG_EDGE):
                    self.reject(f, "portrait/small")
                    continue
                if is_360(f) and d and d[0] < 4000:
                    self.reject(f, "360 too small")
                    continue
                good.append(f)
            if any(credit_of(f) not in LOW_PRIORITY_PRODUCERS for f in good):
                return self.rank(good + snapshots), True
            if good and not snapshots:
                snapshots = good  # keep, but look wider for real street-level first
            elif found_any and not snapshots:
                break  # coverage exists here but it is all used up; try a new point
        return self.rank(snapshots), found_any

    @staticmethod
    def rank(pics):
        """Street-level flat, then street-level 360, then snapshots; the sort is
        stable, so each group stays nearest-first. One picture per sequence per
        try; the rest stay available for later tries."""
        pics = sorted(pics, key=lambda f: (credit_of(f) in LOW_PRIORITY_PRODUCERS, is_360(f)))
        out, seqs = [], set()
        for f in pics:
            if f["collection"] not in seqs:
                seqs.add(f["collection"])
                out.append(f)
        return out

    def try_picture(self, f, iso):
        """Download, check and save one picture. Returns the record or None."""
        flon, flat = f["geometry"]["coordinates"][:2]
        pano = is_360(f)
        assets = f.get("assets") or {}
        # Thumbnail first: cheap to reject night / blur / sky before the big download.
        thumb = (assets.get("thumb") or {}).get("href")
        if thumb:
            data = self.http.image(thumb)
            if not data:
                self.reject(f, "download failed")
                return None
            im = open_image(data)
            why = verdict(measure(im))
            if why:
                self.keep_reject(im, iso, why)
                self.reject(f, why)
                return None
        # Full picture: HD for panoramas (cropping needs the pixels) and for
        # small originals (SD would be an upscale of them); SD otherwise.
        d = dims_of(f)
        use_hd = pano or (d and max(d) <= 2048)
        href = (assets.get("hd" if use_hd else "sd") or assets.get("sd") or assets.get("hd") or {}).get("href")
        data = self.http.image(href) if href else None
        if not data:
            self.reject(f, "download failed")
            return None
        try:
            im = open_image(data)
        except Exception:
            self.reject(f, "bad image")
            return None
        if pano:
            if not 1.9 <= im.size[0] / im.size[1] <= 2.1:  # partial panoramas crop badly
                self.reject(f, "360 not equirectangular")
                return None
            im = forward_view(im)
        w, h = im.size
        if max(w, h) < MIN_LONG_EDGE or h > w:
            self.reject(f, "portrait/small")
            return None
        if w > MAX_ASPECT * h:
            self.reject(f, "panorama strip")  # a stitched strip reads badly as one view
            return None
        m = measure(im)
        why = verdict(m)
        if why:
            self.keep_reject(im, iso, why)
            self.reject(f, why)
            return None
        hsh = dhash(im)
        if any(bin(hsh ^ o).count("1") < DUP_BITS for o in self.hashes):
            self.reject(f, "near-duplicate")
            return None
        pid = "g_" + secrets.token_hex(6)
        width, height = save_clean(im, os.path.join(self.a.out_dir, pid + ".jpg"))
        self.seen.add(f["id"])
        self.hashes.append(hsh)
        return {
            "id": pid,
            "lat": round(flat, 5),
            "lng": round(flon, 5),
            "country": country_of(flon, flat, self.countries),
            "width": width,
            "height": height,
            "credit": credit_of(f),
            "license": license_of(f),
            "source": self_link(f),
            "captured": captured_of(f),
            # Private bookkeeping (state file only, never in stock.json):
            "_item": f["id"],
            "_seq": f["collection"],
            "_360": pano,
            "_dhash": hsh,
            "_m": m,
        }

    def keep_reject(self, im, iso, why):
        if not self.a.keep_rejects:
            return
        d = os.path.join(self.a.out_dir, "rejects")
        os.makedirs(d, exist_ok=True)
        im = im.copy()
        im.thumbnail((500, 500))
        im.save(os.path.join(d, f"{why}_{iso}_{secrets.token_hex(3)}.jpg"), quality=70)

    def save(self):
        self.st["seen"] = sorted(self.seen)
        self.st["rejects"] = dict(self.rejects)
        save_state(self.st, self.state_path)

    def run(self):
        target = self.a.count
        while len(self.st["accepted"]) < target:
            iso = self.pick_country()
            if iso is None:
                print("every country is exhausted or capped")
                break
            cs = self.cstate(iso)
            lon, lat = random_point_in(self.countries[iso], self.rng)
            cands, found_any = self.candidates(iso, lon, lat)
            got = None
            for f in cands[:3]:
                got = self.try_picture(f, iso)
                if got:
                    break
            if got:
                self.st["accepted"].append(got)
                cs["fails"] = cs["empty"] = 0
                n = len(self.st["accepted"])
                tag = " 360" if got["_360"] else ""
                print(f"[{n}/{target}] {iso} {got['id']}{tag}  (requests {self.http.count})", flush=True)
            else:
                # "empty": no Panoramax pictures in this country near the point at all.
                # "fails": pictures exist but none new and usable.
                cs["fails"] += 1
                if not found_any:
                    cs["empty"] += 1
                if cs["empty"] >= self.a.empty_tries or cs["fails"] >= self.a.fail_tries:
                    cs["done"] = True
                    have = self.counts()[iso]
                    print(f"  retire {iso} with {have}", flush=True)
            self.save()
        self.save()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--count", type=int, default=650, help="target number of photos in the stock")
    ap.add_argument("--out-dir", default=DEFAULT_OUT, help="where photos and the state file live (outside the repo)")
    ap.add_argument("--stock", default=DEFAULT_STOCK, help="stock.json to write")
    ap.add_argument("--max-share", type=float, default=0.25, help="max share of the stock from one country")
    ap.add_argument("--min-km", type=float, default=2.0, help="min distance between any two photos")
    ap.add_argument("--seq-km", type=float, default=20.0, help="min distance between two photos of one sequence")
    ap.add_argument("--per-seq", type=int, default=4, help="max photos from one sequence")
    ap.add_argument("--fail-tries", type=int, default=10, help="retire a country after this many fruitless tries in a row")
    ap.add_argument("--empty-tries", type=int, default=3, help="...or after this many tries that found no coverage at all")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--retry-retired", action="store_true", help="give retired countries another chance")
    ap.add_argument("--keep-rejects", action="store_true", help="save thumbnails of rejected pictures to <out-dir>/rejects")
    ap.add_argument("--sheets", action="store_true", help="only make contact sheets of the stock")
    ap.add_argument("--reject-sheets", action="store_true", help="only make contact sheets of kept rejects")
    ap.add_argument("--labels", action="store_true", help="print the country on each contact-sheet tile")
    ap.add_argument("--drop", default="", help="comma-separated photo ids to remove by hand (junk spotted on a contact sheet); a rerun refills them")
    ap.add_argument("--write-only", action="store_true", help="only rewrite stock.json from the state file")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    st, state_path = load_state(args.out_dir)
    if args.drop:
        drop = {x.strip() for x in args.drop.split(",") if x.strip()}
        keep = []
        for a in st["accepted"]:
            if a["id"] in drop:
                os.remove(os.path.join(args.out_dir, a["id"] + ".jpg"))
                st["seen"].append(a["_item"])  # never pick this picture again
                st.setdefault("rejects", {})["dropped by hand"] = st.get("rejects", {}).get("dropped by hand", 0) + 1
            else:
                keep.append(a)
        print(f"dropped {len(st['accepted']) - len(keep)}")
        st["accepted"] = keep
        save_state(st, state_path)
        write_stock(st, args.stock)
        return
    if args.sheets or args.reject_sheets:
        contact_sheets(st, args.out_dir, args.labels, rejects=args.reject_sheets)
        return
    if not args.write_only:
        countries = load_countries()
        if args.retry_retired:
            for cs in st["countries"].values():
                cs.update(done=False, fails=0, empty=0)
        try:
            Builder(args, countries, st, state_path).run()
        except PushBack as e:
            print(f"STOPPED: {e}. Progress is saved; rerun later to resume.")
            sys.exit(2)
    write_stock(st, args.stock)
    counts = Counter(a["country"] for a in st["accepted"])
    print(f"{len(st['accepted'])} photos, {len(counts)} countries; top: {counts.most_common(15)}")
    print(f"360s used: {sum(1 for a in st['accepted'] if a['_360'])}; rejects: {st.get('rejects')}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    main()
