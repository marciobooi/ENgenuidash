// Builds the Europe map used by the dashboards (choropleths of country values).
//
//   npm run eurostat:geo
//
// Source: Eurostat GISCO country boundaries (CNTR_RG_20M_2020_4326), © EuroGeographics for the
// administrative boundaries. Country IDs are Eurostat codes (EL = Greece, UK), so values join
// directly on the "geo" dimension. Downloaded once; the app only reads the local file.
//
// Output: public/data/geo/europe.geojson — European countries only, overseas parts removed,
// coordinates rounded to ~100 m.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { get } from './lib/wikitext.mjs'

const SOURCE = 'https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_20M_2020_4326.geojson'
const OUT = join(process.cwd(), 'public/data/geo/europe.geojson')

// Map frame (lon/lat): mainland Europe, Iceland, Cyprus and Türkiye; overseas territories fall outside.
const BBOX = { west: -25, east: 45, south: 34, north: 72 }
const DECIMALS = 3

const inFrame = ([lon, lat]) => lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north
const round = (n) => Math.round(n * 10 ** DECIMALS) / 10 ** DECIMALS

/** Drops consecutive duplicate points created by rounding. */
function ring(coords) {
  const out = []
  for (const [lon, lat] of coords) {
    const p = [round(lon), round(lat)]
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  }
  return out.length >= 4 ? out : null
}

/** Keeps only the polygons whose first point lies in the European frame. */
function clip(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  const kept = polygons
    .filter((poly) => inFrame(poly[0][0]))
    .map((poly) => poly.map(ring).filter(Boolean))
    .filter((poly) => poly.length)
  if (!kept.length) return null
  return kept.length === 1 ? { type: 'Polygon', coordinates: kept[0] } : { type: 'MultiPolygon', coordinates: kept }
}

console.log('Downloading GISCO country boundaries…')
const world = await get(SOURCE, { json: true })
const features = []
for (const f of world.features) {
  const geometry = f.geometry && clip(f.geometry)
  if (!geometry) continue
  const p = f.properties
  features.push({
    type: 'Feature',
    properties: { id: p.CNTR_ID, name: p.NAME_ENGL, de: p.NAME_GERM, fr: p.NAME_FREN, eu: p.EU_STAT === 'T' },
    geometry,
  })
}

mkdirSync(join(OUT, '..'), { recursive: true })
writeFileSync(
  OUT,
  JSON.stringify({
    type: 'FeatureCollection',
    source: 'Eurostat GISCO, CNTR_RG_20M_2020 — © EuroGeographics for the administrative boundaries',
    features,
  }),
)
console.log(`Wrote ${features.length} countries to ${OUT}`)
