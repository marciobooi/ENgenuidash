import { BookOpen, ChevronDown, Database, ExternalLink, Info, Sparkles } from 'lucide-react'
import { useId, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { AreaChart, BarChart, HeatmapChart, HeroChart, LineChart, MapChart, PieChart, type ChartActionLabels } from '../components/charts'
import { InsightsPanel } from '../components/insights'
import { EclSelect, FilterField, type EclMultiSelectLabels, type FilterControl } from '../components/filters'
import { KpiCard, KpiGrid } from '../components/kpi'
import { DataTable } from '../components/table'
import { AnswerCard } from './AnswerCard'
import { BreakdownCard } from './BreakdownCard'
import type { DashboardControls, DashboardSpec, Presentation, SectionKey, Suggestion, WidgetSpec } from './types'
import './dashboard.css'

export interface DashboardLabels {
  /** Label of the direct answer to a focused question. */
  answer: string
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
  /** "Show": all countries, or the top / bottom 5 or 10. */
  show: string
  /** "More filters ({n})" / "Fewer filters": the toolbar controls folded away. */
  moreFilters: string
  fewerFilters: string
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
  filters = [],
  onFilter,
  multiSelectLabels,
  busy,
  actions,
}: {
  spec: DashboardSpec
  lang: string
  labels: DashboardLabels
  chartLabels: Partial<ChartActionLabels>
  onSuggestion: (s: Suggestion) => void
  /** Countries, products, flows… for the dataset on screen (see filters.ts). */
  filters?: FilterControl[]
  onFilter?: (control: FilterControl, codes: string[]) => void
  multiSelectLabels?: EclMultiSelectLabels
  busy?: boolean
  /** Buttons next to the title (e.g. copy the link to this dashboard). */
  actions?: ReactNode
}) {
  const charts = spec.widgets.filter((w) => !['kpis', 'table', 'answer', 'text'].includes(w.type))
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
      source: <SourceLine source={'source' in w && w.source ? w.source : spec.source} labels={labels} />,
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
        if (w.views && w.views.length > 1) return <SwitchableBar widget={w} common={common} />
        return (
          <BarChart
            {...common}
            categories={w.categories}
            series={w.series}
            orientation={w.horizontal ? 'horizontal' : 'vertical'}
            stacked={w.stacked}
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

  const answer = spec.widgets.find((w) => w.type === 'answer')
  const text = spec.widgets.find((w) => w.type === 'text')
  const { presentation } = spec
  const kpis = spec.widgets.find((w) => w.type === 'kpis')
  const table = spec.widgets.find((w) => w.type === 'table')

  // The sections, in the order the spec gives (layout.ts): a focused question opens with its
  // answer; an overview with the summary and insights.
  const sections: Record<SectionKey, () => ReactNode> = {
    answer: () => (answer ? <AnswerCard widget={answer} label={labels.answer} /> : null),
    explainer: () => (text?.type === 'text' ? <Explainer widget={text} labels={labels} /> : null),
    summary: () =>
      spec.summary.length > 0 && (
        <div className="dash__summary">
          <Sparkles size={16} aria-hidden="true" />
          <p>{spec.summary.join(' ')}</p>
        </div>
      ),
    insights: () => <InsightsPanel title={labels.keyInsights} items={spec.insights} />,
    notes: () =>
      spec.notes.filter(Boolean).map((n) => (
        <p key={n} className="dash__note">
          <Info size={14} aria-hidden="true" />
          {n}
        </p>
      )),
    toolbar: () =>
      (spec.controls || filters.length > 0) && (
        <Toolbar
          controls={spec.controls ?? {}}
          labels={labels}
          busy={busy}
          onSelect={onSuggestion}
          filters={filters}
          onFilter={onFilter}
          multiSelectLabels={multiSelectLabels}
          presentation={presentation}
        />
      ),
    suggestions: () =>
      spec.suggestions.length > 0 && (
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
      ),
    kpis: () =>
      kpis?.type === 'kpis' &&
      kpis.items.length > 0 && (
        <KpiGrid label={labels.keyIndicators} variant={presentation.kpiStyle}>
          {kpis.items.map((k) => (
            <KpiCard key={`${k.label}-${k.caption}`} {...k} locale={lang} variant={presentation.kpiStyle} />
          ))}
        </KpiGrid>
      ),
    charts: () =>
      charts.length > 0 && (
        <div className="dash__charts">
          {charts.map((w, i) => (
            <div key={`${w.type}-${i}`} className={`dash__cell dash__cell--${sizes[i]}`}>
              {renderChart(w)}
            </div>
          ))}
        </div>
      ),
    // The full data stays available, but collapsed: the charts are the main view.
    table: () =>
      table?.type === 'table' && (
        <details className="dash__table">
          <summary>
            {labels.dataTable}
            <span className="dash__table-meta">
              {table.rows.length} × {table.columns.length}
            </span>
          </summary>
          <DataTable
            caption={`${table.title}: ${spec.title}`}
            columns={table.columns}
            rows={table.rows}
            locale={lang}
            decimals={decimals}
            unit={spec.unit}
            missingLabel={labels.missing}
          />
        </details>
      ),
  }

  // One section, or a row of sections side by side on wide screens. Empty ones are skipped, and
  // each gets its place in the entrance sequence (a short fade, off with reduced motion).
  const render = (key: SectionKey) => {
    const node = sections[key]?.()
    return node && !(Array.isArray(node) && node.length === 0) ? node : null
  }
  let step = 0
  const items = spec.layout.map((item) => {
    const keys = Array.isArray(item) ? item : [item]
    const parts = keys.map((k) => ({ k, node: render(k) })).filter((x) => x.node)
    if (!parts.length) return null
    const style = { '--step': step++ } as CSSProperties
    if (parts.length === 1) {
      return (
        <div key={keys.join('+')} className={`dash__section dash__section--${parts[0].k}`} style={style}>
          {parts[0].node}
        </div>
      )
    }
    return (
      <div key={keys.join('+')} className="dash__section dash__row" style={style}>
        {parts.map((x) => (
          <div key={x.k} className={`dash__row-cell dash__section--${x.k}`}>
            {x.node}
          </div>
        ))}
      </div>
    )
  })

  return (
    <article
      className={`dash dash--${presentation.accent} dash--${presentation.template}`}
      aria-labelledby="dash-title"
      aria-busy={busy}
    >
      <header className="dash__head">
        <div className="dash__heading">
          <h2 className="dash__title" id="dash-title" tabIndex={-1}>
            {spec.title}
          </h2>
          {spec.subtitle && <p className="dash__subtitle">{spec.subtitle}</p>}
        </div>
        {actions && <div className="dash__actions">{actions}</div>}
      </header>
      {items}
    </article>
  )
}

type BarWidget = Extract<WidgetSpec, { type: 'bar' }>

/**
 * A bar chart with a selector above the plot ("Compared with: 2019"): each option is a view the
 * composer already computed from the data on screen, so switching needs no new request.
 */
function SwitchableBar({ widget: w, common }: { widget: BarWidget; common: Omit<ComponentProps<typeof BarChart>, 'categories' | 'series'> }) {
  const id = useId()
  const views = w.views ?? []
  const [index, setIndex] = useState(0)
  const view = views[index] ?? views[0]
  return (
    <BarChart
      {...common}
      title={view.title}
      categories={view.categories}
      series={[{ name: view.title, data: view.data }]}
      orientation={w.horizontal ? 'horizontal' : 'vertical'}
      showValues={view.categories.length <= 30}
      reference={w.reference}
      signed={w.signed}
      height={w.horizontal ? Math.max(260, view.categories.length * 28 + 90) : 320}
      headline={
        <div className="chart-view">
          <EclSelect
            id={`${id}-view`}
            label={w.viewLabel ?? ''}
            value={view.label}
            options={views.map((v) => ({ code: v.label, label: v.label }))}
            onChange={(code) => setIndex(Math.max(0, views.findIndex((v) => v.label === code)))}
          />
        </div>
      }
    />
  )
}

/** Eurostat's description of the indicator, with a link to the full metadata. */
function Explainer({ widget, labels }: { widget: Extract<WidgetSpec, { type: 'text' }>; labels: DashboardLabels }) {
  const id = useId()
  return (
    <section className="explainer" aria-labelledby={`${id}-title`}>
      <h3 className="explainer__title" id={`${id}-title`}>
        <BookOpen size={16} aria-hidden="true" />
        {widget.title}
      </h3>
      <p className="explainer__body">{widget.body}</p>
      {widget.source && (
        <a className="dash__source" href={widget.source.url} target="_blank" rel="noreferrer">
          <Database size={12} aria-hidden="true" />
          {labels.source}: {widget.source.title}
          <ExternalLink size={11} aria-hidden="true" />
          <span className="sr-only"> ({labels.opensNewTab})</span>
        </a>
      )}
    </section>
  )
}

/**
 * Period / year / unit controls and the data filters (countries, products…), most relevant first
 * for the kind of question (see layout.ts). The first ones show; the others are folded under
 * "More filters", so the toolbar stays short and differs from one question to another.
 * Choosing an option runs its plan, like a chat request.
 */
function Toolbar({
  controls,
  labels,
  busy,
  onSelect,
  filters,
  onFilter,
  multiSelectLabels,
  presentation,
}: {
  controls: DashboardControls
  labels: DashboardLabels
  busy?: boolean
  onSelect: (s: Suggestion) => void
  filters: FilterControl[]
  onFilter?: (control: FilterControl, codes: string[]) => void
  multiSelectLabels?: EclMultiSelectLabels
  presentation: Presentation
}) {
  const [expanded, setExpanded] = useState(false)
  const moreId = useId()
  const periodId = useId()
  const activeYear = controls.years?.find((y) => y.active)

  const entries: { key: string; label: string; node: ReactNode }[] = []
  if (controls.periods) {
    entries.push({
      key: 'period',
      label: labels.period,
      node: (
        <div className="dash__control">
          <span id={periodId}>{controls.periodsTo ? labels.periodTo.replace('{year}', controls.periodsTo) : labels.period}</span>
          <div className="segmented" role="group" aria-labelledby={periodId}>
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
      ),
    })
  }
  if (controls.ranks) {
    entries.push({
      key: 'rank',
      label: labels.show,
      node: (
        <div className="dash__control">
          <span id={`${periodId}-rank`}>{labels.show}</span>
          <div className="segmented" role="group" aria-labelledby={`${periodId}-rank`}>
            {controls.ranks.map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={o.active}
                disabled={busy}
                onClick={() => !o.active && onSelect({ label: `${labels.show}: ${o.label}`, plan: o.plan })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ),
    })
  }
  if (controls.years) {
    entries.push({
      key: 'year',
      label: labels.year,
      node: (
        <EclSelect
          id={`${periodId}-year`}
          label={labels.year}
          value={activeYear?.label ?? ''}
          disabled={busy}
          // "Over time" (no single year): back to the latest years.
          options={[{ code: '', label: labels.overTime }, ...controls.years.map((y) => ({ code: y.label, label: y.label }))]}
          onChange={(code) => {
            const option = controls.years?.find((y) => y.label === code)
            if (option) onSelect({ label: `${labels.year}: ${option.label}`, plan: option.plan })
            else if (controls.overTime) onSelect({ label: labels.overTime, plan: controls.overTime })
          }}
        />
      ),
    })
  }
  if (onFilter && multiSelectLabels) {
    for (const f of filters) {
      entries.push({ key: f.dim, label: f.label, node: <FilterField filter={f} onChange={onFilter} labels={multiSelectLabels} disabled={busy} /> })
    }
  }
  if (controls.units && controls.units.length > 1) {
    entries.push({
      key: 'unit',
      label: labels.unit,
      node: (
        <EclSelect
          id={`${periodId}-unit`}
          label={labels.unit}
          value={controls.units.find((u) => u.active)?.label ?? ''}
          disabled={busy}
          options={controls.units.map((u) => ({ code: u.label, label: u.label }))}
          onChange={(code) => {
            const option = controls.units?.find((u) => u.label === code)
            if (option) onSelect({ label: `${labels.unit}: ${option.label}`, plan: option.plan })
          }}
        />
      ),
    })
  }
  if (!entries.length) return null

  // Most relevant first; controls the template does not rank keep their order, after these.
  const rank = (key: string) => {
    const i = presentation.controls.indexOf(key)
    return i < 0 ? presentation.controls.length : i
  }
  const ordered = entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e.key) - rank(b.e.key) || a.i - b.i).map((x) => x.e)
  // Folding one control away saves nothing: show it.
  const shown = ordered.length - presentation.primaryControls > 1 ? presentation.primaryControls : ordered.length
  const primary = ordered.slice(0, shown)
  const more = ordered.slice(shown)

  return (
    <div className="dash__toolbar" role="toolbar" aria-label={ordered.map((e) => e.label).join(', ')}>
      {primary.map((e) => (
        <div key={e.key} className="dash__toolbar-item">
          {e.node}
        </div>
      ))}
      {more.length > 0 && (
        <>
          <button
            type="button"
            className="dash__more"
            aria-expanded={expanded}
            aria-controls={moreId}
            onClick={() => setExpanded((x) => !x)}
          >
            <ChevronDown size={16} aria-hidden="true" className="dash__more-icon" />
            {expanded ? labels.fewerFilters : labels.moreFilters.replace('{n}', String(more.length))}
          </button>
          {/* Mounted only when open: ECL selects are enhanced on mount, at their real size. */}
          <div id={moreId} className="dash__toolbar-more" hidden={!expanded}>
            {expanded &&
              more.map((e) => (
                <div key={e.key} className="dash__toolbar-item">
                  {e.node}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}

function SourceLine({ source, labels }: { source: { code: string; url: string }; labels: DashboardLabels }) {
  return (
    <a className="dash__source" href={source.url} target="_blank" rel="noreferrer">
      <Database size={12} aria-hidden="true" />
      {labels.source}: Eurostat · {source.code}
      <ExternalLink size={11} aria-hidden="true" />
      <span className="sr-only"> ({labels.opensNewTab})</span>
    </a>
  )
}
