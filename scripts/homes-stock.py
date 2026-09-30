"""
Build the stock for the daily house-price guessing game.

What it does
  1. Asks Redfin's map-search CSV export for recently SOLD homes in ~120 places
     (big metros, rich enclaves, and rural areas in every region), in a few
     price bands each, so the pool spans ~$20k shacks to eight-figure estates.
  2. Picks homes so prices come out roughly log-uniform from ~$60k to ~$6M,
     with ~5% absurd outliers at both ends, spread across places, no two on
     the same street.
  3. For each pick, loads the listing page once, finds that listing's photo
     gallery, and keeps 4 photos: the first (usually the front) plus 3 spread
     through the rest. Homes with <4 photos, or whose first photo looks like a
     floor plan / map / text graphic, are skipped.
  4. Re-encodes every photo (long edge <= 1400px, JPEG q78, progressive, NO
     metadata) as <homeId>_<n>.jpg, where homeId is random hex that says
     nothing about the home.
  5. Writes server/src/homes/stock.json (no street address, no lat/long).

This runs ONCE, by hand, on Wes's PC. The photos are copied to our own box and
served from there. The app never contacts Redfin at runtime; no player's
browser ever loads anything from Redfin.

Politeness: one request to redfin.com every ~2 s, photo CDN a bit faster,
retries with backoff, and it STOPS at the first 403/429/captcha, keeping what
it has. It is resumable: rerun the same command and it carries on.

  python scripts/homes-stock.py --count 650
  python scripts/homes-stock.py --json-only        # just rewrite stock.json

State (the candidate pool, which listing became which homeId, addresses) lives
in a folder NEXT TO the photos folder, never in the repo and never served.
"""
import argparse
import csv
import io
import json
import math
import os
import random
import re
import secrets
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime

import requests
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP = r'C:\Users\weshu\Documents\Scryproof-keep\game-photos'
DEFAULT_PHOTOS = os.path.join(KEEP, 'homes')          # served: only <homeId>_<n>.jpg
DEFAULT_STATE = os.path.join(KEEP, 'homes-state')     # private: pool, progress, csv cache
DEFAULT_OUT = os.path.join(REPO, 'server', 'src', 'homes', 'stock.json')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36')
CSV_URL = 'https://www.redfin.com/stingray/api/gis-csv'

