# Thailand display boundary

`thailand-boundary.json` is the unmodified `MultiPolygon` geometry of the feature
with `ADM0_A3=THA` from Natural Earth 10m Admin 0 Countries, version 5.1.2.
All 20 polygon parts, including islands, are retained. Coordinates are WGS84
longitude/latitude; no grid values or source forecast data have been changed.

- Source: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson
- Dataset: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/
- License: public domain, https://www.naturalearthdata.com/about/terms-of-use/
- Retrieved: 2026-10-30

This is a cartographic display mask, not a legal/survey boundary. The CAMS
overlay uses a vector clip in the same Web Mercator projection as its raster,
so the coastline stays sharp when zooming without recalculating forecast frames.
Point details use the same geometry to hide forecasts outside the display area.
