import { Database, ExternalLink, Info, Sparkles } from 'lucide-react'
import { AreaChart, BarChart, HeatmapChart, HeroChart, LineChart, MapChart, PieChart, type ChartActionLabels } from '../components/charts'
import { InsightsPanel } from '../components/insights'
import { KpiCard, KpiGrid } from '../components/kpi'
import { DataTable } from '../components/table'
import { BreakdownCard } from './BreakdownCard'
import type { DashboardControls, DashboardSpec, Suggestion, WidgetSpec } from './types'
import './dashboard.css'

export interface DashboardLabels {
  keyIndicators: string
  keyInsights: string
  dataTable: string
  period: string
  /** "Period to {year}": the period buttons count back from a year asked for. */
  periodTo: string
  year: string
  unit: string
  overTime: string
  suggestions: string
  source: string
  opensNewTab: string
  missing: string
}

/**
 * Mounts a DashboardSpec (plain JSON from the generative pipeline) with the app's components:
 * KPI cards, charts rendered by Europa Webtools, and an accessible data table.
 */
export function Dashboard({
  spec,
  lang,
  labels,
  chartLabels,
  onSuggestion,
  busy,
}: {
  spec: DashboardSpec
  lang: string
  labels: DashboardLabels
  chartLabels: Partial<ChartActionLabels>
  onSuggestion: (s: Suggestion) => void
  busy?: boolean
}) {
  const charts = spec.widgets.filter((w) => !['kpis', 'table'].includes(w.type))
  const decimals = spec.widgets.find((w) => w.type === 'kpis')?.items[0]?.decimals ?? 1

  // Layout: 'full' charts span the width; 'half' charts pair up. A half chart without a partner
  // is widened so the grid never has an empty cell.
  const sizes = charts.map((w) => ('size' in w && w.size === 'half' ? 'half' : 'full'))
  for (let i = 0; i < sizes.length; i++) {
    if (sizes[i] !== 'half') continue
    let run = 0
    while (sizes[i + run] === 'half') run++
    if (run % 2 === 1) sizes[i + run - 1] = 'full'
    i += run - 1
  }

  const suffixFor = (unit: string | undefined) => (unit ? (unit === '%' ? '%' : ` ${unit}`) : '')

  const renderChart = (w: WidgetSpec) => {
    const unit = 'unit' in w && w.unit ? w.unit : spec.unit
    const common = {
      title: 'title' in w ? w.title : '',
      subtitle: 'subtitle' in w ? w.subtitle : undefined,
      description: spec.summary.join(' '),
      source: <SourceLine spec={spec} labels={labels} />,
      labels: chartLabels,
      lang,
      decimals: w.type === 'bar' && w.decimals != null ? w.decimals : decimals,
      valueSuffix: suffixFor(unit),
    }
    switch (w.type) {
      case 'line':
        return <LineChart {...common} categories={w.categories} series={w.series} reference={w.reference} highlight={w.highlight} />
      case 'area':
        return (
          <AreaChart
            {...common}
            categories={w.categories}
            series={w.series}
            stacked={w.stacked}
            reference={w.reference}
            highlight={w.highlight}
          />
        )
      case 'bar':
        return (
          <BarChart
            {...common}
            categories={w.categories}
            series={w.series}
            orientation={w.horizontal ? 'horizontal' : 'vertical'}
            showValues={w.series.length === 1 && w.categories.length <= 30}
            reference={w.reference}
            signed={w.signed}
            height={w.horizontal ? Math.max(260, w.categories.length * 28 + 90) : 320}
          />
        )
      case 'pie':
        return <PieChart {...common} data={w.slices} seriesName={w.title} donut centerLabel={w.centerLabel} />
      case 'hero':
        return (
          <HeroChart
            {...common}
            categories={w.categories}
            data={w.data}
            highlightIndex={w.highlightIndex}
            reference={w.reference}
            value={w.value}
            change={w.change}
            chips={w.chips}
            height={300}
          />
        )
      case 'heatmap':
        return <HeatmapChart {...common} xCategories={w.xCategories} yCategories={w.yCategories} values={w.values} />
      case 'map':
        return <MapChart {...common} data={w.data} height={w.height} />
      case 'breakdown':
        return <BreakdownCard widget={w} />
      default:
        return null
    }
  }

  return (
    <article className="dash" aria-labelledby="dash-title" aria-busy={busy}>
      <header className="dash__head">
        <div className="dash__heading">
          <h2 className="dash__title" id="dash-title" tabIndex={-1}>
            {spec.title}
          </h2>
          {spec.subtitle && <p className="dash__subtitle">{spec.subtitle}</p>}
        </div>
        {spec.summary.length > 0 && (
          <div className="dash__summary">
            <Sparkles size={16} aria-hidden="true" />
            <p>{spec.summary.join(' ')}</p>
          </div>
        )}
        <InsightsPanel title={labels.keyInsights} items={spec.insights} />
        {spec.notes.filter(Boolean).map((n) => (
          <p key={n} className="dash__note">
            <Info size={14} aria-hidden="true" />
            {n}
          </p>
        ))}
      </header>

      {spec.controls && <Toolbar controls={spec.controls} labels={labels} busy={busy} onSelect={onSuggestion} />}

      {spec.suggestions.length > 0 && (
        <nav className="dash__suggestions" aria-label={labels.suggestions}>
          <ul>
            {spec.suggestions.map((sug) => (
              <li key={sug.label}>
                <button type="button" className="suggestion-chip" onClick={() => onSuggestion(sug)} disabled={busy}>
                  {sug.explain ? <Sparkles size={14} aria-hidden="true" /> : null}
                  {sug.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {spec.widgets.map((w, i) =>
        w.type === 'kpis' && w.items.length ? (
          <KpiGrid key={`kpis-${i}`} label={labels.keyIndicators}>
            {w.items.map((k) => (
              <KpiCard key={`${k.label}-${k.caption}`} {...k} locale={lang} />
            ))}
          </KpiGrid>
        ) : null,
      )}

      {charts.length > 0 && (
        <div className="dash__charts">
          {charts.map((w, i) => (
            <div key={`${w.type}-${i}`} className={`dash__cell dash__cell--${sizes[i]}`}>
              {renderChart(w)}
            </div>
          ))}
        </div>
      )}

      {/* The full data stays available, but collapsed: the charts are the main view. */}
      {spec.widgets.map((w, i) =>
        w.type === 'table' ? (
          <details key={`table-${i}`} className="dash__table">
            <summary>
              {labels.dataTable}
              <span className="dash__table-meta">
                {w.rows.length} × {w.columns.length}
              </span>
            </summary>
            <DataTable
              caption={`${w.title}: ${spec.title}`}
              columns={w.columns}
              rows={w.rows}
              locale={lang}
              decimals={decimals}
              unit={spec.unit}
              missingLabel={labels.missing}
            />
          </details>
        ) : null,
      )}
    </article>
  )
}

/** Period / year / unit controls. Choosing an option runs its plan, like a chat request. */
function Toolbar({
  controls,
  labels,
  busy,
  onSelect,
}: {
  controls: DashboardControls
  labels: DashboardLabels
  busy?: boolean
  onSelect: (s: Suggestion) => void
}) {
  const activeYear = controls.years?.find((y) => y.active)
  return (
    <div className="dash__toolbar" role="toolbar" aria-label={[labels.period, labels.year, labels.unit].join(', ')}>
      {controls.periods && (
        <div className="dash__control">
          <span id="ctl-period">{controls.periodsTo ? labels.periodTo.replace('{year}', controls.periodsTo) : labels.period}</span>
          <div className="segmented" role="group" aria-labelledby="ctl-period">
            {controls.periods.map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={o.active}
                disabled={busy}
                onClick={() => !o.active && onSelect({ label: `${labels.period}: ${o.label}`, plan: o.plan })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {controls.years && (
        <label className="dash__control">
          {labels.year}
          <select
            className="dash__select"
            value={activeYear?.label ?? ''}
            disabled={busy}
            onChange={(e) => {
              const option = controls.years?.find((y) => y.label === e.target.value)
              if (option) onSelect({ label: `${labels.year}: ${option.label}`, plan: option.plan })
              // "Over time": back to the latest years.
              else if (controls.overTime) onSelect({ label: labels.overTime, plan: controls.overTime })
            }}
          >
            <option value="">{labels.overTime}</option>
            {controls.years.map((y) => (
              <option key={y.label} value={y.label}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {controls.units && controls.units.length > 1 && (
        <label className="dash__control">
          {labels.unit}
          <select
            className="dash__select"
            value={controls.units.find((u) => u.active)?.label ?? ''}
            disabled={busy}
            onChange={(e) => {
              const option = controls.units?.find((u) => u.label === e.target.value)
              if (option) onSelect({ label: `${labels.unit}: ${option.label}`, plan: option.plan })
            }}
          >
            {controls.units.map((u) => (
              <option key={u.label} value={u.label}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

function SourceLine({ spec, labels }: { spec: DashboardSpec; labels: DashboardLabels }) {
  return (
    <a className="dash__source" href={spec.source.url} target="_blank" rel="noreferrer">
      <Database size={12} aria-hidden="true" />
      {labels.source}: Eurostat · {spec.source.code}
      <ExternalLink size={11} aria-hidden="true" />
      <span className="sr-only"> ({labels.opensNewTab})</span>
    </a>
  )
}
