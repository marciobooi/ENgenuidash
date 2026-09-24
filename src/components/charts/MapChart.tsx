import type Highcharts from 'highcharts'
import { useEffect, useState } from 'react'
import { ChartFrame, type ChartFrameProps } from './ChartFrame'
import { SEQUENTIAL_STOPS } from './theme'
import type { ValueFormat } from './types'

export interface MapDatum {
  /** Eurostat geo code (EL = Greece, UK…), matching the GISCO boundaries. */
  code: string
  name: string
  value: number
}

export interface MapChartProps extends ChartFrameProps, ValueFormat {
  data: MapDatum[]
  seriesName?: string
}

// Europe boundaries from Eurostat GISCO (npm run eurostat:geo), loaded once.
let geoPromise: Promise<unknown> | null = null
function loadEuropeGeo() {
  geoPromise ??= fetch(`${import.meta.env.BASE_URL}data/geo/europe.geojson`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .catch((err) => {
      geoPromise = null
      throw err
    })
  return geoPromise
}

/**
 * Choropleth of European countries (sequential ECL blue). Countries without a value stay grey, so
 * the selection is always seen in its European context. Drawn with Webtools' Highcharts Maps.
 */
export function MapChart({ data, seriesName, valueSuffix = '', decimals = 1, height = 420, ...frame }: MapChartProps) {
  const [geo, setGeo] = useState<unknown>(null)
  useEffect(() => {
    loadEuropeGeo().then(setGeo, () => setGeo(null))
  }, [])

  if (!geo) return <div className="chart-card chart-card--placeholder" style={{ minHeight: height }} aria-hidden="true" />

  const options: Highcharts.Options = {
    chart: { map: geo as Highcharts.GeoJSON, height },
    // Frame: mainland Europe (Iceland to Cyprus); overseas territories are not in the file.
    mapView: { fitToGeometry: { type: 'MultiPoint', coordinates: [[-10.5, 34.5], [34, 70.5]] } },
    mapNavigation: { enabled: true, enableMouseWheelZoom: false, buttonOptions: { verticalAlign: 'bottom' } },
    colorAxis: { stops: SEQUENTIAL_STOPS, labels: { format: `{value:,.0f}${valueSuffix}` } },
    legend: { enabled: true, title: { text: valueSuffix.trim() } },
    tooltip: { headerFormat: '', pointFormat: `<b>{point.name}</b>: {point.value:,.${decimals}f}${valueSuffix}` },
    series: [
      {
        type: 'map',
        name: seriesName ?? frame.title,
        joinBy: ['id', 'code'],
        allAreas: true,
        data: data.map((d) => ({ code: d.code, name: d.name, value: d.value })),
        nullColor: '#e9eaeb', // --ecl-color-dark-10: countries outside the selection
        borderColor: '#ffffff',
        borderWidth: 0.6,
        states: { hover: { color: '#ffcc00' } }, // --ecl-color-secondary
      },
    ] as Highcharts.SeriesOptionsType[],
  }
  return <ChartFrame {...frame} height={height} options={options} kind="map" />
}
