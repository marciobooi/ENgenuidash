import type { ReactNode } from 'react'

/**
 * The SVG figures of the presentation: a progress ring (a share, or a value against its target), a large sparkline,
 * and the decorative ring of twelve stars that Eurostat's pages use. All drawn here, no pictures to load; the figures
 * carry their value in text (aria-label), the drawing is decoration.
 */

/** A ring that fills to value/max, with tick marks for the targets (each with its label). */
export function Ring({ value, max, size = 220, stroke = 22, targets = [], children, label }: { value: number; max: number; size?: number; stroke?: number; targets?: { value: number; label: string }[]; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const share = Math.max(0, Math.min(value / (max || 1), 1))
  const at = (v: number) => {
    const a = (Math.max(0, Math.min(v / (max || 1), 1)) * 2 * Math.PI) - Math.PI / 2
    return { x: size / 2 + Math.cos(a) * r, y: size / 2 + Math.sin(a) * r, ox: size / 2 + Math.cos(a) * (r + stroke * 0.9), oy: size / 2 + Math.sin(a) * (r + stroke * 0.9), ix: size / 2 + Math.cos(a) * (r - stroke * 0.9), iy: size / 2 + Math.sin(a) * (r - stroke * 0.9) }
  }
  return (
    <figure className="ring" style={{ width: size, height: size }} aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" focusable="false">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring__fill" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        {targets.map((t) => {
          const p = at(t.value)
          return <line key={`${t.value}-${t.label}`} className="ring__target" x1={p.ix} y1={p.iy} x2={p.ox} y2={p.oy} strokeWidth={4} strokeLinecap="round" />
        })}
      </svg>
      <figcaption className="ring__center">{children}</figcaption>
    </figure>
  )
}

/** A wide sparkline with the last point marked, for the big-number tiles. */
export function BigSpark({ values }: { values: (number | null)[] }) {
  const w = 240
  const h = 64
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null)
  if (pts.length < 3) return null
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const x = (i: number) => (i / (values.length - 1)) * (w - 8) + 4
  const y = (v: number) => (max === min ? h / 2 : h - 6 - ((v - min) / (max - min)) * (h - 12))
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg className="bigspark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={`${d} L${x(last.i)},${h} L${x(pts[0].i)},${h} Z`} className="bigspark__area" />
      <path d={d} className="bigspark__line" fill="none" />
      <circle cx={x(last.i)} cy={y(last.v)} r="4.5" className="bigspark__dot" />
    </svg>
  )
}

/** Twelve stars in a ring, as on the European flag: the decoration of the title and closing slides. */
export function StarRing({ size = 420, flat = false }: { size?: number; flat?: boolean }) {
  const stars = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * 2 * Math.PI - Math.PI / 2
    const cx = size / 2 + Math.cos(a) * (size * 0.36)
    const cy = size / 2 + Math.sin(a) * (size * 0.36)
    const pts = Array.from({ length: 10 }, (_, k) => {
      const rr = k % 2 === 0 ? size * 0.05 : size * 0.02
      const aa = (k / 10) * 2 * Math.PI - Math.PI / 2
      return `${(cx + Math.cos(aa) * rr).toFixed(1)},${(cy + Math.sin(aa) * rr).toFixed(1)}`
    }).join(' ')
    return <polygon key={i} points={pts} />
  })
  return (
    <svg className={flat ? 'starring starring--flat' : 'starring'} viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" focusable="false">
      {stars}
    </svg>
  )
}