# --------------------------------------------------------------------------
# Places. (name, lat, lng, half-height deg, half-width deg, kind)
#   metro: every band.  rich: the top end.  rural: cheap-to-middle.
# A box instead of a Redfin region id, because the id lookup endpoint is
# blocked for scripts and a box works for "rural Mississippi Delta" too.
# --------------------------------------------------------------------------
PLACES = [
    # West
    ('Seattle', 47.61, -122.33, .12, .15, 'metro'),
    ('Portland', 45.52, -122.68, .12, .15, 'metro'),
    ('San Francisco', 37.765, -122.44, .05, .06, 'metro'),
    ('East Bay', 37.80, -122.22, .10, .12, 'metro'),
    ('San Jose', 37.33, -121.89, .10, .12, 'metro'),
    ('Los Angeles', 34.05, -118.30, .10, .15, 'metro'),
    ('San Diego', 32.75, -117.15, .12, .12, 'metro'),
    ('Sacramento', 38.58, -121.49, .12, .15, 'metro'),
    ('Fresno', 36.75, -119.77, .10, .12, 'metro'),
    ('Phoenix', 33.45, -112.07, .15, .20, 'metro'),
    ('Tucson', 32.22, -110.93, .12, .15, 'metro'),
    ('Las Vegas', 36.17, -115.14, .12, .15, 'metro'),
    ('Salt Lake City', 40.70, -111.89, .15, .12, 'metro'),
    ('Boise', 43.62, -116.25, .10, .15, 'metro'),
    ('Denver', 39.74, -104.99, .12, .15, 'metro'),
    ('Albuquerque', 35.10, -106.62, .12, .15, 'metro'),
    ('Spokane', 47.66, -117.43, .10, .15, 'metro'),
    ('Anchorage', 61.18, -149.85, .10, .20, 'metro'),
    ('Honolulu', 21.33, -157.85, .08, .15, 'metro'),
    # Texas / Plains
    ('Dallas', 32.80, -96.80, .15, .18, 'metro'),
    ('Houston', 29.76, -95.40, .15, .18, 'metro'),
    ('Austin', 30.29, -97.74, .12, .15, 'metro'),
    ('San Antonio', 29.45, -98.50, .12, .15, 'metro'),
    ('Oklahoma City', 35.47, -97.52, .12, .15, 'metro'),
    ('Kansas City', 39.08, -94.58, .12, .15, 'metro'),
    ('Omaha', 41.26, -96.00, .10, .12, 'metro'),
    ('Des Moines', 41.59, -93.65, .10, .12, 'metro'),
    ('Minneapolis', 44.97, -93.27, .12, .15, 'metro'),
    # Midwest
    ('Chicago', 41.88, -87.68, .12, .10, 'metro'),
    ('Detroit', 42.38, -83.10, .10, .15, 'metro'),
    ('Flint', 43.01, -83.69, .08, .10, 'metro'),
    ('Milwaukee', 43.05, -87.95, .10, .10, 'metro'),
    ('St. Louis', 38.63, -90.25, .10, .15, 'metro'),
    ('Indianapolis', 39.77, -86.16, .12, .15, 'metro'),
    ('Columbus', 39.96, -83.00, .12, .15, 'metro'),
    ('Cleveland', 41.48, -81.70, .10, .15, 'metro'),
    ('Pittsburgh', 40.44, -79.99, .10, .15, 'metro'),
    ('Louisville', 38.23, -85.72, .10, .15, 'metro'),
    ('Buffalo', 42.90, -78.85, .10, .12, 'metro'),
    # Northeast
    ('Philadelphia', 39.97, -75.16, .08, .10, 'metro'),
    ('New York City', 40.72, -73.97, .06, .08, 'metro'),
    ('Boston', 42.35, -71.08, .06, .08, 'metro'),
    ('Providence', 41.82, -71.41, .08, .10, 'metro'),
    ('Hartford', 41.76, -72.69, .08, .10, 'metro'),
    ('Baltimore', 39.30, -76.61, .08, .10, 'metro'),
    ('Washington DC', 38.90, -77.03, .08, .10, 'metro'),
    # South
    ('Richmond', 37.54, -77.45, .10, .12, 'metro'),
    ('Charlotte', 35.22, -80.84, .12, .15, 'metro'),
    ('Raleigh', 35.80, -78.65, .12, .15, 'metro'),
    ('Charleston SC', 32.80, -79.95, .10, .12, 'metro'),
    ('Savannah', 32.05, -81.10, .08, .10, 'metro'),
    ('Atlanta', 33.77, -84.39, .12, .15, 'metro'),
    ('Nashville', 36.16, -86.78, .12, .15, 'metro'),
    ('Memphis', 35.12, -90.00, .10, .15, 'metro'),
    ('Little Rock', 34.75, -92.33, .10, .12, 'metro'),
    ('Birmingham', 33.50, -86.80, .10, .15, 'metro'),
    ('New Orleans', 29.96, -90.08, .06, .10, 'metro'),
    ('Jacksonville', 30.30, -81.65, .12, .15, 'metro'),
    ('Orlando', 28.54, -81.38, .12, .15, 'metro'),
    ('Tampa', 27.95, -82.50, .12, .15, 'metro'),
    ('Miami', 25.78, -80.21, .08, .08, 'metro'),
    # Where the money is
    ('Beverly Hills / Bel Air', 34.09, -118.43, .03, .05, 'rich'),
    ('Malibu', 34.03, -118.75, .03, .12, 'rich'),
    ('Atherton / Palo Alto', 37.44, -122.18, .04, .05, 'rich'),
    ('Aspen', 39.19, -106.84, .05, .08, 'rich'),
    ('Jackson Hole', 43.50, -110.80, .12, .12, 'rich'),
    ('Park City', 40.65, -111.50, .06, .08, 'rich'),
    ('Lake Tahoe', 39.10, -120.03, .15, .10, 'rich'),
    ('The Hamptons', 40.93, -72.30, .08, .25, 'rich'),
    ('Greenwich CT', 41.04, -73.62, .04, .06, 'rich'),
    ("Martha's Vineyard", 41.40, -70.62, .08, .18, 'rich'),
    ('Palm Beach', 26.70, -80.05, .06, .04, 'rich'),
    ('Naples FL', 26.15, -81.79, .08, .06, 'rich'),
    ('Paradise Valley / Scottsdale', 33.56, -111.95, .06, .06, 'rich'),
    ('Maui', 20.85, -156.40, .25, .30, 'rich'),
    ('Manhattan', 40.77, -73.97, .03, .03, 'rich'),
    ('San Francisco (rich)', 37.795, -122.44, .02, .03, 'rich'),
    # Rural and small-town, every region
    ('Mississippi Delta', 33.40, -90.80, .60, .50, 'rural'),
    ('Southern West Virginia', 37.80, -81.20, .50, .50, 'rural'),
    ('Eastern Kentucky', 37.30, -83.20, .50, .50, 'rural'),
    ('Arkansas Ozarks', 36.20, -93.00, .50, .60, 'rural'),
    ('Missouri Ozarks', 36.80, -91.90, .50, .60, 'rural'),
    ('Western Kansas', 37.80, -100.00, .60, .80, 'rural'),
    ('Nebraska', 41.10, -100.60, .60, .80, 'rural'),
    ('Black Hills SD', 44.10, -103.40, .40, .50, 'rural'),
    ('North Dakota', 47.60, -101.00, .80, 1.2, 'rural'),
    ('Bozeman / Livingston', 45.70, -110.90, .35, .50, 'rural'),
    ('Billings', 45.78, -108.55, .30, .40, 'rural'),
    ('Wyoming', 42.85, -106.30, .40, .60, 'rural'),
    ('Idaho Panhandle', 48.00, -116.60, .40, .50, 'rural'),
    ('Elko NV', 40.83, -115.76, .50, .60, 'rural'),
    ('West Texas', 31.90, -102.20, .40, .60, 'rural'),
    ('Texas Panhandle', 35.20, -101.85, .40, .50, 'rural'),
    ('Northern New Mexico', 35.90, -105.90, .45, .45, 'rural'),
    ('Prescott AZ', 34.55, -112.45, .30, .40, 'rural'),
    ('Redding CA', 40.60, -122.35, .40, .40, 'rural'),
    ('Oregon Coast', 44.60, -124.00, .60, .12, 'rural'),
    ('Yakima WA', 46.55, -120.50, .30, .40, 'rural'),
    ('St. George UT', 37.10, -113.55, .20, .30, 'rural'),
    ('Pueblo CO', 38.25, -104.60, .25, .35, 'rural'),
    ('Upper Peninsula', 46.50, -87.50, .40, .80, 'rural'),
    ('Northwoods WI', 45.70, -89.50, .40, .60, 'rural'),
    ('Northern Minnesota', 47.10, -92.60, .50, .70, 'rural'),
    ('North Iowa', 43.10, -93.20, .40, .60, 'rural'),
    ('Southern Illinois', 37.75, -89.20, .40, .50, 'rural'),
    ('Terre Haute IN', 39.47, -87.40, .30, .40, 'rural'),
    ('Southeast Ohio', 39.90, -82.00, .40, .50, 'rural'),
    ('Central Pennsylvania', 40.60, -78.30, .40, .50, 'rural'),
    ('Adirondacks', 44.20, -74.20, .50, .60, 'rural'),
    ('Maine', 44.80, -68.90, .60, .80, 'rural'),
    ('Vermont', 44.30, -72.60, .40, .40, 'rural'),
    ('New Hampshire Lakes', 43.60, -71.50, .30, .40, 'rural'),
    ('Shenandoah Valley', 38.50, -78.85, .40, .40, 'rural'),
    ('Eastern North Carolina', 35.90, -77.70, .50, .60, 'rural'),
    ('Upstate SC', 34.50, -82.60, .40, .50, 'rural'),
    ('Middle Tennessee', 36.10, -85.50, .40, .50, 'rural'),
    ('Southwest Georgia', 32.20, -84.30, .50, .60, 'rural'),
    ('Alabama Black Belt', 32.40, -87.10, .50, .60, 'rural'),
    ('Central Louisiana', 31.30, -92.45, .50, .60, 'rural'),
    ('Southern Oklahoma', 34.20, -97.10, .40, .60, 'rural'),
    ('Florida Panhandle', 30.40, -85.60, .40, .60, 'rural'),
    ('Ocala FL', 29.10, -82.10, .30, .40, 'rural'),
    ('Fairbanks', 64.84, -147.70, .25, .60, 'rural'),
]

