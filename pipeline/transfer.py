"""Bounded private demo uploads and portable verified recipient files."""
import io
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
