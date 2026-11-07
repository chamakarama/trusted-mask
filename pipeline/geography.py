"""Public rectangular analysis zones, deliberately narrower than arbitrary GeoJSON."""
import math
import re


def zone_centres(geo, *, polygons=False):
    def exact(value, keys):
        return isinstance(value, dict) and set(value) == set(keys)

    if not exact(geo, ['type', 'features']) or geo['type'] != 'FeatureCollection':
        raise ValueError('ARTIFACT_INVALID: geography envelope')
    features = geo['features']
    if not isinstance(features, list) or not 1 <= len(features) <= 100:
        raise ValueError('ARTIFACT_INVALID: geography size')
    centres, boxes = {}, []
    for feature in features:
        if not exact(feature, ['type', 'properties', 'geometry']) or feature['type'] != 'Feature':
            raise ValueError('ARTIFACT_INVALID: geography feature')
        props = feature['properties']
        if not exact(props, ['area_id', 'name', 'municipality', 'source']):
            raise ValueError('ARTIFACT_INVALID: geography properties')
        if any(not isinstance(v, str) or not 1 <= len(v) <= 240 or re.search(r'[<>"\x27`&\x00-\x1f]|^[=+@\-]', v) for v in props.values()):
            raise ValueError('ARTIFACT_INVALID: unsafe public label')
        ident = props['area_id']
        if ident in centres:
            raise ValueError('ARTIFACT_INVALID: duplicate area')
        shape = feature['geometry']
        if not exact(shape, ['type', 'coordinates']):
            raise ValueError('ARTIFACT_INVALID: geometry fields')
        def point(p):
            return isinstance(p, list) and len(p) == 2 and all(type(x) in (int, float) and math.isfinite(x) for x in p) and -180 <= p[0] <= 180 and -90 <= p[1] <= 90
        if not polygons:
            if shape['type'] != 'Point' or not point(shape['coordinates']):
                raise ValueError('ARTIFACT_INVALID: point')
            centres[ident] = shape['coordinates']
            continue
        rings = shape['coordinates']
        if shape['type'] != 'Polygon' or not isinstance(rings, list) or len(rings) != 1:
            raise ValueError('ARTIFACT_INVALID: single rectangular ring required')
        ring = rings[0]
        if not isinstance(ring, list) or len(ring) != 5 or not all(point(p) for p in ring) or ring[0] != ring[-1]:
            raise ValueError('ARTIFACT_INVALID: closed rectangular ring required')
        xs, ys = sorted(set(p[0] for p in ring)), sorted(set(p[1] for p in ring))
        if len(xs) != 2 or len(ys) != 2 or len(set(map(tuple, ring[:-1]))) != 4:
            raise ValueError('ARTIFACT_INVALID: nondegenerate rectangle required')
        if any((a[0] != b[0]) == (a[1] != b[1]) for a, b in zip(ring, ring[1:])):
            raise ValueError('ARTIFACT_INVALID: crossing/diagonal rectangle edge')
        box = (xs[0], ys[0], xs[1], ys[1])
        if any(min(box[2], b[2]) > max(box[0], b[0]) + 1e-10 and min(box[3], b[3]) > max(box[1], b[1]) + 1e-10 for b in boxes):
            raise ValueError('ARTIFACT_INVALID: overlapping analysis zones')
        boxes.append(box)
        centres[ident] = [sum(xs)/2, sum(ys)/2]
    return centres
