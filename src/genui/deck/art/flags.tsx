import type { ReactNode } from 'react'

/**
 * Flags as simple geometry on a 30 x 20 grid (no coats of arms): the 27 EU Member States, four neighbours and the EU.
 * Their ids are the lower-case country codes of the data ("de", "fr", "eu"; Greece is "el" as in Eurostat's codes).
 */
const h = (colors: string[], weights?: number[]) => {
  const w = weights ?? colors.map(() => 1)
  const total = w.reduce((a, b) => a + b, 0)
  let y = 0
  return colors.map((c, i) => {
    const height = (20 * w[i]) / total
    const r = <rect key={i} x="0" y={y} width="30" height={height + 0.05} fill={c} />
    y += height
    return r
  })
}
const v = (colors: string[], weights?: number[]) => {
  const w = weights ?? colors.map(() => 1)
  const total = w.reduce((a, b) => a + b, 0)
  let x = 0
  return colors.map((c, i) => {
    const width = (30 * w[i]) / total
    const r = <rect key={i} x={x} y="0" width={width + 0.05} height="20" fill={c} />
    x += width
    return r
  })
}
/** A Nordic cross: the field, the cross and (optionally) an inner cross. */
const nordic = (field: string, cross: string, inner?: string) => (
  <>
    <rect width="30" height="20" fill={field} />
    <rect x="8" width="4" height="20" fill={cross} />
    <rect y="8" width="30" height="4" fill={cross} />
    {inner && <rect x="9" width="2" height="20" fill={inner} />}
    {inner && <rect y="9" width="30" height="2" fill={inner} />}
  </>
)
const star = (cx: number, cy: number, r: number, fill: string) => {
  const pts = Array.from({ length: 10 }, (_, k) => {
    const rr = k % 2 === 0 ? r : r * 0.4
    const a = (k / 10) * 2 * Math.PI - Math.PI / 2
    return `${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`
  }).join(' ')
  return <polygon points={pts} fill={fill} />
}

