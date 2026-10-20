import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import estatLogo from '../../assets/estat-logo-horizontal.svg'
import { InsightsPanel } from '../../components/insights'
import type { DashboardSpec, KpiSpec, WidgetSpec } from '../types'
import { Art, flagsOf, knownArt, matchArt } from './art/registry'
import { Highlight } from './Highlight'
import { BigSpark, Ring, StarRing } from './Svg'
import './deck.css'

/**
 * A presentation made from a dashboard, as an infographic: a title slide, the summary with its numbers picked out, the key
 * figures as rings and big numbers, the targets as large rings, one slide for each chart, the insights, what the data is,
 * and the source. One slide at a time over the whole window; arrow keys, space or the buttons move, Escape closes.
 */
export interface DeckProps {
  spec: DashboardSpec
  lang: string
  slide: number
  setSlide: (n: number) => void
  onKey: (e: KeyboardEvent, last: number) => void
  onClose: () => void
  exitLabel: string
  keyLabel: string
  insightsLabel: string
  sourceLabel: string
  renderChart: (w: WidgetSpec) => ReactNode
  charts: WidgetSpec[]
}

function Tile({ k, lang, names, flags }: { k: KpiSpec; lang: string; names?: [string, string]; flags?: (string | undefined)[] }) {
  const art = knownArt([k.art])[0] ?? matchArt(k.label)
  const d = k.decimals ?? 1
  const fmt = new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })
  const asRing = k.unit === '%' && k.value >= 0 && k.value <= 100
  const DeltaIcon = k.delta === undefined || k.delta === 0 ? ArrowRight : k.delta > 0 ? ArrowUpRight : ArrowDownRight
  const good = k.delta === undefined || k.goodDirection === 'neutral' || k.delta === 0 ? 'neutral' : (k.delta > 0) === (k.goodDirection !== 'down') ? 'good' : 'bad'
  const value = (
    <span className="tile__value">
      {fmt.format(k.value)}
      {k.unit && <span className="tile__unit">{k.unit === '%' ? '' : k.unit}</span>}
      {k.unit === '%' && <span className="tile__unit">%</span>}
    </span>
  )
  const top = Math.max(k.value, k.versus?.value ?? 0, 0.0001)
  return (
    <div className="tile">
      <p className="tile__head">{k.label}</p>
      <div className="tile__panel">
        {art && (
          <span className="tile__icon">
            <Art id={art} />
          </span>
        )}
        {asRing ? (
          <Ring value={k.value} max={100} size={190} stroke={18} label={`${k.label}: ${fmt.format(k.value)} %`}>
            {value}
          </Ring>
        ) : (
          <div className="tile__big">{value}</div>
        )}
        {k.versus && (
          <div className="pair" aria-label={`${names?.[0] ?? ''} ${fmt.format(k.value)}, ${k.versus.name} ${fmt.format(k.versus.value)}`}>
            <div className="pair__col">
              {flags?.[0] && <Art id={flags[0]} />}
              <strong>{fmt.format(k.value)}</strong>
              <i className="pair__bar pair__bar--a" style={{ height: `${Math.max((k.value / top) * 90, 8)}px` }} />
              <span>{names?.[0]}</span>
            </div>
            <div className="pair__col">
              {flags?.[1] && <Art id={flags[1]} />}
              <strong>{fmt.format(k.versus.value)}</strong>
              <i className="pair__bar pair__bar--b" style={{ height: `${Math.max((k.versus.value / top) * 90, 8)}px` }} />
              <span>{k.versus.name}</span>
            </div>
          </div>
        )}
      {k.delta !== undefined && (
        <p className={`tile__delta tile__delta--${good}`}>
          <DeltaIcon size={18} aria-hidden="true" /> {new Intl.NumberFormat(lang, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(k.delta)} {k.deltaUnit ?? ''} {k.deltaLabel ?? ''}
        </p>
      )}
        {k.caption && <p className="tile__caption">{k.caption}</p>}
        {k.trend && !asRing && <BigSpark values={k.trend} />}
      </div>
    </div>
  )
}

