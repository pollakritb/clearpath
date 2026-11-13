# Province labels for picked map points

`thailand-provinces.json` is a derived, bundled copy of geoBoundaries gbOpen
THA ADM1 (`THA-ADM1-36821470`), representing 2017 boundaries, 77 provinces.

Attribution: © OpenStreetMap contributors; OpenStreetMap / Wambacher;
geoBoundaries, William & Mary geoLab.
License: [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
The derived database is distributed under the same license.

Pinned input:
https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/THA/ADM1/geoBoundaries-THA-ADM1_simplified.geojson

Input SHA-256:
`841f1250cac868fa966b2089863f01e9c9b4dc9b7fb0d9d6dce9a495e32b32a0`

Metadata: https://www.geoboundaries.org/api/current/gbOpen/THA/ADM1/

Transformation: retain Polygon/MultiPolygon rings and holes, round WGS84
coordinates to six decimal places, retain ISO province codes, add Thai province
names and bounding boxes, and compact JSON. No nearest-centroid assignment.

Regenerate from the pinned downloaded input:

```sh
.venv/bin/python scripts/update_province_labels.py /path/to/input.geojson
```

The script retains the reviewed ISO-to-Thai names in the current output. Review
names and source metadata when updating the upstream release.

These simplified, historical boundaries are a coarse place-name fallback only.
They do not change service coverage, GPS, public-coordinate obfuscation,
validation, IDW, notification areas or official administrative determinations.
A point outside these polygons retains a coordinate label. The browser does not
bundle this dataset; Vercel includes it through the existing `backend/**` rule.
