import { Printer, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import estatLogo from '../../assets/estat-logo-horizontal.svg'
import { InsightsPanel } from '../../components/insights'
import type { DashboardSpec, KpiSpec, WidgetSpec } from '../types'
import { Art, flagsOf, knownArt, matchArt } from './art/registry'
import { Highlight } from './Highlight'
import { Ring, StarRing } from './Svg'
import './poster.css'

/**
 * The infographic: the dashboard as one tall poster to read, print or save as PDF. A header with the topic's scene, the
 * summary as a big sentence, the key figures as rings with their pictograms, each chart on a card, the insights as
 * "did you know" bubbles, a closing statement and the source. Drawn from the same data as the dashboard and the
 * presentation; nothing here is typed in.
 */
export interface PosterProps {
  spec: DashboardSpec
  lang: string
  renderChart: (w: WidgetSpec) => ReactNode
  charts: WidgetSpec[]
  onClose: () => void
  printLabel: string
  keyLabel: string
  insightsLabel: string
  sourceLabel: string
}

/** A row of little houses, trees and a pylon: the ground under the key figures. Drawn here, in the palette. */
function Skyline() {
  const house = (x: number, w: number, h: number, c: string) => (
    <g key={x}>
      <rect x={x} y={60 - h} width={w} height={h} fill={c} />
      <polygon points={`${x - 3},${60 - h} ${x + w / 2},${60 - h - 14} ${x + w + 3},${60 - h}`} fill="#0b2a7a" />
      <rect x={x + w / 2 - 4} y={60 - 16} width="8" height="16" fill="#ffd617" />
      <rect x={x + 5} y={60 - h + 8} width="7" height="7" fill="#ffd617" opacity="0.9" />
    </g>
  )
  return (
    <svg className="poster__skyline" viewBox="0 0 1000 70" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <rect y="60" width="1000" height="10" fill="#0b2a7a" />
      {[40, 150, 270, 390, 520, 640, 770, 880].map((x, i) => house(x, 52 + (i % 3) * 10, 30 + ((i * 7) % 4) * 6, i % 2 ? '#1b5ae8' : '#4f7fe8'))}
      {[120, 345, 600, 835].map((x) => (
        <g key={x}>
          <rect x={x} y="40" width="3" height="20" fill="#0b2a7a" />
          <ellipse cx={x + 1.5} cy="36" rx="8" ry="12" fill="#2a8fa0" />
        </g>
      ))}
      <path d="M952 60l8-44 8 44M944 28h32M948 42h24" stroke="#ffd617" strokeWidth="2" fill="none" />
    </svg>
  )
}

function Figure({ k, lang, names, flags }: { k: KpiSpec; lang: string; names?: [string, string]; flags?: (string | undefined)[] }) {
  const d = k.decimals ?? 1
  const fmt = new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })
  const ring = k.unit === '%' && k.value >= 0 && k.value <= 100
  const art = knownArt([k.art])[0] ?? matchArt(k.label)
  const value = (
    <span className="fig__value">
      {fmt.format(k.value)}
      <span className="fig__unit">{k.unit === '%' ? '%' : ` ${k.unit ?? ''}`}</span>
    </span>
  )
  return (
    <div className="fig">
      <p className="fig__label">{k.label}</p>
      {ring ? (
        <Ring value={k.value} max={100} size={190} stroke={20} label={`${k.label}: ${fmt.format(k.value)} %`}>
          {art ? (
            <span className="fig__icon">
              <Art id={art} />
            </span>
          ) : null}
        </Ring>
      ) : (
        <div className="fig__disc">{art && <span className="fig__icon fig__icon--big"><Art id={art} /></span>}</div>
      )}
      {value}
      {k.versus && (
        <p className="fig__versus">
          {flags?.[0] && <Art id={flags[0]} />}
          <span>{names?.[0]}</span> {fmt.format(k.value)}
          <i />
          {flags?.[1] && <Art id={flags[1]} />}
          <span>{k.versus.name}</span> {fmt.format(k.versus.value)}
        </p>
      )}
      {k.delta !== undefined && (
        <p className="fig__delta">
          {new Intl.NumberFormat(lang, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(k.delta)} {k.deltaUnit ?? ''} {k.deltaLabel ?? ''}
        </p>
      )}
    </div>
  )
}