export function Deck({ spec, lang, slide, setSlide, onKey, onClose, exitLabel, keyLabel, insightsLabel, sourceLabel, renderChart, charts }: DeckProps) {
  const kpis = spec.widgets.find((w) => w.type === 'kpis')
  // The art of the data: the flags of the places, and pictograms for what the figures measure (named by the spec, or chosen from its words).
  const p = spec.plan
  const places = flagsOf([p.filters.geo, p.renewables?.compare, p.reporting?.compare, p.oil?.compare, p.trade?.compare, p.balance?.compare, p.profile?.compare])
  const pairFlags = spec.compareNames ? places.slice(0, 2) : undefined
  const topics = knownArt(spec.art ?? []).filter((id) => !id.startsWith('flag-'))
  const derived = [...new Set([spec.title, spec.subtitle, ...(kpis?.type === 'kpis' ? kpis.items.map((k) => k.label) : [])].map((x) => matchArt(x ?? '')).filter((x): x is string => !!x))]
  const titleArt = (topics.length ? topics : derived).slice(0, 4)
  const sceneId = knownArt(spec.art ?? []).find((id) => id.startsWith('scene-')) ?? matchArt([spec.title, spec.subtitle, spec.source.title].join(' '), 'scene')
  const slides: { key: string; kind: string; node: ReactNode }[] = []
  slides.push({
    key: 'title',
    kind: 'hero',
    node: (
      <>
        {sceneId && <Art id={sceneId} className="deck__scene" />}
        <StarRing />
        <div className={`deck__title${sceneId ? ' deck__title--scene' : ''}`}>
          <p className="deck__eyebrow">
            <span className="deck__badge">
              <StarRing size={44} flat />
            </span>
            ENgenuidash · Eurostat
          </p>
          <h2>{spec.title}</h2>
          {spec.subtitle && <p className="deck__subtitle">{spec.subtitle}</p>}
          {(titleArt.length > 0 || places.length > 0) && (
            <div className="deck__art">
              {titleArt.map((id) => (
                <span key={id} className="deck__pict">
                  <Art id={id} />
                </span>
              ))}
              {places.map((id) => (
                <Art key={id} id={id} className="art-flag art-flag--big" />
              ))}
              {places.length === 1 && places[0] !== 'flag-eu' && <Art id={places[0].replace('flag-', 'shape-')} className="deck__shape" />}
            </div>
          )}
          {spec.reading && (
            <p className="deck__chips">
              {spec.reading.parts.map((p) => (
                <span key={p} className="deck__chip">
                  {p}
                </span>
              ))}
            </p>
          )}
        </div>
      </>
    ),
  })
  if (spec.summary.length) {
    slides.push({
      key: 'summary',
      kind: 'quote',
      node: (
        <blockquote className="deck__quote">
          <Sparkles size={44} aria-hidden="true" />
          <p>
            <Highlight text={spec.summary.join(' ')} />
          </p>
        </blockquote>
      ),
    })
  }
  if (kpis?.type === 'kpis' && kpis.items.length) {
    for (let i = 0; i < kpis.items.length; i += 4) {
      slides.push({
        key: `kpis-${i}`,
        kind: 'tiles',
        node: (
          <>
            <h2 className="deck__heading">{keyLabel}</h2>
            <div className="tiles">
              {kpis.items.slice(i, i + 4).map((k) => (
                <Tile key={`${k.label}-${k.caption}`} k={k} lang={lang} names={spec.compareNames} flags={pairFlags} />
              ))}
            </div>
          </>
        ),
      })
    }
  }
  // (a value against its targets is a large ring, not a chart)
  const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 })
  charts.forEach((w, i) => {
    if (w.type === 'gauge') {
      slides.push({
        key: `gauge-${i}`,
        kind: 'ring',
        node: (
          <div className="deck__ringslide">
            <div>
              <h2 className="deck__heading">{w.title}</h2>
              {w.subtitle && <p className="deck__subtitle">{w.subtitle}</p>}
              <ul className="deck__targets">
                <li>
                  <span className="dot dot--value" /> {w.label}: <strong className="deck__num">{fmt.format(w.value)}{w.unit ? ` ${w.unit}` : ''}</strong>
                </li>
                {w.targets.map((t) => (
                  <li key={`${t.value}-${t.label}`}>
                    <span className="dot dot--target" /> {t.label || fmt.format(t.value)} {w.unit ?? ''}
                  </li>
                ))}
              </ul>
            </div>
            <Ring value={w.value} max={w.max} size={380} stroke={34} targets={w.targets} label={`${w.title}: ${fmt.format(w.value)}`}>
              <span className="ring__big">{fmt.format(w.value)}</span>
              <span className="ring__sub">{w.unit}</span>
            </Ring>
          </div>
        ),
      })
    } else {
      slides.push({ key: `chart-${i}`, kind: 'chart', node: <div className="deck__chart">{renderChart(w)}</div> })
    }
  })
  if (spec.insights.length) {
    slides.push({
      key: 'insights',
      kind: 'insights',
      node: (
        <>
          <h2 className="deck__heading">{insightsLabel}</h2>
          <div className="deck__insights">
            <InsightsPanel title={insightsLabel} items={spec.insights} />
          </div>
        </>
      ),
    })
  }
  const notes = spec.notes.filter(Boolean)
  if (notes.length || spec.about) {
    slides.push({
      key: 'about',
      kind: 'about',
      node: (
        <>
          <h2 className="deck__heading">{spec.about?.title ?? ''}</h2>
          <ul className="deck__list">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            {spec.about?.rows.map((r) => (
              <li key={r.label}>
                <strong>{r.label}:</strong> {r.value}
              </li>
            ))}
          </ul>
        </>
      ),
    })
  }
  slides.push({
    key: 'source',
    kind: 'hero',
    node: (
      <>
        <Art id="scene-energy-mix" className="deck__scene" />
        <StarRing />
        <div className="deck__title deck__title--scene">
          <p className="deck__eyebrow">{sourceLabel}</p>
          <h2>
            <a href={spec.source.url} target="_blank" rel="noreferrer">
              Eurostat · {spec.source.code}
            </a>
          </h2>
          <p className="deck__subtitle">{spec.source.title}</p>
        </div>
      </>
    ),
  })
  const last = slides.length - 1
  const current = Math.min(slide, last)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e, last)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onKey, last])
  return (
    <div className={`deck deck--${slides[current].kind}`} role="dialog" aria-modal="true" aria-label={spec.title}>
      <div className="deck__bar">
        <span className="deck__count" aria-live="polite">
          {current + 1} / {slides.length}
        </span>
        <button type="button" className="deck__btn" onClick={onClose}>
          <X size={18} aria-hidden="true" /> {exitLabel}
        </button>
      </div>
      {slides[current].kind === 'hero' && <Art id="bg-wave" className="deck__bg deck__bg--wave" />}
      {(slides[current].kind === 'quote' || slides[current].kind === 'ring') && <Art id="bg-blob" className="deck__bg deck__bg--blob" />}
      <div className="deck__slide" key={slides[current].key}>
        {slides[current].kind === 'chart' && <p className="deck__band">{spec.title}</p>}
        {slides[current].node}
      </div>
      <div className="deck__foot">
        <img src={estatLogo} alt="Eurostat" />
        <span>
          {sourceLabel}: Eurostat ({spec.source.code})
        </span>
      </div>
      <div className="deck__nav">
        <button type="button" className="deck__btn deck__btn--round" onClick={() => setSlide(Math.max(current - 1, 0))} disabled={current === 0} aria-label="←">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="deck__dots" role="group" aria-label={`${current + 1} / ${slides.length}`}>
          {slides.map((s, i) => (
            <button key={s.key} type="button" className={`deck__dot${i === current ? ' deck__dot--on' : ''}`} aria-label={String(i + 1)} aria-current={i === current} onClick={() => setSlide(i)} />
          ))}
        </div>
        <button type="button" className="deck__btn deck__btn--round" onClick={() => setSlide(Math.min(current + 1, last))} disabled={current === last} aria-label="→">
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
