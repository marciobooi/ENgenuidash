import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { WidgetSpec } from '../types'
import labelsJson from './labels.json'
import { DEFAULT_DISAGGREGATION, layoutSankey, type Disaggregation, type DrawnFlow, type DrawnNode } from './layout'
import { BalanceTable, FUEL_COLORS, buildModel } from './model'
import './sankey.css'

type SankeyWidgetSpec = Extract<WidgetSpec, { type: 'sankey' }>

export interface SankeyLabels {
  year: string
  play: string
  pause: string
  legend: string
  details: string
  close: string
  open: string
  collapse: string
  overTime: string
  byFuel: string
  fromTo: string
  hint: string
  noData: string
  table: string
}

const LABELS = labelsJson as Record<string, Record<string, string>>

/** The flow a node stands for (its size is that flow's), for the numbers behind it. */
const NODE_FLOW: Record<string, string> = {
  N1: 'N1',
  N1_1: 'F1_1',
  E1_1_1: 'F1_1_1',
  E1_1_2: 'F1_1_2',
  E1_2: 'F1_2',
  E1_3: 'F1_3',
  E1_4: 'F1_4',
  T2: 'F2_1',
  N5: 'F5_1',
  E4: 'F4',
  N6: 'N6',
  N6_1: 'F6_1',
  E6_2: 'F6_2',
  E6_3: 'F6_3',
  E6_4: 'F6_4',
  E6_5: 'F6_5',
  E6_6: 'F6_6',
  E6_7: 'F6_7',
  E6_8: 'F6_8',
}

/** The nodes that open up into their parts (ENSANKEY: click a node), and the setting each one toggles. */
const TOGGLES: Record<string, keyof Disaggregation> = { N1_1: 'production', N6: 'afterTransformation', N1: 'allSources' }

let ruler: CanvasRenderingContext2D | null = null
function measure(text: string, fontSize: number): number {
  if (!ruler && typeof document !== 'undefined') ruler = document.createElement('canvas').getContext('2d')
  if (!ruler) return text.length * fontSize * 0.55
  ruler.font = `${fontSize}px Arial, sans-serif`
  return ruler.measureText(text).width
}

