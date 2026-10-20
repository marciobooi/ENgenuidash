import { useEffect, useId, useState } from 'react'
import { FLAGS } from './flags'

/**
 * The outline of a country, drawn from the map data the app already has (public/data/geo/europe.geojson, Eurostat GISCO
 * boundaries, overseas parts removed), filled with its own flag. Fetched once and kept; the id is "shape-" and the
 * lower-case country code. A country the map does not have is shown as its flag.
 */
type Position = [number, number]
interface Feature {
  properties: { id?: string; name?: string }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Position[][] | Position[][][] }
}

let promise: Promise<Feature[]> | undefined
const features = () =>
  (promise ??= fetch(`${import.meta.env.BASE_URL}data/geo/europe.geojson`)
    .then((r) => r.json() as Promise<{ features: Feature[] }>)
    .then((g) => g.features)
    .catch(() => []))

/** The SVG path of a feature, fitted to a size x size square (equirectangular, corrected for latitude). */
function outline(f: Feature, size = 100): string {
  const polygons = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates as Position[][]] : (f.geometry.coordinates as Position[][][])) as Position[][][]
  const pts = polygons.flatMap((poly) => poly[0])
  const lons = pts.map((p) => p[0])
  const lats = pts.map((p) => p[1])
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2
  const k = Math.cos((lat0 * Math.PI) / 180)
  const w = (Math.max(...lons) - Math.min(...lons)) * k
  const h = Math.max(...lats) - Math.min(...lats)
  const scale = (size - 6) / Math.max(w, h)
  const x = (lon: number) => (3 + ((lon - Math.min(...lons)) * k * scale + (size - 6 - w * scale) / 2)).toFixed(1)
  const y = (lat: number) => (3 + ((Math.max(...lats) - lat) * scale + (size - 6 - h * scale) / 2)).toFixed(1)
  return polygons.map((poly) => poly.map((ring) => `M${ring.map((p) => `${x(p[0])},${y(p[1])}`).join('L')}Z`).join('')).join('')
}

export function CountryShape({ code, className, label }: { code: string; className?: string; label?: string }) {
  const clip = useId()
  // (undefined: not loaded yet; null: the map does not have it)
  const [d, setD] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void features().then((list) => {
      const f = list.find((x) => x.properties.id?.toLowerCase() === code.toLowerCase())
      if (live) setD(f ? outline(f) : null)
    })
    return () => {
      live = false
    }
  }, [code])
  const flag = FLAGS[code.toLowerCase()]
  if (d === undefined) return null
  const name = label ?? flag?.name ?? code.toUpperCase()
  // The flag covers the whole square (30 x 20 scaled by 5, centred), clipped to the country; without the outline it is the flag.
  const cover = flag ? <g transform="translate(-25 0) scale(5)">{flag.node()}</g> : null
  if (!d) {
    return flag ? (
      <svg className={className ?? 'art-shape'} viewBox="0 0 30 20" role="img" aria-label={name} focusable="false">
        {flag.node()}
      </svg>
    ) : null
  }
  return (
    <svg className={className ?? 'art-shape'} viewBox="0 0 100 100" role="img" aria-label={name} focusable="false">
      <clipPath id={clip}>
        <path d={d} fillRule="evenodd" />
      </clipPath>
      {cover ? <g clipPath={`url(#${clip})`}>{cover}</g> : <path d={d} fill="currentColor" fillRule="evenodd" />}
      <path d={d} fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" fillRule="evenodd" />
    </svg>
  )
}