# Price bands asked of each kind of place: (name, min, max, sold_within_days).
BANDS = {
    'metro': [('lo', None, 150_000, 365), ('mid', 150_000, 600_000, 180),
              ('up', 600_000, 1_500_000, 180), ('hi', 1_500_000, None, 365)],
    'rich': [('up', 700_000, 3_000_000, 365), ('hi', 3_000_000, None, 365)],
    'rural': [('lo', None, 150_000, 365), ('mid', 150_000, 1_500_000, 180)],
}
UIPT = '1,2,3,4,5,6,7,8'  # house, condo, townhouse, multi, land, other, manufactured, co-op

# Target price shape. 95% log-uniform over $60k..$6M in 20 bins, plus outlier bins.
LO, HI, NBINS = 60_000, 6_000_000, 20
OUTLIER_SHARE = 0.05
QUIRK_SHARE = 0.015        # tiny-but-pricey city places (<750 sqft, >= $900k)
PER_PLACE_CAP = 14
TYPE_CAPS = {'Multi-Family (2-4 Unit)': 0.04, 'Multi-Family (5+ Unit)': 0.01,
             'Mobile/Manufactured Home': 0.05, 'Vacant Land': 0.02, 'Other': 0.02}


class Blocked(Exception):
    """Redfin said no (403/429/captcha). Stop everything, keep what we have."""