export function SankeyWidget({ widget, labels, renderChart }: { widget: SankeyWidgetSpec; labels: SankeyLabels; renderChart: (w: WidgetSpec) => ReactNode }) {
  const lang = widget.lang
  const names = LABELS[lang] ?? LABELS.en
  const name = (code: string) => names[code] ?? LABELS.en[code] ?? code
  const nf = useMemo(() => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }), [lang])
  const formatValue = (v: number) => nf.format(Math.round(v)).replace(/\s/g, '\u2009')

  const table = useMemo(() => new BalanceTable(widget.years, widget.table), [widget.years, widget.table])
  const model = useMemo(() => buildModel(table, widget.fuel, widget.byFuel), [table, widget.fuel, widget.byFuel])

  const [year, setYear] = useState(widget.year)
  const [disaggregation, setDisaggregation] = useState<Disaggregation>({ ...DEFAULT_DISAGGREGATION, ...widget.disaggregation })
  // A new diagram (another country, product or year chosen in the toolbar) starts from what it says.
  const [shown, setShown] = useState(widget)
  if (shown !== widget) {
    setShown(widget)
    setYear(widget.year)
    setDisaggregation({ ...DEFAULT_DISAGGREGATION, ...widget.disaggregation })
  }
  const [playing, setPlaying] = useState(false)
  const [selection, setSelection] = useState<{ kind: 'node' | 'flow'; code: string; flowCode: string; source?: string; target?: string } | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)

  // The picture is as wide as its box; its height follows the 16:9 of the original.
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(960)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setWidth(Math.max(320, el.clientWidth))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // As in the original the drawing sits inside margins (room for the labels at both ends); on a narrow screen it scrolls.
  const total = Math.max(width, 900)
  const drawWidth = Math.round(total * 0.76)
  const drawHeight = Math.round(Math.min(drawWidth * 0.56, Math.max(420, (typeof window === 'undefined' ? 800 : window.innerHeight) * 0.8)))
  const marginLeft = Math.round(total * 0.075)
  const marginTop = Math.round(drawHeight * 0.05)
  const height = Math.round(drawHeight * 1.14)

  // Playing the years: one every second and a bit, from where it is to the last.
  useEffect(() => {
    if (!playing) return
    const i = widget.years.indexOf(year)
    const t = window.setTimeout(() => {
      if (i >= widget.years.length - 1) setPlaying(false)
      else setYear(widget.years[i + 1])
    }, 900)
    return () => window.clearTimeout(t)
  }, [playing, year, widget.years])

  const flows = useMemo(() => model.flows(year), [model, year])
  const layout = useMemo(
    () =>
      layoutSankey({ flows, width: drawWidth, height: drawHeight, scaleMax: model.scaleMax, disaggregation, transformationShift: 0, name, format: formatValue, unit: widget.unit, measure }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flows, drawWidth, drawHeight, model.scaleMax, disaggregation, widget.unit, lang],
  )

  const fuelName = (code: string) => (code === 'losses' ? name('losses') : name(code))
  const colorOf = (fuel: string) => (fuel === 'losses' ? '#DCDCDC' : (FUEL_COLORS[fuel] ?? '#7D8088'))
  const idPrefix = useId()

  const onNodeActivate = (n: DrawnNode) => setSelection({ kind: 'node', code: n.code, flowCode: NODE_FLOW[n.code] ?? n.code })
  const onFlowActivate = (f: DrawnFlow) => setSelection({ kind: 'flow', code: f.code, flowCode: f.code, source: f.source, target: f.target })
  const keyActivate = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      fn()
    }
  }

  const showTip = (e: { clientX: number; clientY: number }, lines: string[]) => {
    const r = box.current?.getBoundingClientRect()
    if (r) setTip({ x: e.clientX - r.left + 12, y: e.clientY - r.top + 12, lines })
  }

  // What is used in the picture: the products drawn (legend).
  const used = useMemo(() => {
    const seen = new Set<string>()
    for (const f of layout.flows) for (const p of f.paths) seen.add(p.fuel)
    return [...seen].filter((f) => f !== 'losses' && f !== 'TOTAL')
  }, [layout])

  const detail = selection ? buildDetail(selection, model, widget, name, fuelName, formatValue, year) : null
  const toggle = selection ? TOGGLES[selection.code] : undefined

  return (
    <section className="sankey" aria-label={widget.title}>
      <div className="sankey__head">
        <h3 className="sankey__title">{widget.title}</h3>
        {widget.subtitle && <p className="sankey__subtitle">{widget.subtitle}</p>}
        <p className="sankey__hint">{labels.hint}</p>
      </div>
      <div className="sankey__box" ref={box} onMouseLeave={() => setTip(null)}>
        <svg className="sankey__svg" width={total} height={height} viewBox={`0 0 ${total} ${height}`} role="group" aria-label={widget.title}>
          <g transform={`translate(${marginLeft} ${marginTop})`}>
          <g className="sankey__flows">
            {layout.flows.map((f) => (
              <g key={f.key} className="sankey__flow" role="button" tabIndex={0} aria-label={`${labels.fromTo.replace('{source}', name(f.source)).replace('{target}', name(f.target))}: ${formatValue(f.paths.reduce((s, p) => s + p.value, 0))} ${widget.unit}`} onClick={() => onFlowActivate(f)} onKeyDown={keyActivate(() => onFlowActivate(f))}>
                {f.paths.map((p) => (
                  <path
                    key={p.index}
                    d={p.d}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={p.width}
                    shapeRendering="geometricPrecision"
                    onMouseMove={(e) => showTip(e, [`${name(f.source)} → ${name(f.target)}`, `${p.fuel === 'losses' ? '' : `${fuelName(p.fuel)}: `}${formatValue(p.value)} ${widget.unit}`])}
                    onMouseLeave={() => setTip(null)}
                  />
                ))}
              </g>
            ))}
          </g>
          <g className="sankey__nodes">
            {layout.nodes.map((n) => (
              <g key={n.code} className="sankey__node" role="button" tabIndex={0} aria-label={`${name(n.code)}: ${formatValue(n.value)} ${widget.unit}`} onClick={() => onNodeActivate(n)} onKeyDown={keyActivate(() => onNodeActivate(n))}>
                <text fontSize={n.fontSize} fontFamily="Arial, sans-serif" className="sankey__label" pointerEvents="none">
                  {n.labelLines.map((l, i) => (
                    <tspan key={i} x={l.x} y={l.y}>
                      {l.text}
                    </tspan>
                  ))}
                  <tspan x={n.valueLabel.x} y={n.valueLabel.y}>
                    {n.valueLabel.text}
                  </tspan>
                </text>
                <path d={n.path} fill="#000" className="sankey__shape" onMouseMove={(e) => showTip(e, [name(n.code), `${formatValue(n.value)} ${widget.unit}`])} onMouseLeave={() => setTip(null)} />
                {n.hit && <path d={n.hit} fill="#000" opacity={0} onMouseMove={(e) => showTip(e, [name(n.code), `${formatValue(n.value)} ${widget.unit}`])} onMouseLeave={() => setTip(null)} />}
              </g>
            ))}
          </g>
          </g>
        </svg>
        {tip && (
          <div className="sankey__tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
            {tip.lines.map((l, i) => (
              <div key={i} className={i === 0 ? 'sankey__tip-title' : undefined}>
                {l}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="sankey__timeline">
        <button type="button" className="sankey__play" onClick={() => setPlaying((p) => !p)} aria-pressed={playing} aria-label={playing ? labels.pause : labels.play}>
          {playing ? '❚❚' : '▶'}
        </button>
        <label className="sankey__range" htmlFor={`${idPrefix}-year`}>
          <span className="sankey__sr">{labels.year}</span>
          <input id={`${idPrefix}-year`} type="range" min={0} max={widget.years.length - 1} value={Math.max(0, widget.years.indexOf(year))} onChange={(e) => setYear(widget.years[Number(e.target.value)])} />
        </label>
        <output className="sankey__year" aria-live="polite">
          {year}
        </output>
      </div>

      {used.length > 0 && (
        <ul className="sankey__legend" aria-label={labels.legend}>
          {used.map((f) => (
            <li key={f}>
              <span className="sankey__swatch" style={{ background: colorOf(f) }} aria-hidden="true" />
              {fuelName(f)}
            </li>
          ))}
        </ul>
      )}

      {detail && selection && (
        <div className="sankey__detail" role="region" aria-label={labels.details}>
          <div className="sankey__detail-head">
            <div>
              <h4>{detail.title}</h4>
              <p>{detail.text}</p>
            </div>
            <div className="sankey__detail-actions">
              {toggle && (
                <button type="button" className="ecl-button ecl-button--secondary" onClick={() => setDisaggregation((d) => ({ ...d, [toggle]: !d[toggle] }))}>
                  {disaggregation[toggle] ? labels.collapse : labels.open}
                </button>
              )}
              <button type="button" className="ecl-button ecl-button--ghost" onClick={() => setSelection(null)}>
                {labels.close}
              </button>
            </div>
          </div>
          <div className="sankey__detail-charts">{detail.widgets.map((w, i) => <div key={i}>{renderChart(w)}</div>)}</div>
        </div>
      )}
    </section>
  )
}

/** The numbers behind a node or flow: over the years and by product. */
function buildDetail(
  sel: { kind: 'node' | 'flow'; code: string; flowCode: string; source?: string; target?: string },
  model: ReturnType<typeof buildModel>,
  widget: SankeyWidgetSpec,
  name: (code: string) => string,
  fuelName: (code: string) => string,
  format: (v: number) => string,
  year: string,
): { title: string; text: string; widgets: WidgetSpec[] } {
  const title = sel.kind === 'flow' && sel.source && sel.target ? `${name(sel.source)} → ${name(sel.target)}` : name(sel.code)
  const at = (y: string) => model.flows(y).get(sel.flowCode)
  const nowFlow = at(year)
  const text = `${widget.geoName}, ${year}: ${format(nowFlow?.value ?? 0)} ${widget.unit}`
  const years = model.years
  const widgets: WidgetSpec[] = []
  const series =
    model.fuels.length > 1
      ? model.fuels.map((f, i) => ({ name: fuelName(f), data: years.map((y) => Math.round(at(y)?.values[i] ?? 0)) }))
      : [{ name: name(sel.code), data: years.map((y) => Math.round(at(y)?.value ?? 0)) }]
  if (series.every((s) => s.data.every((v) => v === 0))) return { title, text, widgets }
  widgets.push({
    type: model.fuels.length > 1 ? 'area' : 'line',
    title: `${title}`,
    subtitle: `${widget.geoName} · ${widget.unit}`,
    categories: years,
    series,
    ...(model.fuels.length > 1 ? { stacked: true as const } : {}),
    unit: widget.unit,
    size: 'half',
    highlight: year,
  } as WidgetSpec)
  if (model.fuels.length > 1 && nowFlow) {
    const slices = nowFlow.fuels.map((f, i) => ({ name: fuelName(f), y: Math.max(0, nowFlow.values[i]) })).filter((s) => s.y > 0.5)
    if (slices.length > 1) widgets.push({ type: 'pie', title: `${title} · ${year}`, subtitle: widget.geoName, slices, unit: widget.unit, size: 'half' })
  }
  return { title, text, widgets }
}
