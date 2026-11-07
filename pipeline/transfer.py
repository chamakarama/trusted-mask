"""Bounded private demo uploads and portable verified recipient files."""
import io
import csv
from datetime import datetime
import json
import stat
import zipfile
from pathlib import Path
from pipeline import artifact, city
from pipeline.mobility import BANDS

MAX_UPLOAD = 16 * 1024 * 1024
MAX_EXPANDED = 100 * 1024 * 1024
FORMAT = 'routesafe-protected-v1'


def extract_upload(data, destination):
    if not 0 < len(data) <= MAX_UPLOAD: raise ValueError('UPLOAD_TOO_LARGE: maximum 16 MB ZIP')
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries=archive.infolist()
            if len(entries)!=len(city.INPUTS) or {e.filename for e in entries}!=set(city.INPUTS):
                raise ValueError('UPLOAD_FILES: expected taps.csv, stops.csv, public-zones.geojson and metadata.json at ZIP root')
            if sum(e.file_size for e in entries)>MAX_EXPANDED: raise ValueError('UPLOAD_TOO_LARGE: expanded limit 100 MB')
            for entry in entries:
                mode=entry.external_attr >> 16
                if entry.is_dir() or stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0,stat.S_IFREG)) or entry.flag_bits & 1:
                    raise ValueError('UPLOAD_FILES: regular unencrypted files required')
                # Read through the bounded stream; never use extractall or filenames as paths.
                with archive.open(entry) as stream:
                    content=stream.read(MAX_EXPANDED+1)
                if len(content)!=entry.file_size or len(content)>MAX_EXPANDED:raise ValueError('UPLOAD_TOO_LARGE')
                (Path(destination)/entry.filename).write_bytes(content)
    except (zipfile.BadZipFile,RuntimeError,NotImplementedError,EOFError) as exc:
        raise ValueError('UPLOAD_INVALID_ZIP') from exc


def raw_demo_zip(folder):
    """Private endpoint only. Truth and unrelated source files are excluded."""
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name in city.INPUTS:archive.writestr(name,(Path(folder)/name).read_bytes())
    return stream.getvalue()


def protected_document(source):
    source=Path(source);digest=artifact.verify(source)
    stats=json.loads((source/'statistics.json').read_text())
    manifest=json.loads((source/'manifest.json').read_text())
    from datetime import date,timedelta
    start=date.fromisoformat(manifest['period']['start_date']);end=date.fromisoformat(manifest['period']['end_date_inclusive'])
    days=sum((start+timedelta(days=i)).weekday()<5 for i in range((end-start).days+1))
    hours={'00-06':6,'06-09':3,'09-15':6,'15-18':3,'18-24':6}
    areas=sorted({r['destination_area'] for r in stats['od']})
    summaries=[]
    for band in BANDS:
        for area in areas:
            # Post-process signed counts; clamp only after summing.
            n=max(0,sum(r['noisy_value'] for r in stats['od'] if r['destination_area']==area and r['hour_band']==band))
            summaries.append({'destination_area':area,'departure_band':band,'protected_period_trips':n,'trips_per_weekday':n/days,'trips_per_weekday_hour':n/days/hours[band]})
    return {'format':FORMAT,'release_id':manifest['release_id'],'manifest_sha256':digest,
        'read_me':{'scenario':('Since AI full fictional day: morning Kupittaa TRK-G14, lunch TRK-G12, afternoon departures from Kupittaa, fictional Alko shopping-area run TRK-G08, night afterparty departures TRK-G13. Exaggerated 10,000 fictional attendees on invented 30–31 October 2025 weekdays; not actual event dates, people, shops or customers.' if manifest['release_id']=='kupittaa-day-v2' else 'Since AI at Kupittaa: TRK-G14 is the public destination area. Invented scale test with 10,000 fictional attendees and two invented weekdays, 30–31 October 2025. Not actual event attendance, dates or venue location.' if manifest['release_id']=='kupittaa-hackathon-v1' else 'Synthetic transport demonstration; not observed city travel.'), 'contents':'Protected aggregate travel counts and public geography. Open this file in the RouteSafe planner or analyse the aggregate tables in another tool.',
                   'privacy':'No individual records or card identifiers. Card-level differential privacy; not a person-level guarantee or a proof of immunity to inference.',
                   'limits':'Synthetic activity; inferred destinations; capped noisy counts; no observed passenger paths or capacity comparison. Areas are artificial zones. A spike is collective demand, not a household location.',
                   'units':'OD counts are weekday journeys over the release period, not unique people. Bands refer to departure time. Compare rates per weekday per hour across unequal bands.',
                   'integrity':'Original nine release files are embedded verbatim below. The planner validates their contract and checksums locally. Hashes establish consistency, not publisher authenticity.'},
        'aggregate_destinations':summaries,
        'files':{name:(source/name).read_text() for name in sorted(artifact.PAYLOADS|{'manifest.json','checksums.sha256'})}}


def raw_document(folder):
    folder = Path(folder)
    metadata = city.validate_metadata(folder)
    if metadata['generator_version'] != 'kupittaa-day-2':
        raise ValueError('Only the frozen full-day synthetic demo is supported')
    stops = list(csv.DictReader((folder / 'stops.csv').open()))
    stop_index = {s['stop_id']: i for i, s in enumerate(stops)}
    cards = {}
    epoch = datetime(2025, 10, 6)
    count = 0
    with (folder / 'taps.csv').open() as stream:
        for row in csv.DictReader(stream):
            card = cards.setdefault(row['card_id'], {
                'card_id': row['card_id'], 'line': row['line'],
                'fare_product': row['fare_product'], 'events': []})
            if (card['line'], card['fare_product']) != (row['line'], row['fare_product']):
                raise ValueError('This compact demo format requires constant line/fare per card')
            seconds = (datetime.fromisoformat(row['ts']) - epoch).total_seconds()
            if seconds % 60 or not 0 <= seconds < 28 * 86400:
                raise ValueError('Unsupported timestamp')
            card['events'].extend([int(seconds // 60), stop_index[row['stop_id']]])
            count += 1
    return {
        'format': 'routesafe-raw-demo-v1', 'scenario_id': 'kupittaa-day-v2',
        'protection': 'NONE — raw individual synthetic boarding records',
        'read_me': {
            'contents': 'All original synthetic boarding records, including card IDs, exact times, stops, line and fare. No sampling, aggregation, clipping or privacy noise.',
            'encoding': 'Each card has events [minute_offset, stop_index, minute_offset, stop_index, ...]. Exact local timestamp = 2025-10-06 00:00:00 + minute_offset minutes. stop_index is zero-based into stops. line and fare_product apply to every event of that card. Decode with Python for individual histories or aggregates.',
            'scenario': 'Entirely fictional Since AI day. TRK-G14 Kupittaa, TRK-G12 lunch, TRK-G08 Alko-run shopping area, TRK-G09 food, TRK-G13 afterparty. Invented 30–31 October 2025 event dates and exaggerated attendance; no real people or shop customers.',
            'planner': 'Open this JSON through Open data file in RouteSafe. It computes uncapped inferred demand locally and labels it RAW / unprotected. No file content is uploaded.',
            'limits': 'Boardings are observed within the synthetic source. Destinations remain inferred by next boarding and daily closure, not actual arrivals. Compact encoding is lossless, not anonymization.'},
        'epoch_local': '2025-10-06 00:00:00', 'timezone': 'Europe/Helsinki',
        'record_count': count, 'stops': stops, 'cards': list(cards.values())}