# --------------------------------------------------------------------------
# Polite HTTP
# --------------------------------------------------------------------------
class Polite:
    def __init__(self, delay_site, delay_cdn):
        self.s = requests.Session()
        self.s.headers.update({
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        })
        self.delay = {'site': delay_site, 'cdn': delay_cdn}
        self.last = {'site': 0.0, 'cdn': 0.0}
        self.count = Counter()

    def get(self, url, which, params=None):
        """GET with spacing, 3 tries with backoff. Returns Response or None (404/410)."""
        for attempt in range(4):
            wait = self.last[which] + self.delay[which] - time.time()
            if wait > 0:
                time.sleep(wait)
            self.last[which] = time.time()
            self.count[which] += 1
            try:
                r = self.s.get(url, params=params, timeout=40)
            except requests.RequestException as e:
                print(f'   net error ({e.__class__.__name__}), backing off')
                time.sleep(5 * 3 ** attempt)
                continue
            # 202 is how Redfin's AWS WAF serves its JavaScript bot challenge
            # (learned the hard way on the first run): that is a block, not a skip.
            if r.status_code in (202, 403, 429):
                raise Blocked(f'HTTP {r.status_code} on {r.url}')
            head = r.text[:200_000].lower() if which == 'site' else ''
            if 'captcha' in head or 'awswaf' in head or 'challenge.js' in head:
                raise Blocked(f'bot challenge page on {r.url}')
            if r.status_code in (404, 410):
                return None
            if r.status_code >= 500:
                print(f'   HTTP {r.status_code}, backing off')
                time.sleep(5 * 3 ** attempt)
                continue
            if r.status_code != 200:
                print(f'   HTTP {r.status_code} on {r.url}, skipping')
                return None
            return r
        return None


