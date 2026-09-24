import type Highcharts from 'highcharts'
import { CircleAlert, ImageDown, Sheet, Table2 } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { Tooltip } from '../tooltip'
import { BASE_OPTIONS } from './baseOptions'
import { mergeOptions } from './merge'
import { PALETTE } from './theme'
import { WebtoolsChart, type ChartStatus } from './WebtoolsChart'
import './charts.css'

export interface ChartFrameProps {
  /** Visible chart title; also the accessible name. */
  title: string
  /** One-line context under the title (unit, period, geography). */
  subtitle?: string
  /** Longer text summary for screen readers (what the chart shows, key takeaway). */
  description?: string
  /** Data source line, e.g. "Source: Eurostat (nrg_bal_s)". */
  source?: ReactNode
  /** Plot height in px. */
  height?: number
  className?: string
  /** Two-letter language code passed to Webtools (chart UI and accessibility texts). */
  lang?: string
  /** Translated labels for the header actions and states. */
  labels?: Partial<ChartActionLabels>
  /** Content between the title and the plot (e.g. a headline figure with change chips). */
  headline?: ReactNode
}

export interface ChartActionLabels {
  showTable: string
  hideTable: string
  downloadPng: string
  downloadCsv: string
  loading: string
  loadError: string
  retry: string
  /** Keyboard skip link past the chart (replaces Webtools' English-only "Skip chart"). */
  skipChart: string
  chartEnd: string
}

const DEFAULT_LABELS: ChartActionLabels = {
  showTable: 'Show data table',
  hideTable: 'Hide data table',
  downloadPng: 'Download image (PNG)',
  downloadCsv: 'Download data (CSV)',
  loading: 'Loading chart…',
  loadError: 'The chart could not be loaded.',
  retry: 'Retry',
  skipChart: 'Skip chart',
  chartEnd: 'End of chart',
}

// Methods added by the exporting / export-data modules (missing from the bundled typings).
interface ExportingApi {
  exportChart(options?: { type?: string }): void
  downloadCSV(): void
  toggleDataTable(show?: boolean): void
}

/** Shared card used by every chart component; the plot is rendered by Europa Webtools. */
export function ChartFrame({
  title,
  subtitle,
  description,
  source,
  height = 320,
  className,
  lang = 'en',
  labels,
  headline,
  options,
  plugins,
  kind,
}: ChartFrameProps & { options: Highcharts.Options; plugins?: string[]; kind?: 'chart' | 'map' }) {
  const id = useId()
  const chartRef = useRef<Highcharts.Chart | null>(null)
  const [tableOpen, setTableOpen] = useState(false)
  const [status, setStatus] = useState<ChartStatus>('loading')
  const [error, setError] = useState<string>()
  const [retryKey, setRetryKey] = useState(0)
  const l = { ...DEFAULT_LABELS, ...labels }
  const exporting = () => (chartRef.current as unknown as { exporting?: ExportingApi } | null)?.exporting
  const merged = mergeOptions<Highcharts.Options>(
    BASE_OPTIONS,
    {
      colors: [...PALETTE],
      chart: { height },
      accessibility: {
        description,
        point: { valueDescriptionFormat: '{xDescription}{separator}{value}' },
      },
      exporting: { filename: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
    },
    options,
  )
  // Highcharts reads the chart title for its own a11y summary and exports; keep it off-canvas.
  merged.title = { text: title, style: { display: 'none' } }

  return (
    <figure className={`chart-card${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-title`}>
      <div className="chart-card__top">
        <figcaption className="chart-card__head">
          <span className="chart-card__title" id={`${id}-title`}>
            {title}
          </span>
          {subtitle && <span className="chart-card__subtitle">{subtitle}</span>}
        </figcaption>
        <div className="chart-card__actions" hidden={status !== 'ready'}>
          <Tooltip content={tableOpen ? l.hideTable : l.showTable}>
            <button
              type="button"
              className="chart-card__action"
              aria-pressed={tableOpen}
              onClick={() => {
                exporting()?.toggleDataTable(!tableOpen)
                setTableOpen(!tableOpen)
              }}
            >
              <Table2 size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip content={l.downloadPng}>
            <button
              type="button"
              className="chart-card__action"
              onClick={() => exporting()?.exportChart({ type: 'image/png' })}
            >
              <ImageDown size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip content={l.downloadCsv}>
            <button type="button" className="chart-card__action" onClick={() => exporting()?.downloadCSV()}>
              <Sheet size={16} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>
      {headline}
      <a className="chart-card__skip" href={`#${id}-end`}>
        {l.skipChart}: {title}
      </a>
      <div className="chart-card__body" style={{ minHeight: height }} aria-busy={status === 'loading'}>
        <WebtoolsChart
          options={merged}
          plugins={plugins}
          kind={kind}
          lang={lang}
          chartRef={chartRef}
          retryKey={retryKey}
          onStatus={(s, message) => {
            setStatus(s)
            setError(message)
            if (s !== 'ready') setTableOpen(false)
          }}
        />
        {status === 'loading' && (
          <div className="chart-card__state" role="status">
            <div className="ecl-spinner ecl-spinner--visible ecl-spinner--s" aria-hidden="true">
              <svg className="ecl-spinner__loader" viewBox="25 25 50 50">
                <circle className="ecl-spinner__circle" cx="50" cy="50" r="20" fill="none" strokeWidth="4px" strokeMiterlimit="10" />
              </svg>
            </div>
            <span>{l.loading}</span>
          </div>
        )}
        {status === 'error' && (
          <div className="chart-card__state chart-card__state--error" role="alert">
            <CircleAlert size={20} aria-hidden="true" />
            <span>
              {l.loadError}
              {error && <span className="chart-card__error-detail"> {error}</span>}
            </span>
            <button type="button" className="chart-card__retry" onClick={() => setRetryKey((n) => n + 1)}>
              {l.retry}
            </button>
          </div>
        )}
      </div>
      <span className="sr-only" id={`${id}-end`} tabIndex={-1}>
        {l.chartEnd}: {title}
      </span>
      {source && <p className="chart-card__source">{source}</p>}
    </figure>
  )
}
