import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { WidgetSpec } from '../types'
import labelsJson from './labels.json'
import { fetchEurostatData } from '../../data/eurostat'
import type { Plan } from '../types'
import { layoutBipartite } from './bipartite'
import { DEFAULT_DISAGGREGATION, layoutSankey, type Disaggregation, type DrawnFlow, type DrawnNode } from './layout'
import { EU_MEMBERS, NODE_TOGGLE, allOpen, nodesOf, toggleDisaggregation } from './state'
import { download, flowsCsv, nodesCsv, svgMarkup, svgToPng } from './export'
import { BalanceTable, FLOW_FORMULAS, FUEL_BACKGROUND, FUEL_COLORS, FUEL_TABLE, balanceLinesFor, buildModel, displayedFuels, nodeOfFlow, parentOfFlow, rowsByGeo, type FlowData } from './model'
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
  zoom: string
  zoomIn: string
  zoomOut: string
  reset: string
  expandAll: string
  collapseAll: string
  highlightAll: string
  unhighlight: string
  breakDown: string
  flowDetails: string
  download: string
  hhHint: string
  scopeAll: string
  scopeHouseholds: string
  compareLegend: string
  changeVs: string
  exportPng: string
  exportSvg: string
  exportCsv: string
  fullscreen: string
  exitFullscreen: string
  tableShow: string
  tableHide: string
  tableCaption: string
  colSource: string
  colTarget: string
  colProduct: string
  colValue: string
  shareOf: string
  versusPrev: string
  countriesTitle: string
  countriesLoading: string
  events: string
  event2009: string
  event2020: string
  event2022: string
}

/** Years people remember in energy: markers under the timeline. */
const EVENT_YEARS: [string, 'event2009' | 'event2020' | 'event2022'][] = [
  ['2009', 'event2009'],
  ['2020', 'event2020'],
  ['2022', 'event2022'],
]
/** The balance lines behind every flow (real lines of nrg_bal_c: the operands that are not flows themselves). */
const ALL_LINES = [...new Set(Object.values(FLOW_FORMULAS).flatMap((f) => [f.operand1, f.operand2, f.operand3, f.operand4].flatMap((o) => o ?? [])))].filter((n) => !(n in FLOW_FORMULAS))

const LABELS = labelsJson as Record<string, Record<string, string>>