# --------------------------------------------------------------------------
# State (resumable)
# --------------------------------------------------------------------------
def load_state(path):
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    return {'done': [], 'rejected': {}}


def save_state(path, state):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=1)
    os.replace(tmp, path)


# --------------------------------------------------------------------------
# Phase 1: candidate pool from the CSV export
# --------------------------------------------------------------------------
def poly(lat, lng, dlat, dlng):
    pts = [(lng - dlng, lat - dlat), (lng + dlng, lat - dlat), (lng + dlng, lat + dlat),
           (lng - dlng, lat + dlat), (lng - dlng, lat - dlat)]
    return ','.join(f'{x:.4f} {y:.4f}' for x, y in pts)


def num(s, kind=float):
    try:
        return kind(float(s)) if s not in (None, '') else None
    except ValueError:
        return None


SUFFIXES = {'st', 'street', 'ave', 'av', 'avenue', 'rd', 'road', 'dr', 'drive', 'ln', 'lane',
            'ct', 'court', 'blvd', 'way', 'pl', 'place', 'cir', 'circle', 'ter', 'terrace',
            'trl', 'trail', 'pkwy', 'hwy', 'loop', 'cv', 'run', 'pt', 'sq'}
DIRS = {'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west'}


def street_key(address, city, state):
    """'3773 E Timbersaw Dr #4' -> 'timbersaw|boise|id' (one home per street).
    Redfin spells the same street both 'W Lemhi' and 'W Lemhi St', so the
    house number, unit, direction and suffix all go."""
    a = re.split(r'\s(?:#|unit\b|apt\b|ste\b|suite\b|lot\b|spc\b|space\b|bldg\b)',
                 address.lower())[0]
    words = re.findall(r"[a-z0-9']+", a)
    while words and (re.match(r'^\d+[a-z]?$', words[0]) or words[0] in DIRS):
        words.pop(0)
    while len(words) > 1 and (words[-1] in SUFFIXES or words[-1] in DIRS):
        words.pop()
    return f'{" ".join(words)}|{city.lower()}|{state.lower()}'


def fetch_pool(http, state_dir, listed=False):
    """Every (place, band) query, cached on disk. Returns list of candidate dicts."""
    cache = os.path.join(state_dir, 'csv')
    os.makedirs(cache, exist_ok=True)
    pool = {}
    jobs = [(p, b) for p in PLACES for b in BANDS[p[5]]]
    for i, (place, band) in enumerate(jobs):
        name, lat, lng, dlat, dlng, kind = place
        bname, pmin, pmax, days = band
        key = re.sub(r'\W+', '_', f'{name}_{bname}{"_listed" if listed else ""}').strip('_')
        fp = os.path.join(cache, key + '.csv')
        if os.path.exists(fp):
            with open(fp, encoding='utf-8') as f:
                text = f.read()
        else:
            params = {'al': 1, 'num_homes': 150, 'poly': poly(lat, lng, dlat, dlng),
                      'status': 1 if listed else 9, 'uipt': UIPT, 'v': 8}
            if not listed:
                params['sold_within_days'] = days
            if pmin:
                params['min_price'] = pmin
            if pmax:
                params['max_price'] = pmax
            r = http.get(CSV_URL, 'site', params)
            text = r.text if r is not None else ''
            with open(fp, 'w', encoding='utf-8') as f:
                f.write(text)
            print(f'  [{i + 1}/{len(jobs)}] {name} {bname}: {text.count(chr(10))} rows')
        for row in csv.DictReader(io.StringIO(text)):
            c = to_candidate(row, name, listed)
            if c and c['url'] not in pool:
                pool[c['url']] = c
    return list(pool.values())


