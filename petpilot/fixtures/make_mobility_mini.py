"""Generate a tiny, fully synthetic mobility fixture with planted identifier types (deterministic).

usage: python petpilot/fixtures/make_mobility_mini.py
writes petpilot/fixtures/mobility_mini/          (original-style column names)
       petpilot/fixtures/mobility_mini_renamed/  (same data, obfuscated + reordered headers, plus mapping.json)

Everything is invented by this script: names from a short list, e-mails on the reserved .example domain,
HETUs in the 900-999 temporary range with valid check characters, travel-card ids that are Luhn-valid but
start with 9 (so they must NOT be mistaken for payment cards). No supplied challenge data is used.
"""
from __future__ import annotations

import csv
import hashlib
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

SEED = 20261106
HERE = Path(__file__).resolve().parent
HETU_CHECK = "0123456789ABCDEFHJKLMNPRSTUVWXY"
FIRST = ["Aino", "Eino", "Liisa", "Matti", "Helmi", "Onni", "Sofia", "Väinö", "Ella", "Leo", "Iida", "Aatu"]
LAST = ["Virtanen", "Korhonen", "Mäkinen", "Nieminen", "Laine", "Heikkinen", "Koskinen", "Järvinen", "Lehtonen"]
STOPS = [  # fictional stops on invented coordinates
    ("FS01", "Fixture Square A", 60.4512, 22.2671, "20100", "Turku", "Fixture-Centre", "1|2"),
    ("FS02", "Fixture Square B", 60.4518, 22.2690, "20100", "Turku", "Fixture-Centre", "2|3"),
    ("FS03", "Harbour Gate", 60.4380, 22.2290, "20200", "Turku", "Fixture-Harbour", "1"),
    ("FS04", "North Terminal", 60.4800, 22.2950, "20360", "Turku", "Fixture-North", "2|3"),
    ("FS05", "Hill Road", 60.4700, 22.1700, "21200", "Raisio", "Fixture-West", "3"),
    ("FS06", "Market Lane", 60.4460, 22.2760, "20100", "Turku", "Fixture-Centre", "1|3"),
]


def luhn_complete(prefix: str) -> str:
    digits = [int(c) for c in prefix]
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return prefix + str((10 - total % 10) % 10)


def hetu(rng: random.Random) -> tuple[str, date]:
    born = date(1940, 1, 1) + timedelta(days=rng.randrange(0, 365 * 66))
    sign = "-" if born.year < 2000 else "A"
    nnn = rng.randrange(900, 1000)
    core = f"{born:%d%m}{born.year % 100:02d}"
    return f"{core}{sign}{nnn:03d}{HETU_CHECK[int(core + f'{nnn:03d}') % 31]}", born


def phone(rng: random.Random) -> str:
    n = f"04{rng.choice('0156')}{rng.randrange(10**6, 10**7)}"
    return rng.choice([f"{n[:3]} {n[3:]}", f"+358{n[1:]}", n])


def build(rng: random.Random):
    stops = [dict(stop_id=s[0], name=s[1], lat=f"{s[2]:.6f}", lon=f"{s[3]:.6f}", postcode=s[4], municipality=s[5],
                  area=s[6], lines=s[7]) for s in STOPS]
    cards = []
    for i in range(40):
        card_id = luhn_complete("92469" + f"{rng.randrange(10**9, 10**10)}" + "0")
        registered = rng.random() < .7
        h, born = hetu(rng)
        first, last = rng.choice(FIRST), rng.choice(LAST)
        cards.append(dict(
            card_id=card_id,
            card_type=rng.choice(["adult", "adult", "student", "senior", "child", "disability_discount"]),
            registered=str(registered),
            issued_date=(date(2023, 1, 1) + timedelta(days=rng.randrange(0, 900))).isoformat(),
            holder_name=f"{first} {last}" if registered else "",
            holder_id_code=h if registered else "",
            holder_ref=hashlib.sha256(h.encode()).hexdigest() if registered else "",
            holder_birth_date=born.isoformat() if registered else "",
            holder_email=f"{first.lower().replace('ä', 'a').replace('ö', 'o')}.{last.lower().replace('ä', 'a')}"
                         f"{i}@fixture.example" if registered else "",
            holder_phone=phone(rng) if registered else "",
            segment=rng.choice(["S1", "S2", "S3"]),
            status=rng.choice(["active"] * 9 + ["replaced"]),
        ))
    taps = []
    t0 = datetime(2025, 10, 6, 5, 0)
    for i in range(400):
        c = rng.choice(cards)
        s = rng.choice(STOPS)
        ts = t0 + timedelta(days=rng.randrange(0, 5), minutes=rng.randrange(0, 18 * 60), seconds=rng.randrange(60))
        product = "season" if rng.random() < .5 else rng.choice(["value", "value_student", "value_reduced", "transfer"])
        taps.append(dict(tap_id=f"FT{i + 1:06d}", card_id=c["card_id"], ts=f"{ts:%Y-%m-%d %H:%M:%S}", stop_id=s[0],
                         line=rng.choice(s[7].split("|")), direction=rng.choice(["1", "2"]),
                         vehicle_id=str(rng.randrange(400, 560)), fare_product=product,
                         amount_eur="0.00" if product in ("season", "transfer") else f"{rng.choice([3.0, 1.5, 2.1]):.2f}"))
    taps.sort(key=lambda r: r["ts"])
    return {"stops": stops, "cards": cards, "taps": taps}


def write(tables: dict, out: Path, rename: bool, rng: random.Random) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    mapping = {}
    for name, rows in tables.items():
        cols = list(rows[0].keys())
        if rename:
            order = cols[:]
            rng.shuffle(order)
            new = {c: f"f{k + 1:02d}" for k, c in enumerate(order)}
            mapping[name] = new
            cols = order
        with open(out / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow([mapping[name][c] for c in cols] if rename else cols)
            for r in rows:
                w.writerow([r[c] for c in cols])
    if rename:
        (out / "mapping.json").write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
    return mapping


if __name__ == "__main__":
    rng = random.Random(SEED)
    data = build(rng)
    write(data, HERE / "mobility_mini", rename=False, rng=rng)
    write(data, HERE / "mobility_mini_renamed", rename=True, rng=random.Random(SEED + 1))
    print("wrote", HERE / "mobility_mini", "and", HERE / "mobility_mini_renamed")