export const FLAGS: Record<string, { name: string; node: () => ReactNode }> = {
  at: { name: 'Austria', node: () => h(['#ed2939', '#fff', '#ed2939']) },
  be: { name: 'Belgium', node: () => v(['#000', '#fae042', '#ed2939']) },
  bg: { name: 'Bulgaria', node: () => h(['#fff', '#00966e', '#d62612']) },
  hr: { name: 'Croatia', node: () => h(['#f00', '#fff', '#171796']) },
  cy: { name: 'Cyprus', node: () => (<><rect width="30" height="20" fill="#fff" /><ellipse cx="15" cy="8.5" rx="6.5" ry="3.6" fill="#d57800" /><path d="M9 14c3 3 9 3 12 0" stroke="#4e5b31" strokeWidth="1.2" fill="none" /></>) },
  cz: { name: 'Czechia', node: () => (<><rect width="30" height="10" fill="#fff" /><rect y="10" width="30" height="10" fill="#d7141a" /><polygon points="0,0 15,10 0,20" fill="#11457e" /></>) },
  dk: { name: 'Denmark', node: () => nordic('#c8102e', '#fff') },
  ee: { name: 'Estonia', node: () => h(['#0072ce', '#000', '#fff']) },
  fi: { name: 'Finland', node: () => nordic('#fff', '#003580') },
  fr: { name: 'France', node: () => v(['#0055a4', '#fff', '#ef4135']) },
  de: { name: 'Germany', node: () => h(['#000', '#dd0000', '#ffce00']) },
  el: {
    name: 'Greece',
    node: () => (
      <>
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} y={(i * 20) / 9} width="30" height={20 / 9 + 0.05} fill={i % 2 === 0 ? '#0d5eaf' : '#fff'} />
        ))}
        <rect width="11.1" height="11.1" fill="#0d5eaf" />
        <rect x="4.4" width="2.3" height="11.1" fill="#fff" />
        <rect y="4.4" width="11.1" height="2.3" fill="#fff" />
      </>
    ),
  },
  hu: { name: 'Hungary', node: () => h(['#ce2939', '#fff', '#477050']) },
  ie: { name: 'Ireland', node: () => v(['#169b62', '#fff', '#ff883e']) },
  it: { name: 'Italy', node: () => v(['#009246', '#fff', '#ce2b37']) },
  lv: { name: 'Latvia', node: () => h(['#9e3039', '#fff', '#9e3039'], [2, 1, 2]) },
  lt: { name: 'Lithuania', node: () => h(['#fdb913', '#006a44', '#c1272d']) },
  lu: { name: 'Luxembourg', node: () => h(['#ed2939', '#fff', '#00a1de']) },
  mt: { name: 'Malta', node: () => v(['#fff', '#cf142b']) },
  nl: { name: 'Netherlands', node: () => h(['#ae1c28', '#fff', '#21468b']) },
  pl: { name: 'Poland', node: () => h(['#fff', '#dc143c']) },
  pt: { name: 'Portugal', node: () => (<>{v(['#060', '#f00'], [2, 3])}<circle cx="12" cy="10" r="3.2" fill="#ffe000" stroke="#fff" strokeWidth="0.6" /></>) },
  ro: { name: 'Romania', node: () => v(['#002b7f', '#fcd116', '#ce1126']) },
  sk: { name: 'Slovakia', node: () => (<>{h(['#fff', '#0b4ea2', '#ee1c25'])}<path d="M6 4h6v7c0 3-3 4-3 4s-3-1-3-4z" fill="#ee1c25" stroke="#fff" strokeWidth="0.6" /><path d="M9 6v6M7 8h4" stroke="#fff" strokeWidth="0.9" /></>) },
  si: { name: 'Slovenia', node: () => (<>{h(['#fff', '#0054a5', '#ed1c24'])}<path d="M5 3h6v6c0 3-3 4-3 4s-3-1-3-4z" fill="#0054a5" stroke="#fff" strokeWidth="0.5" /></>) },
  es: { name: 'Spain', node: () => h(['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1]) },
  se: { name: 'Sweden', node: () => nordic('#006aa7', '#fecc00') },
  no: { name: 'Norway', node: () => nordic('#ba0c2f', '#fff', '#00205b') },
  is: { name: 'Iceland', node: () => nordic('#02529c', '#fff', '#dc1e35') },
  tr: {
    name: 'Türkiye',
    node: () => (
      <>
        <rect width="30" height="20" fill="#e30a17" />
        <circle cx="11" cy="10" r="5" fill="#fff" />
        <circle cx="12.4" cy="10" r="4" fill="#e30a17" />
        {star(16.5, 10, 2.2, '#fff')}
      </>
    ),
  },
  uk: {
    name: 'United Kingdom',
    node: () => (
      <>
        <rect width="30" height="20" fill="#012169" />
        <path d="M0 0l30 20M30 0L0 20" stroke="#fff" strokeWidth="4" />
        <path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" strokeWidth="1.6" />
        <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
        <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="3.4" />
      </>
    ),
  },
  eu: {
    name: 'European Union',
    node: () => (
      <>
        <rect width="30" height="20" fill="#039" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * 2 * Math.PI - Math.PI / 2
          return <g key={i}>{star(15 + Math.cos(a) * 6.6, 10 + Math.sin(a) * 6.6, 1.1, '#fc0')}</g>
        })}
      </>
    ),
  },
}

/** The id of a Eurostat geo code: "DE" is "de", the EU is "eu", "UK" and "GB" are "uk". */
export const flagId = (geo: string): string | undefined => {
  const code = geo === 'EU27_2020' || geo === 'EU' ? 'eu' : geo === 'GB' ? 'uk' : geo.toLowerCase()
  return FLAGS[code] ? code : undefined
}