def to_candidate(row, place, listed):
    url = next((v for k, v in row.items() if k and k.startswith('URL')), None)
    price = num(row.get('PRICE'), int)
    beds = num(row.get('BEDS'))
    if not url or not url.startswith('https://www.redfin.com/') or not price:
        return None
    if not row.get('MLS#'):            # public-record-only rows have no photos
        return None
    if not beds or beds < 1:           # need a dwelling to look at
        return None
    sqft = num(row.get('SQUARE FEET'), int)
    # Below this it is a parking space, a share, or a data-entry slip (first run
    # found a "$5,500" SF condo), not a home that sold for that.
    if price < 15_000 or (sqft and price / sqft < 8):
        return None
    sold = None
    if not listed:
        if (row.get('STATUS') or '').lower() != 'sold':
            return None
        try:
            sold = datetime.strptime(row['SOLD DATE'], '%B-%d-%Y').strftime('%Y-%m-%d')
        except (KeyError, ValueError, TypeError):
            return None
    baths = num(row.get('BATHS'))
    return {
        'url': url, 'place': place, 'price': price,
        'priceKind': 'listed' if listed else 'sold', 'soldDate': sold,
        'city': row.get('CITY') or '', 'state': row.get('STATE OR PROVINCE') or '',
        'beds': int(beds), 'baths': (int(baths) if baths and baths == int(baths) else baths),
        'sqft': num(row.get('SQUARE FEET'), int), 'lotSqft': num(row.get('LOT SIZE'), int),
        'yearBuilt': num(row.get('YEAR BUILT'), int),
        'propertyType': row.get('PROPERTY TYPE') or 'Other',
        'mls': row.get('MLS#'),
        'street': street_key(row.get('ADDRESS') or url, row.get('CITY') or '',
                             row.get('STATE OR PROVINCE') or ''),
    }


# --------------------------------------------------------------------------
# Phase 2: choose which candidates to try, in a balanced order
# --------------------------------------------------------------------------
def bin_of(c):
    p = c['price']
    if p < LO:
        return 'out_lo'
    if p >= HI:
        return 'out_hi'
    return 'b%02d' % min(NBINS - 1, int(NBINS * math.log(p / LO) / math.log(HI / LO)))


def is_quirk(c):
    return c['sqft'] and c['sqft'] < 750 and c['price'] >= 900_000


def targets(count):
    t = {'out_lo': round(count * OUTLIER_SHARE / 2), 'out_hi': round(count * OUTLIER_SHARE / 2),
         'quirk': round(count * QUIRK_SHARE)}
    rest = count - sum(t.values())
    for i in range(NBINS):
        t['b%02d' % i] = rest // NBINS + (1 if i < rest % NBINS else 0)
    return t


def interleave_by_place(cands, rng):
    """Shuffle within each place, then deal one per place round-robin."""
    by = defaultdict(list)
    for c in cands:
        by[c['place']].append(c)
    places = list(by)
    rng.shuffle(places)
    for p in places:
        rng.shuffle(by[p])
    out = []
    while any(by.values()):
        for p in places:
            if by[p]:
                out.append(by[p].pop())
    return out


# --------------------------------------------------------------------------
# Phase 3: listing page -> gallery -> 4 photos
# --------------------------------------------------------------------------
PHOTO_RE = re.compile(
    r'https://ssl\.cdn-redfin\.com/photo/(\d+)/bigphoto/(\d+)/([A-Za-z0-9-]+)_(\d+)(?:_(\d+))?\.jpg')


def gallery(html, mls):
    """Ordered photo URLs for THIS listing (the page also shows nearby homes,
    but those use 'bcsphoto'; the subject's full-size gallery is 'bigphoto').
    File names: <id>_<ver>.jpg is photo 0 (primary), <id>_<n>_<ver>.jpg is photo n."""
    groups = defaultdict(dict)   # (server, dir, id) -> {index: (ver, url)}
    for m in PHOTO_RE.finditer(html):
        srv, d, pid, a, b = m.groups()
        idx, ver = (0, int(a)) if b is None else (int(a), int(b))
        g = groups[(srv, d, pid)]
        if idx not in g or ver > g[idx][0]:
            g[idx] = (ver, m.group(0))
    if not groups:
        return []
    digits = re.sub(r'\D', '', mls or '')
    match = [k for k in groups if digits and (digits.endswith(k[2]) or k[2].endswith(digits))]
    key = match[0] if match else max(groups, key=lambda k: len(groups[k]))
    g = groups[key]
    if 0 not in g:
        return []
    return [g[i][1] for i in sorted(g)]


