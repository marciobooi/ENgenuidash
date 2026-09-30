import type { DrawnFlow, DrawnNode, Layout } from './layout'

/**
 * A two-column energy flow diagram in the style of the main one (arrow-headed nodes, flows of the fuel's
 * colour): the products on the left, what they are used for on the right. Used for the households view, where
 * Eurostat gives the use of each product directly (nrg_d_hhq): nothing in it is worked out or assumed.
 */
export interface BipartiteInput {
  width: number
  height: number
  left: { code: string; color: string }[]
  right: { code: string }[]
  /** Value of each left → right flow, by the codes of both. */
  values: (left: string, right: string) => number
  colorOf: (left: string) => string
  name: (code: string) => string
  format: (value: number) => string
  unit: string
  measure: (text: string, fontSize: number) => number
}

const num = (n: number) => Math.round(n * 1000) / 1000

export function layoutBipartite(input: BipartiteInput): Layout {
  const { width: W, height: H } = input
  const fontSize = Math.max(0.03 * H, 10)
  const lineHeight = fontSize * 1.1
  const thickness = Math.max(10, 0.012 * W)
  const xLeft = W * 0.3
  const xRight = W * 0.72
  const pad = H * 0.035
  const leftTotals = input.left.map((l) => input.right.reduce((s, r) => s + input.values(l.code, r.code), 0))
  const rightTotals = input.right.map((r) => input.left.reduce((s, l) => s + input.values(l.code, r.code), 0))
  const leftShown = input.left.filter((_, i) => leftTotals[i] > 0)
  const rightShown = input.right.filter((_, i) => rightTotals[i] > 0)
  const lTot = (code: string) => leftTotals[input.left.findIndex((l) => l.code === code)]
  const rTot = (code: string) => rightTotals[input.right.findIndex((r) => r.code === code)]
  const sumL = leftShown.reduce((s, l) => s + lTot(l.code), 0)
  const sumR = rightShown.reduce((s, r) => s + rTot(r.code), 0)
  const most = Math.max(sumL, sumR, 1e-9)
  const inner = H * 0.9 - pad * (Math.max(leftShown.length, rightShown.length) - 1)
  const k = inner / most
  const top = (column: number, count: number, sum: number) => (H - (sum * k + pad * (count - 1))) / 2 + column * 0

  // Node positions: stacked, centred.
  const leftY = new Map<string, number>()
  let y = top(0, leftShown.length, sumL)
  for (const l of leftShown) {
    leftY.set(l.code, y)
    y += lTot(l.code) * k + pad
  }
  const rightY = new Map<string, number>()
  y = top(1, rightShown.length, sumR)
  for (const r of rightShown) {
    rightY.set(r.code, y)
    y += rTot(r.code) * k + pad
  }

  // Flows: each node hands out its length in the order of the other column, so they cross as little as they can.
  const flows: DrawnFlow[] = []
  const leftCursor = new Map(leftShown.map((l) => [l.code, leftY.get(l.code)!]))
  const rightCursor = new Map(rightShown.map((r) => [r.code, rightY.get(r.code)!]))
  for (const l of leftShown) {
    for (const r of rightShown) {
      const v = input.values(l.code, r.code)
      if (!(v > 0)) continue
      const w = Math.max(v * k, 0.5)
      const y0 = leftCursor.get(l.code)! + w / 2
      const y1 = rightCursor.get(r.code)! + w / 2
      leftCursor.set(l.code, leftCursor.get(l.code)! + v * k)
      rightCursor.set(r.code, rightCursor.get(r.code)! + v * k)
      const x0 = xLeft + thickness
      const x1 = xRight
      const xm = (x0 + x1) / 2
      flows.push({ key: `${l.code}_${r.code}`, code: `${l.code}|${r.code}`, source: l.code, target: r.code, paths: [{ d: `M ${num(x0)},${num(y0)} C ${num(xm)},${num(y0)} ${num(xm)},${num(y1)} ${num(x1)},${num(y1)}`, color: input.colorOf(l.code), width: w, fuel: l.code, index: 0, value: v }] })
    }
  }

  const arrow = (x: number, yTop: number, h: number) => {
    const tip = h <= 25 ? (h / 2) * 0.66 : (h / 2) * 0.33
    return `M ${num(x)} ${num(yTop)} H ${num(x + thickness)} l ${num(tip)} ${num(h / 2)} L ${num(x + thickness)} ${num(yTop + h)} H ${num(x)} Z`
  }
  const nodes: DrawnNode[] = []
  // Labels sit beside their node (past its arrow tip) and are moved apart where small nodes would make them overlap.
  const apart = (mids: number[]) => {
    const gap = lineHeight * 2.3
    const out = [...mids]
    for (let i = 1; i < out.length; i++) if (out[i] - out[i - 1] < gap) out[i] = out[i - 1] + gap
    const over = out.length ? out[out.length - 1] - (H - 6) : 0
    return over > 0 ? out.map((m) => m - over) : out
  }
  const midsLeft = apart(leftShown.map((l) => leftY.get(l.code)! + (lTot(l.code) * k) / 2))
  const midsRight = apart(rightShown.map((r) => rightY.get(r.code)! + (rTot(r.code) * k) / 2))
  const label = (code: string, value: number, x: number, yTop: number, h: number, side: 'left' | 'right', mid: number): DrawnNode => {
    const text = input.name(code)
    const valueText = `${input.format(value)} ${input.unit}`
    const width = Math.max(input.measure(text, fontSize), input.measure(valueText, fontSize))
    const tip = h <= 25 ? (h / 2) * 0.66 : (h / 2) * 0.33
    const lx = side === 'left' ? x - 10 - width : x + thickness + tip + 8
    return {
      code,
      path: arrow(x, yTop, Math.max(h, 3)),
      hit: h < 12 ? `M ${num(x)} ${num(yTop + h / 2 - 8)} h ${num(thickness)} v 16 h ${num(-thickness)} Z` : undefined,
      value,
      labelLines: [{ x: lx, y: mid - 2, text }],
      valueLabel: { x: lx, y: mid + lineHeight - 1, text: valueText },
      fontSize,
      vertical: true,
    }
  }
  leftShown.forEach((l, i) => nodes.push(label(l.code, lTot(l.code), xLeft, leftY.get(l.code)!, lTot(l.code) * k, 'left', midsLeft[i])))
  rightShown.forEach((r, i) => nodes.push(label(r.code, rTot(r.code), xRight, rightY.get(r.code)!, rTot(r.code) * k, 'right', midsRight[i])))
  return { nodes, flows, warnings: [] }
}