export function Poster({ spec, lang, renderChart, charts, onClose, printLabel, keyLabel, insightsLabel, sourceLabel }: PosterProps) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  const kpis = spec.widgets.find((w) => w.type === 'kpis')
  const p = spec.plan
  const places = flagsOf([p.filters.geo, p.renewables?.compare, p.reporting?.compare, p.oil?.compare, p.trade?.compare, p.balance?.compare, p.profile?.compare])
  const pairFlags = spec.compareNames ? places.slice(0, 2) : undefined
  const scene = knownArt(spec.art ?? []).find((id) => id.startsWith('scene-')) ?? matchArt([spec.title, spec.subtitle, spec.source.title].join(' '), 'scene')
  const t = spec.reading?.tools
  const lines = t?.posterLines ?? ['', '', '']
  return (
    <div className="posterview" role="dialog" aria-modal="true" aria-label={spec.title}>
      <div className="posterview__bar">
        <button type="button" className="posterview__btn" onClick={() => window.print()}>
          <Printer size={18} aria-hidden="true" /> {printLabel}
        </button>
        <button type="button" className="posterview__btn" onClick={onClose}>
          <X size={18} aria-hidden="true" /> {t?.close}
        </button>
      </div>
      <article className="poster">
        <header className="poster__head">
          <div className="poster__headtext">
            <p className="poster__eyebrow">ENgenuidash · Eurostat</p>
            <h1>{spec.title}</h1>
            {spec.subtitle && <p className="poster__sub">{spec.subtitle}</p>}
            <p className="poster__chips">
              {spec.reading?.parts.map((x) => (
                <span key={x} className="poster__chip">
                  {x}
                </span>
              ))}
              {places.map((id) => (
                <Art key={id} id={id} className="art-flag art-flag--big" />
              ))}
            </p>
          </div>
          {scene && <Art id={scene} className="poster__scene" />}
          <StarRing size={300} />
        </header>

        {spec.summary.length > 0 && (
          <p className="poster__lead">
            <Highlight text={spec.summary.join(' ')} />
          </p>
        )}

        {kpis?.type === 'kpis' && kpis.items.length > 0 && (
          <section className="poster__figures" aria-label={keyLabel}>
            <h2>{keyLabel}</h2>
            <div className="poster__rings">
              {kpis.items.map((k) => (
                <Figure key={`${k.label}-${k.caption}`} k={k} lang={lang} names={spec.compareNames} flags={pairFlags} />
              ))}
            </div>
            <Skyline />
          </section>
        )}

        {/* (a poster has room for the headline charts, not for all of them) */}
        {charts.slice(0, 4).map((w, i) => {
          const art = matchArt('title' in w ? w.title : '') ?? matchArt(spec.title)
          return (
            <section key={`${w.type}-${i}`} className="poster__chart">
              {art && (
                <span className="poster__badge">
                  <Art id={art} />
                </span>
              )}
              {renderChart(w)}
            </section>
          )
        })}

        {spec.insights.length > 0 && (
          <section className="poster__did">
            <h2>{t?.didYouKnow ?? insightsLabel}</h2>
            <div className="poster__bubbles">
              <InsightsPanel title={insightsLabel} items={spec.insights} />
            </div>
          </section>
        )}

        <section className="poster__closing">
          <p className="poster__block poster__block--dark">{lines[0]}</p>
          <p className="poster__block poster__block--dark">{lines[1]}</p>
          <p className="poster__block poster__block--blue">{lines[2]}</p>
        </section>

        <footer className="poster__foot">
          <img src={estatLogo} alt="Eurostat" />
          <span>
            {sourceLabel}: Eurostat ({spec.source.code}) · ec.europa.eu/eurostat
          </span>
        </footer>
      </article>
    </div>
  )
}