def pick_four(urls):
    """Front + 3 spread over the gallery, skipping photo 1 (often a second front
    shot) and the tail (often neighborhood/amenity/map shots)."""
    n = len(urls)
    if n < 4:
        return None
    if n <= 6:
        return [urls[0], urls[1], urls[2], urls[3]] if n == 4 else [urls[0], urls[2], urls[3], urls[4]]
    hi = max(4, int(n * 0.8))
    picks = sorted({max(2, min(hi - 1, round(2 + (hi - 2) * f))) for f in (0.12, 0.45, 0.8)})
    while len(picks) < 3:                      # collisions on short galleries
        picks = sorted(set(picks) | {next(i for i in range(2, n) if i not in picks)})
    return [urls[0]] + [urls[i] for i in picks]


def looks_like_graphic(img):
    """Cheap test for floor plans, maps, text slides: mostly white, or very few colors."""
    small = img.convert('RGB').resize((64, 64))
    px = list(small.getdata())
    white = sum(1 for r, g, b in px if r > 232 and g > 232 and b > 232) / len(px)
    colors = len({(r >> 3, g >> 3, b >> 3) for r, g, b in px})
    return white > 0.40 or colors < 90


def clean_save(data, path):
    """Decode, drop every bit of metadata, shrink to <=1400px, save progressive q78."""
    im = Image.open(io.BytesIO(data))
    im = im.convert('RGB')
    im.thumbnail((1400, 1400), Image.LANCZOS)
    fresh = Image.new('RGB', im.size)
    fresh.paste(im)                            # new image: no EXIF/ICC/XMP/comments
    fresh.save(path, 'JPEG', quality=78, progressive=True, optimize=True)


def build_home(http, c, photos_dir):
    """Returns (homeRecord, None) or (None, reason)."""
    r = http.get(c['url'], 'site')
    if r is None:
        return None, 'page gone'
    urls = gallery(r.text, c['mls'])
    four = pick_four(urls)
    if not four:
        return None, f'{len(urls)} photos'
    blobs = []
    for u in four:
        p = http.get(u, 'cdn')
        if p is None or not p.content:
            return None, 'photo download failed'
        blobs.append(p.content)
    try:
        front = Image.open(io.BytesIO(blobs[0]))
        front.load()
    except Exception:
        return None, 'bad image'
    if looks_like_graphic(front):
        return None, 'front looks like a graphic'
    hid = 'h_' + secrets.token_hex(6)
    for n, b in enumerate(blobs, 1):
        clean_save(b, os.path.join(photos_dir, f'{hid}_{n}.jpg'))
    home = {k: c[k] for k in ('price', 'priceKind', 'soldDate', 'city', 'state', 'beds',
                              'baths', 'sqft', 'lotSqft', 'yearBuilt', 'propertyType')}
    return {'id': hid, **home, 'photos': 4, 'source': c['url'],
            '_street': c['street'], '_place': c['place'], '_bin': c['_bin']}, None


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------
FIELDS = ['id', 'price', 'priceKind', 'soldDate', 'city', 'state', 'beds', 'baths', 'sqft',
          'lotSqft', 'yearBuilt', 'propertyType', 'photos', 'source']