/** The flow a node stands for (its size is that flow's), for the numbers behind it. */
const NODE_FLOW: Record<string, string> = {
  N2_1: 'N2_1',
  N2_2: 'N2_2',
  N3: 'F3',
  N6_1_1: 'F6_1_1',
  N6_1_2: 'F6_1_2',
  N6_1_1_1: 'F6_1_1_1',
  N6_1_1_2: 'F6_1_1_2',
  N6_1_1_3: 'F6_1_1_3',
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

/** The picture's own width (a drawing scaled to fit its box), and how much wider each opened node makes it (ENSANKEY's crop widths). */
const BASE_WIDTH = 1200
function cropOf(d: Disaggregation): number {
  let width = 0.98
  if (d.transformation && d.afterTransformation) width += 0.3
  if (d.finalConsumption || d.energyBranch) width += 0.3
  if (d.energyConsumption || d.nonEnergyConsumption) width += 0.15
  if (d.industry || d.transport || d.otherSectors) width += 0.3
  return width / 0.98
}

const ICONS: Record<string, string> = {
  details: 'M12 2 2 7l10 5 10-5-10-5zm0 12.5L4.5 10.7 2 12l10 5 10-5-2.5-1.3L12 14.5zm0 5L4.5 15.7 2 17l10 5 10-5-2.5-1.3L12 19.5z',
  expand: 'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z',
  collapse: 'M8 2h2v6H4V6h4V2zm6 0h2v4h4v2h-6V2zM4 16h6v6H8v-4H4v-2zm10 0h6v2h-4v4h-2v-6z',
  download: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
  fullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  exitFullscreen: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z',
  table: 'M3 3h18v18H3V3zm2 2v4h6V5H5zm8 0v4h6V5h-6zM5 11v3h6v-3H5zm8 0v3h6v-3h-6zM5 16v3h6v-3H5zm8 0v3h6v-3h-6z',
  zoomIn: 'M11 6h2v5h5v2h-5v5h-2v-5H6v-2h5V6z',
  zoomOut: 'M6 11h12v2H6z',
  home: 'M12 3 2 12h3v8h5v-6h4v6h5v-8h3L12 3z',
  reset: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
}

/** An icon-only button with its name as a tooltip (and as its accessible name). */
function IconButton({ icon, label, pressed, disabled, onClick, className = '' }: { icon: string; label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`sankey__icon${pressed ? ' is-on' : ''} ${className}`} aria-label={label} data-tip={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path d={ICONS[icon]} fill="currentColor" />
      </svg>
    </button>
  )
}

let ruler: CanvasRenderingContext2D | null = null
function measure(text: string, fontSize: number): number {
  if (!ruler && typeof document !== 'undefined') ruler = document.createElement('canvas').getContext('2d')
  if (!ruler) return text.length * fontSize * 0.55
  ruler.font = `${fontSize}px Arial, sans-serif`
  return ruler.measureText(text).width
}

export function SankeyWidget({ widget, plan, labels, renderChart, onPlan, onYear }: { widget: SankeyWidgetSpec; plan: Plan; labels: SankeyLabels; renderChart: (w: WidgetSpec) => ReactNode; onPlan: (plan: Plan, label: string) => void; onYear: (year: string) => void }) {
  const lang = widget.lang
  const names = LABELS[lang] ?? LABELS.en
  const name = (code: string) => names[code] ?? LABELS.en[code] ?? code
  const factor = widget.factor ?? 1
  const nf = useMemo(() => new Intl.NumberFormat(lang, { maximumFractionDigits: (widget.factor ?? 1) < 1 ? 1 : 0 }), [lang, widget.factor])
  // The table is in ktoe; what is shown is in the unit chosen.
  const formatValue = (v: number) => nf.format(v * factor).replace(/\s/g, '\u2009')

  const table = useMemo(() => new BalanceTable(widget.years, widget.table), [widget.years, widget.table])
  // Products can be picked out (highlighted) in either view: the flows are then drawn by product, the others grey.
  const [highlight, setHighlight] = useState<string[]>([])
  const parts = widget.byFuel || highlight.length > 0
  const model = useMemo(() => buildModel(table, widget.fuel, parts), [table, widget.fuel, parts])

  // The year belongs to the dashboard (its figures and charts follow it): the timeline only asks to change it.
  const year = widget.year
  const setYear = onYear
  const disaggregation: Disaggregation = { ...DEFAULT_DISAGGREGATION, ...widget.disaggregation }
  const [playing, setPlaying] = useState(false)
  const [selection, setSelection] = useState<{ kind: 'node' | 'flow'; code: string; flowCode: string; source?: string; target?: string } | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const [isFull, setIsFull] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<number | null>(null)
  useEffect(() => {
    const on = () => setIsFull(document.fullscreenElement === sectionRef.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  // The picture has a size of its own and is scaled to fit its box (no scrolling), as the original squeezes its
  // drawing into the window. A wide view (nodes opened) is as much wider as the original makes it.
  const box = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drawWidth = Math.round(BASE_WIDTH * 0.76 * cropOf(disaggregation))
  // The original's proportion: its drawing is about 2:1 (its height follows the window, its width the screen), and an opened view is wider, not taller.
  const drawHeight = Math.round(BASE_WIDTH * 0.76 * 0.46)
  // What is drawn decides the frame: the picture is fitted to its contents, however many nodes are open.
  const content = useRef<SVGGElement>(null)
  const [bounds, setBounds] = useState({ x: 0, y: 0, w: drawWidth, h: drawHeight })

  // Zoom at the cursor (wheel or the buttons), drag to move, and a button to go back to the whole picture.
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const moved = useRef(false)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const clampView = (k: number, x: number, y: number) => {
    const lo = (a: number, b: number) => Math.min(a, b)
    const hi = (a: number, b: number) => Math.max(a, b)
    return {
      k,
      x: Math.min(hi(bounds.x * (1 - k), (bounds.x + bounds.w) * (1 - k)), Math.max(lo(bounds.x * (1 - k), (bounds.x + bounds.w) * (1 - k)), x)),
      y: Math.min(hi(bounds.y * (1 - k), (bounds.y + bounds.h) * (1 - k)), Math.max(lo(bounds.y * (1 - k), (bounds.y + bounds.h) * (1 - k)), y)),
    }
  }
  const zoomAt = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const k = Math.min(10, Math.max(1, v.k * factor))
      return clampView(k, cx - ((cx - v.x) * k) / v.k, cy - ((cy - v.y) * k) / v.k)
    })
  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    return r ? { x: bounds.x + ((clientX - r.left) * bounds.w) / r.width, y: bounds.y + ((clientY - r.top) * bounds.h) / r.height } : { x: 0, y: 0 }
  }
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = toSvg(e.clientX, e.clientY)
      zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds])
  const resetView = () => setView({ k: 1, x: 0, y: 0 })

  // A new diagram (another country, product or year chosen in the toolbar) starts from what it says.
  const [shown, setShown] = useState(widget)
  if (shown !== widget) {
    setShown(widget)
    // Only the year changed (the timeline or the toolbar): the view, selection and highlight stay as they are.
    const sameFrame = shown.geo === widget.geo && shown.fuel === widget.fuel && shown.byFuel === widget.byFuel && shown.unit === widget.unit && JSON.stringify(shown.disaggregation) === JSON.stringify(widget.disaggregation) && shown.compare?.label === widget.compare?.label
    if (!sameFrame) {
      setView({ k: 1, x: 0, y: 0 })
      setSelection(null)
      setHighlight([])
    }
  }

  // Playing the years: one every second and a bit, from where it is to the last.
  useEffect(() => {
    if (!playing) return
    const i = widget.years.indexOf(year)
    const t = window.setTimeout(() => {
      if (i >= widget.years.length - 1) setPlaying(false)
      else setYear(widget.years[i + 1])
    }, 900)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, year, widget.years])

  const colorFor = (fuel: string) => (highlight.length > 0 ? (highlight.includes(fuel) ? (FUEL_COLORS[fuel] ?? FUEL_BACKGROUND) : FUEL_BACKGROUND) : widget.byFuel ? (FUEL_COLORS[fuel] ?? FUEL_BACKGROUND) : FUEL_COLORS.TOTAL)
  const flows = useMemo(() => {
    const raw = model.flows(year)
    if (!parts) return raw
    const out = new Map<string, FlowData>()
    for (const [code, f] of raw) out.set(code, { ...f, colors: f.fuels.map((fu, i) => (fu === '' ? f.colors[i] : colorFor(fu))) })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, year, parts, highlight, widget.byFuel])
  const scope = widget.scope
  const scopeValue = (left: string, right: string) => scope?.values[`${left}|${right}`]?.[widget.years.indexOf(year)] ?? 0
  const layout = useMemo(
    () =>
      scope
        ? layoutBipartite({ width: drawWidth, height: drawHeight, left: scope.left.map((code) => ({ code, color: colorFor(code) })), right: scope.right.map((code) => ({ code })), values: scopeValue, colorOf: colorFor, name, format: formatValue, unit: widget.unit, measure })
        : layoutSankey({ flows, width: drawWidth, height: drawHeight, scaleMax: model.scaleMax, disaggregation, transformationShift: disaggregation.transformation ? 0.3 : 0, name, format: formatValue, unit: widget.unit, measure }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flows, drawWidth, drawHeight, model.scaleMax, widget.disaggregation, widget.unit, lang, scope, year, highlight],
  )

  // What the picture is compared with, drawn behind it (earlier years: as they were; another country: its structure at this size).
  const compare = widget.compare
  const refTable = useMemo(() => (compare?.kind === 'geo' && compare.table && compare.years ? new BalanceTable(compare.years, compare.table) : table), [compare, table])
  const refModel = useMemo(() => (compare ? buildModel(refTable, widget.fuel, false) : null), [compare, refTable, widget.fuel])
  const refYear = compare?.kind === 'years' ? String(Number(year) - (compare.back ?? 1)) : year
  const refFlows = useMemo(() => {
    if (!compare || !refModel || !refTable.years.includes(refYear)) return null
    const raw = refModel.flows(refYear)
    if (compare.kind !== 'geo') return raw
    const mine = model.flows(year).get('N1')?.value ?? 0
    const theirs = raw.get('N1')?.value ?? 0
    const k = theirs > 0 ? mine / theirs : 0
    const out = new Map<string, FlowData>()
    for (const [code, f] of raw) out.set(code, { ...f, values: f.values.map((v) => v * k), value: f.value * k })
    return out
  }, [compare, refModel, refTable, refYear, model, year])
  const refLayout = useMemo(
    () => (refFlows ? layoutSankey({ flows: refFlows, width: drawWidth, height: drawHeight, scaleMax: compare?.kind === 'years' ? Math.max(model.scaleMax, refModel?.scaleMax ?? 0) : model.scaleMax, disaggregation, transformationShift: disaggregation.transformation ? 0.3 : 0, name, format: formatValue, unit: widget.unit, measure }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refFlows, drawWidth, drawHeight, model.scaleMax, refModel, widget.disaggregation, widget.unit, lang],
  )
  const refNode = useMemo(() => new Map((refLayout?.nodes ?? []).map((n) => [n.code, n.value])), [refLayout])
  const refLabel = compare ? (compare.kind === 'years' ? refYear : compare.label) : ''
  const changeOf = (now: number, code: string) => {
    const before = refNode.get(code)
    if (before == null || before <= 0) return ''
    const pct = (100 * (now - before)) / before
    return `${pct >= 0 ? '+' : ''}${new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(pct)} %`
  }

  useLayoutEffect(() => {
    const g = content.current
    if (!g) return
    const b = g.getBBox()
    const pad = 14
    setBounds((old) => {
      const next = { x: Math.floor(b.x - pad), y: Math.floor(b.y - pad), w: Math.ceil(b.width + 2 * pad), h: Math.ceil(b.height + 2 * pad) }
      return old.x === next.x && old.y === next.y && old.w === next.w && old.h === next.h ? old : next
    })
  }, [layout])

  const fuelName = (code: string) => (code === 'losses' ? name('losses') : name(code))
  const idPrefix = useId()
  const allExpanded = nodesOf(disaggregation) === nodesOf(allOpen())
  const fileBase = `energy-flow-${widget.geo}-${year}${widget.fuel === 'TOTAL' ? '' : `-${widget.fuel}`}`

  const onNodeActivate = (n: DrawnNode) => setSelection((prev) => (prev?.kind === 'node' && prev.code === n.code ? null : { kind: 'node', code: n.code, flowCode: NODE_FLOW[n.code] ?? n.code }))
  const onFlowActivate = (f: DrawnFlow) => setSelection((prev) => (prev?.kind === 'flow' && prev.code === f.code && prev.source === f.source && prev.target === f.target ? null : { kind: 'flow', code: f.code, flowCode: f.code, source: f.source, target: f.target }))
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
  const legendFuels = scope ? scope.left : displayedFuels(widget.fuel, true).filter((f) => f !== 'TOTAL')

  // The selection across the countries of the EU, in the same year (fetched when asked for).
  const [countries, setCountries] = useState<{ key: string; widget: WidgetSpec | null } | null>(null)
  const parentCode = selection && !scope ? parentOfFlow(selection.flowCode) : null
  const countryKey = selection && parentCode ? `${selection.flowCode}|${year}|${widget.fuel}|${widget.unit}|${widget.lang}` : ''
  useEffect(() => {
    if (!selection || !parentCode || !countryKey) return
    const ctrl = new AbortController()
    const lines = balanceLinesFor([selection.flowCode, parentCode], ALL_LINES)
    const leaves = [...new Set(Object.keys(widget.table).map((k) => k.split('|')[1]))]
    const title = fill(labels.countriesTitle, { flow: selection.kind === 'flow' && selection.source && selection.target ? `${name(selection.source)} → ${name(selection.target)}` : name(selection.code), parent: name(nodeOfFlow(parentCode)) })
    fetchEurostatData('nrg_bal_c', { filters: { geo: EU_MEMBERS, unit: 'KTOE', nrg_bal: lines, siec: leaves }, sinceTimePeriod: year, untilTimePeriod: year, lang: widget.lang, signal: ctrl.signal })
      .then((result) => {
        const rows: { geo: string; pct: number }[] = []
        for (const [geo, g] of Object.entries(rowsByGeo(result))) {
          const f = buildModel(new BalanceTable(g.years, g.rows), widget.fuel, false).flows(year)
          const part = f.get(selection.flowCode)?.value ?? 0
          const whole = f.get(parentCode)?.value ?? 0
          if (whole > 0) rows.push({ geo, pct: Math.round((1000 * part) / whole) / 10 })
        }
        rows.sort((a, b) => b.pct - a.pct)
        const cname = (g: string) => (names[`geo:${g}`] ?? g).replace(/\s*\(.*?\)\s*$/, '')
        const mine = rows.find((r) => r.geo === widget.geo)
        setCountries({
          key: countryKey,
          widget: rows.length > 3 ? ({ type: 'bar', title, subtitle: `${year} · %`, categories: rows.map((r) => cname(r.geo)), series: [{ name: name(nodeOfFlow(selection.flowCode)), data: rows.map((r) => r.pct) }], unit: '%', horizontal: false, size: 'full', ...(mine ? { reference: { value: mine.pct, label: widget.geoName } } : {}) } as WidgetSpec) : null,
        })
      })
      .catch(() => setCountries({ key: countryKey, widget: null }))
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryKey])

  const detail = selection ? (scope ? buildScopeDetail(selection, widget, scope, name, formatValue, year, labels) : buildDetail(selection, model, widget, name, fuelName, formatValue, year, labels, refNode, refLabel)) : null
  const toggle = selection && !scope ? NODE_TOGGLE[selection.code] : undefined

  return (
    <section ref={sectionRef} className={`sankey${isFull ? ' sankey--full' : ''}`} aria-label={widget.title} onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setSelection(null)
          setMenuOpen(false)
        }
      }}>
      <div className="sankey__head">
        <h3 className="sankey__title">{widget.title}</h3>
        {widget.subtitle && <p className="sankey__subtitle">{widget.subtitle}</p>}
        <p className="sankey__hint">{scope ? labels.hhHint : labels.hint}</p>
      </div>
      <div className="sankey__actions" role="toolbar" aria-label={widget.title}>
        <IconButton icon="home" label={scope ? labels.scopeAll : labels.scopeHouseholds} pressed={!!scope} onClick={() => onPlan({ ...plan, sankey: { ...plan.sankey, scope: scope ? undefined : ('households' as const) } }, scope ? labels.scopeAll : labels.scopeHouseholds)} />
        {!scope && <IconButton icon="details" label={labels.flowDetails} pressed={widget.byFuel} onClick={() => onPlan({ ...plan, sankey: { ...plan.sankey, ...(widget.byFuel ? { byFuel: undefined } : { byFuel: true as const }) } }, labels.flowDetails)} />}
        {!scope && <IconButton
          icon={allExpanded ? 'collapse' : 'expand'}
          label={allExpanded ? labels.collapseAll : labels.expandAll}
          pressed={allExpanded}
          onClick={() => onPlan({ ...plan, sankey: { ...plan.sankey, nodes: allExpanded ? undefined : nodesOf(allOpen()) } }, allExpanded ? labels.collapseAll : labels.expandAll)}
        />}
        <span className="sankey__spacer" />
        <IconButton icon="table" label={showTable ? labels.tableHide : labels.tableShow} pressed={showTable} onClick={() => setShowTable((v) => !v)} />
        <div className="sankey__menuwrap">
          <IconButton icon="download" label={labels.download} pressed={menuOpen} onClick={() => setMenuOpen((v) => !v)} />
          {menuOpen && (
            <ul className="sankey__menu" role="menu">
              <li role="none">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); if (svgRef.current) void svgToPng(svgRef.current, widget.title).then((b) => download(b, `${fileBase}.png`)) }}>
                  {labels.exportPng}
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); if (svgRef.current) download(new Blob([svgMarkup(svgRef.current, widget.title)], { type: 'image/svg+xml' }), `${fileBase}.svg`) }}>
                  {labels.exportSvg}
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); download(new Blob(['\ufeff', flowsCsv(layout.flows, name, fuelName, widget.unit, factor), '\n\n', nodesCsv(layout.nodes, name, widget.unit, factor)], { type: 'text/csv;charset=utf-8' }), `${fileBase}.csv`) }}>
                  {labels.exportCsv}
                </button>
              </li>
            </ul>
          )}
        </div>
        <IconButton icon={isFull ? 'exitFullscreen' : 'fullscreen'} label={isFull ? labels.exitFullscreen : labels.fullscreen} pressed={isFull} onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void sectionRef.current?.requestFullscreen())} />
      </div>
      <div className="sankey__box" ref={box} onMouseLeave={() => setTip(null)}>
        <div className="sankey__zoom" role="group" aria-label={labels.zoom}>
          <IconButton icon="zoomIn" label={labels.zoomIn} onClick={() => zoomAt(1.5, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2)} />
          <IconButton icon="zoomOut" label={labels.zoomOut} disabled={view.k <= 1} onClick={() => zoomAt(1 / 1.5, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2)} />
          <IconButton icon="reset" label={labels.reset} disabled={view.k <= 1 && view.x === 0 && view.y === 0} onClick={resetView} />
        </div>
        <svg
          ref={svgRef}
          className={`sankey__svg${view.k > 1 ? ' sankey__svg--zoomed' : ''}`}
          viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
          role="group"
          aria-label={widget.title}
          onPointerDown={(e) => {
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            pinch.current = null
            const p = toSvg(e.clientX, e.clientY)
            drag.current = { px: p.x, py: p.y, x: view.x, y: view.y }
            moved.current = false
          }}
          onPointerMove={(e) => {
            // Two fingers: pinch to zoom around their middle.
            if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (pointers.current.size === 2) {
              const [a, b] = [...pointers.current.values()]
              const dist = Math.hypot(a.x - b.x, a.y - b.y)
              if (pinch.current != null && dist > 0) {
                const c = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2)
                zoomAt(dist / pinch.current, c.x, c.y)
                moved.current = true
              }
              pinch.current = dist
              return
            }
            const d = drag.current
            if (!d || view.k <= 1) return
            const p = toSvg(e.clientX, e.clientY)
            if (Math.abs(p.x - d.px) + Math.abs(p.y - d.py) > 4) moved.current = true
            if (moved.current) setView((v) => clampView(v.k, d.x + p.x - d.px, d.y + p.y - d.py))
          }}
          onPointerUp={(e) => {
            pointers.current.delete(e.pointerId)
            pinch.current = null
            drag.current = null
          }}
          onPointerCancel={(e) => {
            pointers.current.delete(e.pointerId)
            pinch.current = null
            drag.current = null
          }}
          onPointerLeave={(e) => {
            pointers.current.delete(e.pointerId)
            drag.current = null
          }}
          onKeyDown={(e) => {
            if (e.key === '+' || e.key === '=') zoomAt(1.5, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2)
            else if (e.key === '-') zoomAt(1 / 1.5, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2)
            else if (e.key === '0') resetView()
          }}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g ref={content}>
          {refLayout && (
            <g className="sankey__ref" aria-hidden="true" pointerEvents="none">
              {refLayout.flows.map((f) => f.paths.map((p) => <path key={`${f.key}-${p.index}`} d={p.d} fill="none" stroke="#1d4ed8" strokeOpacity={0.3} strokeWidth={p.width + 5} strokeLinecap="butt" />))}
            </g>
          )}
          <g className="sankey__flows">
            {layout.flows.map((f) => (
              <g key={f.key} className="sankey__flow" role="button" tabIndex={0} aria-label={`${labels.fromTo.replace('{source}', name(f.source)).replace('{target}', name(f.target))}: ${formatValue(f.paths.reduce((s, p) => s + p.value, 0))} ${widget.unit}`} onClick={() => {
                  if (!moved.current) onFlowActivate(f)
                }} onKeyDown={keyActivate(() => onFlowActivate(f))}>
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
                {/* a wider, invisible line to hit: thin flows are hard to click, above all with a finger */}
                {f.paths.filter((p) => p.width < 14).map((p) => (
                  <path key={`hit-${p.index}`} d={p.d} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke" onMouseMove={(e) => showTip(e, [`${name(f.source)} → ${name(f.target)}`, `${formatValue(p.value)} ${widget.unit}`])} onMouseLeave={() => setTip(null)} />
                ))}
              </g>
            ))}
          </g>
          <g className="sankey__nodes">
            {layout.nodes.map((n) => (
              <g key={n.code} className="sankey__node" role="button" tabIndex={0} aria-label={`${name(n.code)}: ${formatValue(n.value)} ${widget.unit}`} onClick={() => {
                  if (!moved.current) onNodeActivate(n)
                }} onKeyDown={keyActivate(() => onNodeActivate(n))}>
                <text fontSize={n.fontSize} fontFamily="Arial, sans-serif" className="sankey__label" pointerEvents="none">
                  {n.labelLines.map((l, i) => (
                    <tspan key={i} x={l.x} y={l.y}>
                      {l.text}
                    </tspan>
                  ))}
                  <tspan x={n.valueLabel.x} y={n.valueLabel.y}>
                    {n.valueLabel.text}
                    {refLayout && changeOf(n.value, n.code) && (
                      <tspan dx={5} fill={n.value >= (refNode.get(n.code) ?? 0) ? '#1b7f3b' : '#b3261e'} fontWeight={700}>
                        {changeOf(n.value, n.code)}
                      </tspan>
                    )}
                  </tspan>
                </text>
                <path d={n.path} fill="#000" className="sankey__shape" onMouseMove={(e) => showTip(e, [name(n.code), `${formatValue(n.value)} ${widget.unit}`, ...(refLayout && changeOf(n.value, n.code) ? [fill(labels.changeVs, { delta: changeOf(n.value, n.code), ref: refLabel })] : [])])} onMouseLeave={() => setTip(null)} />
                {n.hit && <path d={n.hit} fill="#000" opacity={0} onMouseMove={(e) => showTip(e, [name(n.code), `${formatValue(n.value)} ${widget.unit}`, ...(refLayout && changeOf(n.value, n.code) ? [fill(labels.changeVs, { delta: changeOf(n.value, n.code), ref: refLabel })] : [])])} onMouseLeave={() => setTip(null)} />}
              </g>
            ))}
          </g>
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

      <div className="sankey__events" role="group" aria-label={labels.events}>
        {EVENT_YEARS.filter(([y]) => widget.years.includes(y)).map(([y, key]) => (
          <button key={y} type="button" className={`sankey__event${year === y ? ' is-on' : ''}`} aria-pressed={year === y} onClick={() => setYear(y)}>
            <strong>{y}</strong> {labels[key]}
          </button>
        ))}
        {compare && refLayout && <span className="sankey__refnote">{fill(labels.compareLegend, { ref: refLabel })}</span>}
      </div>

      {legendFuels.length > 1 && (
        <div className="sankey__legendbox">
          <ul className="sankey__legend" aria-label={labels.legend}>
            {legendFuels.map((f) => (
              <li key={f} className="sankey__legend-row">
                <button type="button" className={`sankey__legend-item${highlight.includes(f) ? ' is-on' : ''}`} aria-pressed={highlight.includes(f)} onClick={() => setHighlight((h) => (h.includes(f) ? h.filter((x) => x !== f) : [...h, f]))}>
                  <span className="sankey__swatch" style={{ background: colorFor(f) }} aria-hidden="true" />
                  {fuelName(f)}
                </button>
                {FUEL_TABLE[f] && (
                  <button type="button" className="sankey__breakdown" title={labels.breakDown} aria-label={`${labels.breakDown}: ${fuelName(f)}`} onClick={() => onPlan({ ...plan, sankey: { ...plan.sankey, fuel: f, byFuel: true } }, fuelName(f))}>
                    ⤵
                  </button>
                )}
              </li>
            ))}
            <li>
              <button type="button" className="sankey__legend-all" onClick={() => setHighlight((h) => (h.length === legendFuels.length ? [] : [...legendFuels]))}>
                {highlight.length === legendFuels.length ? labels.unhighlight : labels.highlightAll}
              </button>
            </li>
          </ul>
        </div>
      )}

      {showTable && (
        <div className="sankey__table-wrap">
          <table className="sankey__table">
            <caption>{`${labels.tableCaption} · ${widget.geoName} · ${year} · ${widget.unit}`}</caption>
            <thead>
              <tr>
                <th scope="col">{labels.colSource}</th>
                <th scope="col">{labels.colTarget}</th>
                <th scope="col">{labels.colProduct}</th>
                <th scope="col" className="sankey__num">{`${labels.colValue} (${widget.unit})`}</th>
              </tr>
            </thead>
            <tbody>
              {layout.flows.flatMap((f) => f.paths.map((p) => (
                <tr key={`${f.key}-${p.index}`}>
                  <td>{name(f.source)}</td>
                  <td>{name(f.target)}</td>
                  <td>{p.fuel === 'losses' ? '' : fuelName(p.fuel)}</td>
                  <td className="sankey__num">{formatValue(p.value)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}

      {detail && selection && (
        <div className="sankey__detail" role="region" aria-label={labels.details}>
          <div className="sankey__detail-head">
            <div>
              <h4>{detail.title}</h4>
              <p>{detail.text}</p>
              {detail.extra.length > 0 && <p className="sankey__detail-extra">{detail.extra.join(' · ')}</p>}
            </div>
            <div className="sankey__detail-actions">
              {/* One button: a node that can be opened is opened or closed; anything else is just closed. */}
              <button
                type="button"
                className="sankey__btn"
                onClick={() => (toggle ? onPlan({ ...plan, sankey: { ...plan.sankey, nodes: nodesOf(toggleDisaggregation(disaggregation, toggle)) } }, name(selection.code)) : setSelection(null))}
              >
                {toggle ? (disaggregation[toggle] ? labels.collapse : labels.open) : labels.close}
              </button>
            </div>
          </div>
          <div className="sankey__detail-charts">{detail.widgets.map((w, i) => <div key={i}>{renderChart(w)}</div>)}</div>
          {parentCode && (countries?.key === countryKey ? countries.widget && <div className="sankey__detail-wide">{renderChart(countries.widget)}</div> : <p className="sankey__loading">{labels.countriesLoading}</p>)}
        </div>
      )}
    </section>
  )
}

/** The numbers behind a product, a use or a flow of the households view: over the years and split. */
function buildScopeDetail(
  sel: { kind: 'node' | 'flow'; code: string; flowCode: string; source?: string; target?: string },
  widget: SankeyWidgetSpec,
  scope: NonNullable<SankeyWidgetSpec['scope']>,
  name: (code: string) => string,
  format: (v: number) => string,
  year: string,
  labels: SankeyLabels,
): { title: string; text: string; extra: string[]; widgets: WidgetSpec[] } {
  const conv = widget.factor ?? 1
  const cv = (v: number) => Math.round(v * conv * (conv < 1 ? 10 : 1)) / (conv < 1 ? 10 : 1)
  const years = widget.years
  const at = (left: string, right: string, y: string) => scope.values[`${left}|${right}`]?.[years.indexOf(y)] ?? 0
  const isFlow = sel.code.includes('|')
  const [a, b] = sel.code.split('|')
  const isLeft = scope.left.includes(sel.code)
  const title = isFlow ? `${name(a)} → ${name(b)}` : name(sel.code)
  const rightsOf = (y: string) => scope.right.map((r) => ({ r, v: scope.left.reduce((s, l) => s + at(l, r, y), 0) }))
  const total = (y: string) => scope.right.reduce((s, r) => s + scope.left.reduce((t, l) => t + at(l, r, y), 0), 0)
  const value = (y: string) => (isFlow ? at(a, b, y) : isLeft ? scope.right.reduce((s, r) => s + at(sel.code, r, y), 0) : scope.left.reduce((s, l) => s + at(l, sel.code, y), 0))
  const now = value(year)
  const pct = new Intl.NumberFormat(widget.lang, { maximumFractionDigits: 1 })
  const extra: string[] = []
  if (total(year) > 0) extra.push(fill(labels.shareOf, { pct: pct.format((100 * now) / total(year)), parent: name('HH_TOTAL').toLowerCase() }))
  const prev = String(Number(year) - 1)
  if (years.includes(prev) && value(prev) > 0) {
    const d = (100 * (now - value(prev))) / value(prev)
    extra.push(fill(labels.versusPrev, { delta: `${d >= 0 ? '+' : ''}${pct.format(d)} %`, year: prev }))
  }
  const parts = isFlow ? null : isLeft ? scope.right.map((r) => ({ code: r, get: (y: string) => at(sel.code, r, y) })) : scope.left.map((l) => ({ code: l, get: (y: string) => at(l, sel.code, y) }))
  const widgets: WidgetSpec[] = []
  if (parts) {
    const series = parts.map((p) => ({ name: name(p.code), data: years.map((y) => cv(p.get(y))) })).filter((x) => x.data.some((v) => v > 0))
    if (series.length > 1) widgets.push({ type: 'area', title, subtitle: `${widget.geoName} · ${widget.unit}`, categories: years, series, stacked: true, unit: widget.unit, size: 'half', highlight: year } as WidgetSpec)
    const slices = parts.map((p) => ({ name: name(p.code), y: Math.max(0, cv(p.get(year))) })).filter((x) => x.y > 0)
    if (slices.length > 1) widgets.push({ type: 'pie', title: `${title} · ${year}`, subtitle: widget.geoName, slices, unit: widget.unit, size: 'half' })
  } else widgets.push({ type: 'line', title, subtitle: `${widget.geoName} · ${widget.unit}`, categories: years, series: [{ name: title, data: years.map((y) => cv(value(y))) }], unit: widget.unit, size: 'half', highlight: year } as WidgetSpec)
  void rightsOf
  return { title, text: `${widget.geoName}, ${year}: ${format(now)} ${widget.unit}`, extra, widgets }
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

/** The numbers behind a node or flow: over the years and by product. */
function buildDetail(
  sel: { kind: 'node' | 'flow'; code: string; flowCode: string; source?: string; target?: string },
  model: ReturnType<typeof buildModel>,
  widget: SankeyWidgetSpec,
  name: (code: string) => string,
  fuelName: (code: string) => string,
  format: (v: number) => string,
  year: string,
  labels: SankeyLabels,
  refNode: Map<string, number>,
  refLabel: string,
): { title: string; text: string; extra: string[]; widgets: WidgetSpec[] } {
  const title = sel.kind === 'flow' && sel.source && sel.target ? `${name(sel.source)} → ${name(sel.target)}` : name(sel.code)
  const at = (y: string) => model.flows(y).get(sel.flowCode)
  const nowFlow = at(year)
  const text = `${widget.geoName}, ${year}: ${format(nowFlow?.value ?? 0)} ${widget.unit}`
  const extra: string[] = []
  const parent = parentOfFlow(sel.flowCode)
  const whole = parent ? (model.flows(year).get(parent)?.value ?? 0) : 0
  const pct = new Intl.NumberFormat(widget.lang, { maximumFractionDigits: 1 })
  if (parent && whole > 0 && nowFlow) extra.push(fill(labels.shareOf, { pct: pct.format((100 * nowFlow.value) / whole), parent: name(nodeOfFlow(parent)).toLowerCase() }))
  const prevYear = String(Number(year) - 1)
  const prev = model.years.includes(prevYear) ? at(prevYear)?.value : undefined
  if (prev != null && prev > 0 && nowFlow) {
    const d = (100 * (nowFlow.value - prev)) / prev
    extra.push(fill(labels.versusPrev, { delta: `${d >= 0 ? '+' : ''}${pct.format(d)} %`, year: prevYear }))
  }
  const before = refNode.get(sel.code) ?? refNode.get(nodeOfFlow(sel.flowCode))
  if (before != null && before > 0 && nowFlow && refLabel) {
    const d = (100 * (nowFlow.value - before)) / before
    extra.push(fill(labels.changeVs, { delta: `${d >= 0 ? '+' : ''}${pct.format(d)} %`, ref: refLabel }))
  }
  const years = model.years
  const conv = widget.factor ?? 1
  const cv = (v: number) => Math.round(v * conv * (conv < 1 ? 10 : 1)) / (conv < 1 ? 10 : 1)
  const widgets: WidgetSpec[] = []
  const series =
    model.fuels.length > 1
      ? model.fuels.map((f, i) => ({ name: fuelName(f), data: years.map((y) => cv(at(y)?.values[i] ?? 0)) }))
      : [{ name: name(sel.code), data: years.map((y) => cv(at(y)?.value ?? 0)) }]
  if (series.every((s) => s.data.every((v) => v === 0))) return { title, text, extra, widgets }
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
    const slices = nowFlow.fuels.map((f, i) => ({ name: fuelName(f), y: Math.max(0, cv(nowFlow.values[i])) })).filter((s) => s.y > 0)
    if (slices.length > 1) widgets.push({ type: 'pie', title: `${title} · ${year}`, subtitle: widget.geoName, slices, unit: widget.unit, size: 'half' })
  }
  return { title, text, extra, widgets }
}