def write_stock(state, out):
    homes = [{k: h[k] for k in FIELDS} for h in state['done']]
    random.Random(len(homes) * 7919).shuffle(homes)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write('[\n' + ',\n'.join(json.dumps(h, ensure_ascii=False) for h in homes) + '\n]\n')
    return len(homes)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--count', type=int, default=650)
    ap.add_argument('--photos', default=DEFAULT_PHOTOS)
    ap.add_argument('--state', default=DEFAULT_STATE)
    ap.add_argument('--out', default=DEFAULT_OUT)
    ap.add_argument('--delay', type=float, default=2.0, help='seconds between redfin.com requests')
    ap.add_argument('--cdn-delay', type=float, default=0.4)
    ap.add_argument('--json-only', action='store_true')
    args = ap.parse_args()

    os.makedirs(args.photos, exist_ok=True)
    os.makedirs(args.state, exist_ok=True)
    state_path = os.path.join(args.state, 'progress.json')
    state = load_state(state_path)
    if args.json_only:
        print('wrote', write_stock(state, args.out), 'homes to', args.out)
        return

    http = Polite(args.delay, args.cdn_delay)
    rng = random.Random(1337)
    try:
        print('Phase 1: candidate pool')
        pool = fetch_pool(http, args.state)
        print(f'  pool: {len(pool)} sold candidates')
        count = run(http, state, state_path, pool, args, rng)
        if count < args.count:
            print(f'Short by {args.count - count}: falling back to active listings')
            pool = fetch_pool(http, args.state, listed=True)
            run(http, state, state_path, pool, args, rng)
    except Blocked as e:
        print(f'\n*** STOPPED: {e}\n*** Keeping {len(state["done"])} homes. Rerun later to resume.')
        save_state(state_path, state)
        write_stock(state, args.out)
        sys.exit(2)
    except KeyboardInterrupt:
        print('\ninterrupted; progress saved')
    save_state(state_path, state)
    n = write_stock(state, args.out)
    print(f'wrote {n} homes to {args.out}  (requests: {dict(http.count)})')


def run(http, state, state_path, pool, args, rng):
    """Try candidates bin by bin (always feeding the most-behind bin) until count."""
    tgt = targets(args.count)
    done_urls = {h['source'] for h in state['done']}
    streets = {h['_street'] for h in state['done']}
    per_place = Counter(h['_place'] for h in state['done'])
    per_bin = Counter(h['_bin'] for h in state['done'])
    per_type = Counter(h['propertyType'] for h in state['done'])

    queues = defaultdict(list)
    for c in pool:
        if c['url'] in done_urls or c['url'] in state['rejected']:
            continue
        queues['quirk' if is_quirk(c) else bin_of(c)].append(c)
    for b in queues:
        queues[b] = interleave_by_place(queues[b], rng)
        for c in queues[b]:
            c['_bin'] = b
    print('  queue sizes:', {b: len(queues[b]) for b in sorted(queues)})

    tried = 0
    while len(state['done']) < args.count:
        live = [b for b in tgt if queues.get(b)]
        if not live:
            break
        # Bins under target first (most behind by ratio); once all met, any bin.
        under = [b for b in live if per_bin[b] < tgt[b]]
        b = min(under or live, key=lambda b: (per_bin[b] / max(tgt[b], 1), rng.random()))
        c = queues[b].pop(0)
        cap_t = TYPE_CAPS.get(c['propertyType'])
        if (c['street'] in streets or per_place[c['place']] >= PER_PLACE_CAP or
                (cap_t and per_type[c['propertyType']] >= cap_t * args.count)):
            continue
        tried += 1
        home, why = build_home(http, c, args.photos)
        if not home:
            if why != 'page gone':          # transient: may work on a rerun
                state['rejected'][c['url']] = why
            print(f'  skip  {c["place"]:<24} ${c["price"]:>11,}  ({why})')
        else:
            state['done'].append(home)
            streets.add(c['street'])
            per_place[c['place']] += 1
            per_bin[b] += 1
            per_type[c['propertyType']] += 1
            print(f'  [{len(state["done"]):>3}] {c["place"]:<24} ${c["price"]:>11,}  '
                  f'{c["propertyType"]}')
        if tried % 5 == 0:
            save_state(state_path, state)
        if len(state['done']) % 25 == 0 and home:
            write_stock(state, args.out)
    save_state(state_path, state)
    return len(state['done'])


if __name__ == '__main__':
    main()
