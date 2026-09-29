import tables from './tables.json'
import { FUEL_LOSSES_COLOR, THRESHOLD, makeFlow, type FlowData } from './model'

const NODE_CODES = new Set((tables as { sankeyNodes: string[] }).sankeyNodes)
const REF_CODES = new Set([...NODE_CODES].map((n) => n.slice(1)))

/**
 * The geometry of ENSANKEY's energy flow diagram, ported as it is drawn there (js/sankey/sankey.js,
 * node.js, flow.js): nodes at fixed places of the picture, flows as stroked paths of straight
 * runs and circular arcs, stacked in the order they are drawn. People know this shape; it is kept.
 */

export class Vec2 {
  x: number
  y: number
  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }
  clone() {
    return new Vec2(this.x, this.y)
  }
  Plus(v: Vec2) {
    return new Vec2(this.x + v.x, this.y + v.y)
  }
  Minus(v: Vec2) {
    return new Vec2(this.x - v.x, this.y - v.y)
  }
  plus(v: Vec2) {
    this.x += v.x
    this.y += v.y
    return this
  }
  distance(v: Vec2) {
    return Math.hypot(this.x - v.x, this.y - v.y)
  }
}

export const D = {
  nodeThickness: 0.005,
  xN1: 0.24,
  yMain: 0.32,
  yT2: 0.55,
  yBottom: 0.95,
  xN1_1: 0.07,
  xN6: 0.57,
  xN6_1: 0.95,
  xN6_1_X: 1.1,
  paddingTransformationFlow: 0.04,
  paddingNodeGroupX: 0.03,
  paddingConsumption: 0.12,
  maxTopNode: 0.05,
  paddingN5N3: 0.06,
  paddingN3E4: 0.075,
  paddingNodeGroupY: 0.032,
  xN6_1_1_X_agg: 1.22,
  xN6_1_1_X_dis: 1.4,
  xN6_1_2_X: 1.22,
  xN6_1_1_X_X: 1.6,
  yN6_1_1_X_X: 0.2,
  xE6_5_X: 1.1,
  drawFuelMinPixelSize: 0.5,
  nodeSizeMin: 10,
  nodeFontRel: 0.014,
}

/** Which nodes are opened up: ENSANKEY's 13-bit state (see sankey-tools.js). */
export interface Disaggregation {
  production: boolean
  allSources: boolean
  transformation: boolean
  afterTransformation: boolean
  finalConsumption: boolean
  energyConsumption: boolean
  nonEnergyConsumption: boolean
  industry: boolean
  transport: boolean
  otherSectors: boolean
  energyBranch: boolean
  rpiTransformation: boolean
  ehgTransformation: boolean
}

export const DEFAULT_DISAGGREGATION: Disaggregation = {
  production: false,
  allSources: true,
  transformation: false,
  afterTransformation: true,
  finalConsumption: false,
  energyConsumption: false,
  nonEnergyConsumption: false,
  industry: false,
  transport: false,
  otherSectors: false,
  energyBranch: false,
  rpiTransformation: false,
  ehgTransformation: false,
}

export interface FlowPath {
  d: string
  color: string
  width: number
  fuel: string
  index: number
  value: number
}

export interface DrawnFlow {
  key: string
  code: string
  source: string
  target: string
  paths: FlowPath[]
}

export interface DrawnNode {
  code: string
  path: string
  /** A larger invisible target for a node too small to click. */
  hit?: string
  value: number
  labelLines: { x: number; y: number; text: string }[]
  valueLabel: { x: number; y: number; text: string }
  fontSize: number
  vertical: boolean
}

export interface LayoutInput {
  flows: Map<string, FlowData>
  width: number
  height: number
  scaleMax: number
  disaggregation: Disaggregation
  /** Extra width (as a fraction) the disaggregated views ask for is handled by the caller; this is the transformation shift. */
  transformationShift: number
  name: (code: string) => string
  format: (value: number) => string
  unit: string
  measure: (text: string, fontSize: number) => number
}

class SNode {
  c: Ctx
  code: string
  vertical: boolean
  reverse: boolean
  labelPosition: string
  positionNormalized: Vec2
  position: Vec2
  thickness: number
  flowIn: FlowData
  flowOut: FlowData
  nodeIn: [string, number, string][] = []
  nodeOut: [string, number, string][] = []
  constructor(c: Ctx, code: string, pn: Vec2, vertical = true, reverse = false, labelPosition = 'T') {
    this.c = c
    this.code = code
    this.vertical = vertical
    this.reverse = reverse
    this.labelPosition = labelPosition
    this.positionNormalized = pn.clone()
    this.position = new Vec2(c.xScale(pn.x), c.yScale(pn.y))
    this.thickness = c.xScale(D.nodeThickness)
    this.flowIn = makeFlow(`${code}_in`, [], [], [])
    this.flowOut = makeFlow(`${code}_out`, [], [], [])
  }
  positionIO(isInflow: boolean) {
    const size = isInflow ? this.c.size(this.flowIn.value) : this.c.size(this.flowOut.value)
    const thickness = (0.5 - (isInflow ? 1 : 0)) * this.thickness
    const shift = new Vec2(thickness, (1 - 2 * (this.reverse ? 1 : 0)) * size)
    if (!this.vertical) {
      const t = shift.x
      shift.x = shift.y
      shift.y = t
    }
    return this.position.Plus(shift)
  }
  positionIn() {
    return this.positionIO(true)
  }
  positionOut() {
    return this.positionIO(false)
  }
  value() {
    return Math.max(this.flowIn.value, this.flowOut.value)
  }
  size() {
    return Math.max(this.c.size(this.flowIn.value), this.c.size(this.flowOut.value))
  }
  get rev() {
    return this.reverse ? 1 : 0
  }
}

/** Adds a flow to the running sum of a node (fuels added up by code). */
function plusFlow(acc: FlowData, flow: FlowData) {
  acc.value += flow.value
  flow.fuels.forEach((fuel, i) => {
    const j = acc.fuels.indexOf(fuel)
    if (j < 0) {
      acc.fuels.push(fuel)
      acc.values.push(flow.values[i])
      acc.colors.push(flow.colors[i])
    } else acc.values[j] += flow.values[i]
  })
}

interface Ctx {
  W: number
  H: number
  xScale: (n: number) => number
  yScale: (n: number) => number
  xInvert: (v: number) => number
  yInvert: (v: number) => number
  size: (value: number) => number
}

export interface Layout {
  nodes: DrawnNode[]
  flows: DrawnFlow[]
  warnings: string[]
}

const num = (n: number) => Math.round(n * 1000) / 1000

export function layoutSankey(input: LayoutInput): Layout {
  const { width: W, height: H, flows: F, disaggregation: dis } = input
  const nt = D.nodeThickness * W
  const xScale = (n: number) => nt + n * (W - 2 * nt)
  const yScale = (n: number) => nt + n * (H - 2 * nt)
  const xInvert = (v: number) => (v - nt) / (W - 2 * nt)
  const yInvert = (v: number) => (v - nt) / (H - 2 * nt)
  const k = input.scaleMax > 0 ? (0.2 * H) / input.scaleMax : 0
  const size = (value: number) => value * k
  const c: Ctx = { W, H, xScale, yScale, xInvert, yInvert, size }
  const flowOf = (code: string): FlowData => F.get(code) ?? makeFlow(code, [], [], [])
  const fsize = (f: FlowData) => size(f.value)

  const drawnNodes = new Map<string, SNode>()
  const drawnFlows: DrawnFlow[] = []

  const flowNs = (f: FlowData, source: SNode, target: SNode, key: string): DrawnFlow => ({ key, code: f.code, source: source.code, target: target.code, paths: [] })

  const emit = (out: DrawnFlow, flow: FlowData, path: string, i: number) => {
    if (flow.values[i] < THRESHOLD) return
    out.paths.push({ d: path, color: flow.colors[i], width: Math.max(size(flow.values[i]), D.drawFuelMinPixelSize), fuel: flow.code.startsWith('F4') ? 'losses' : flow.fuels[i], index: i, value: flow.values[i] })
  }

  // ---------- flows (flow.js) ----------

  const drawVV = (out: DrawnFlow, flow: FlowData, s: SNode, t: SNode, widIn?: number, posIn?: number) => {
    const wid = widIn === undefined ? 1 / 3 : Math.max(Math.min(widIn, 1), 0)
    let pos = posIn === undefined ? 1 / 3 : Math.max(Math.min(posIn, 1), 0)
    pos = Math.min(pos, 1 - wid)
    const fs = fsize(flow)
    const sIn = s.positionOut().Plus(new Vec2(0, (0.5 - s.rev) * fs))
    const tIn = t.positionIn().Plus(new Vec2(0, (0.5 - t.rev) * fs))
    const dIn = tIn.Minus(sIn)
    if (dIn.x < 0) return drawBackflow(out, flow, s, t, widIn, posIn)
    const dy0 = Math.min(Math.abs(dIn.y), fs)
    const dxMin = Math.sqrt(dy0 * (2 * fs - dy0))
    if (dIn.x < 1.01 * dxMin) return
    const sp = sIn.Plus(new Vec2(pos * (dIn.x - dxMin), 0))
    const tp = tIn.Minus(new Vec2((1 - pos - wid) * (dIn.x - dxMin), 0))
    const d = tp.Minus(sp)
    const dist = sp.distance(tp)
    const phi = Math.min(2 * Math.acos(d.x / dist), Math.PI / 2)
    const r = phi < Math.PI / 2 ? dist / (4 * Math.sin(phi / 2)) : d.x / 2
    let dy = -fs / 2
    const turnRight = d.y > 0 ? 1 : 0
    const sign = -Math.sign(d.y)
    for (let i = 0; i < flow.values.length; i++) {
      dy += size(flow.values[i]) / 2
      let path = `M ${num(sIn.x)},${num(sIn.y + dy)}`
      if (phi > 0.0001) {
        const dr = sign * dy
        const r1 = r + dr
        const r2 = r - dr
        path += ` L ${num(sp.x)},${num(sp.y + dy)} A ${num(r1)},${num(r1)} 0 0,${turnRight} `
        const p = new Vec2((sp.x + tp.x) * 0.5, (sp.y + tp.y) * 0.5).plus(new Vec2(dr * Math.sin(phi), dy * Math.cos(phi)))
        if (phi < Math.PI / 2) path += `${num(p.x)},${num(p.y)}`
        else {
          path += `${num(p.x)},${num(sp.y + dy - sign * r1)}`
          path += ` L ${num(p.x)},${num(tp.y + dy + sign * r2)}`
        }
        path += ` A ${num(r2)},${num(r2)} 0 0,${1 - turnRight} ${num(tp.x)},${num(tp.y + dy)}`
      }
      path += ` L ${num(tIn.x)},${num(tIn.y + dy)}`
      emit(out, flow, path, i)
      dy += size(flow.values[i]) / 2
    }
  }

  const drawVH = (out: DrawnFlow, flow: FlowData, s: SNode, t: SNode, widIn?: number) => {
    const wid = widIn === undefined ? 1 / 3 : Math.max(Math.min(widIn, 1), 0)
    const fs = fsize(flow)
    const sIn = s.positionOut().Plus(new Vec2(0, -s.rev * fs))
    const tIn = t.positionIn().Plus(new Vec2((1 - t.rev) * fs, 0))
    const dIn = tIn.Minus(sIn)
    const w = Math.min(dIn.x, dIn.y)
    if (w < 1.01 * fs) return
    const r = wid * w + fs * (1 - wid)
    const sp = new Vec2(tIn.x - r, sIn.y)
    const tp = new Vec2(tIn.x, sIn.y + r)
    let dr = 0
    for (let i = 0; i < flow.values.length; i++) {
      dr += size(flow.values[i]) / 2
      const path = `M ${num(sIn.x)},${num(sIn.y + dr)} L ${num(sp.x)},${num(sp.y + dr)} A ${num(r - dr)},${num(r - dr)} 0 0,1 ${num(tp.x - dr)},${num(tp.y)} L ${num(tIn.x - dr)},${num(tIn.y)}`
      emit(out, flow, path, i)
      dr += size(flow.values[i]) / 2
    }
  }

  const drawHV = (out: DrawnFlow, flow: FlowData, s: SNode, t: SNode, widIn?: number) => {
    const wid = widIn === undefined ? 1 / 3 : Math.max(Math.min(widIn, 1), 0)
    const fs = fsize(flow)
    const sIn = s.positionOut().Plus(new Vec2((1 - s.rev) * fs, 0))
    const tIn = t.positionIn().Plus(new Vec2(0, -t.rev * fs))
    const dIn = tIn.Minus(sIn)
    if (dIn.x < 0 || dIn.y < 0) return
    const r = wid * Math.min(dIn.x, dIn.y)
    const sp = new Vec2(sIn.x, tIn.y - r)
    const tp = new Vec2(sIn.x + r, tIn.y)
    let dr = 0
    for (let i = 0; i < flow.values.length; i++) {
      dr += size(flow.values[i]) / 2
      const path = `M ${num(sIn.x - dr)},${num(sIn.y)} L ${num(sp.x - dr)},${num(sp.y)} A ${num(r + dr)},${num(r + dr)} 0 0,0 ${num(tp.x)},${num(tp.y + dr)} L ${num(tIn.x)},${num(tIn.y + dr)}`
      emit(out, flow, path, i)
      dr += size(flow.values[i]) / 2
    }
  }

  const drawBackflow = (out: DrawnFlow, flow: FlowData, s: SNode, t: SNode, widIn?: number, posIn?: number) => {
    const wid = widIn === undefined ? 1 / 3 : Math.max(Math.min(widIn, 1), 0)
    let pos = posIn === undefined ? 0 : Math.max(Math.min(posIn, 1), 0)
    pos = xScale(pos)
    const fs = fsize(flow)
    const sIn = s.positionOut().Minus(new Vec2(0, s.rev * fs))
    const tIn = t.positionIn().Minus(new Vec2(0, s.rev * fs))
    const sign = Math.sign(tIn.y - sIn.y)
    if (sign > 0) tIn.plus(new Vec2(0, fs))
    else sIn.plus(new Vec2(0, fs))
    const dIn = tIn.Minus(sIn)
    const w = Math.min(Math.abs(dIn.y) / 2, fs + pos)
    if (dIn.x > 0 || w < 1.01 * fs) return
    const r = wid * w + fs * (1 - wid)
    let sp: Vec2
    let tp: Vec2
    if (sign > 0) {
      sp = new Vec2(sIn.x + pos, sIn.y)
      tp = new Vec2(sp.x, tIn.y)
    } else {
      tp = new Vec2(tIn.x - pos, tIn.y)
      sp = new Vec2(tp.x, sIn.y)
    }
    const p1 = sp.Plus(new Vec2(sign * r, sign * r))
    const p2 = tp.Plus(new Vec2(sign * r, -sign * r))
    let dr = 0
    for (let i = 0; i < flow.values.length; i++) {
      dr += size(flow.values[i]) / 2
      const dy = sign * dr
      const path =
        `M ${num(sIn.x)},${num(sIn.y + dy)} L ${num(sp.x)},${num(sp.y + dy)} A ${num(r - dr)},${num(r - dr)} 0 0,1 ${num(p1.x - dy)},${num(p1.y)}` +
        ` L ${num(p2.x - dy)},${num(p2.y)} A ${num(r - dr)},${num(r - dr)} 0 0,1 ${num(tp.x)},${num(tp.y - dy)} L ${num(tIn.x)},${num(tIn.y - dy)}`
      emit(out, flow, path, i)
      dr += size(flow.values[i]) / 2
    }
  }

  /** flowNameSpace.draw: the flow from a node to a node, stacked where asked. */
  const draw = (flow: FlowData, s: SNode, t: SNode, widIn?: number, posIn?: number, stacked?: 'S' | 'T', scale = 1) => {
    s.nodeOut.push([t.code, flow.value, flow.code])
    t.nodeIn.push([s.code, flow.value, flow.code])
    if (flow.isTiny) return
    let wid = widIn
    let pos = posIn
    if (stacked) {
      const dist = t.position.x - s.position.x
      const up = t.positionIn().y < s.positionOut().y
      const shift =
        stacked === 'S'
          ? up
            ? size(s.flowOut.value)
            : size(s.flowIn.value) - size(s.flowOut.value) - fsize(flow)
          : up
            ? size(t.flowOut.value) - size(t.flowIn.value) - fsize(flow)
            : size(t.flowIn.value)
      pos = (pos ?? 0) + (shift / dist) * scale
      wid = Math.max(Math.min((wid ?? 1 / 3) + pos / 2, 1 - pos), 0)
      if (stacked === 'T') pos = 1 - wid - pos
    }
    const out = flowNs(flow, s, t, `${s.code}_${t.code}_${flow.code}`)
    const kind = (s.vertical ? 1 : 0) + 2 * (t.vertical ? 1 : 0)
    if (kind === 1) drawVH(out, flow, s, t, wid)
    else if (kind === 2) drawHV(out, flow, s, t, wid)
    else if (kind === 3) drawVV(out, flow, s, t, wid, pos)
    else return
    drawnFlows.push(out)
    plusFlow(s.flowOut, flow)
    plusFlow(t.flowIn, flow)
    drawnNodes.set(s.code, s)
    drawnNodes.set(t.code, t)
  }

  const node = (code: string, x: number, y: number, vertical = true, reverse = false, label = 'T') => new SNode(c, code, new Vec2(x, y), vertical, reverse, label)

  // ---------- groups of flows and the consumption opened up (sankey.js: drawFlowGroup, drawDisaggregate*Consumption) ----------

  const childrenOf = (codes: string[]) => codes.map((code) => flowOf(`F${code}`))
  /** The parts of a flow, as its node's numbered children (F6_1_1_1 → F6_1_1_1_1, _2…) that the diagram knows. */
  const initializeChildFlows = (parent: FlowData) => {
    const out: string[] = []
    for (let i = 1; ; i++) {
      const code = `${parent.code.slice(1)}_${i}`
      if (!REF_CODES.has(code)) break
      out.push(code)
    }
    return childrenOf(out)
  }
  const groupHeight = (list: FlowData[]) => {
    const shown = list.filter((f) => !f.isTiny)
    return shown.reduce((sum, f) => sum + fsize(f), 0) / H + (shown.length - 1) * D.paddingNodeGroupY
  }
  const drawFlowGroup = (xIn: number, source: SNode, list: FlowData[]): number => {
    const x = xIn + input.transformationShift
    let y = Math.max(D.maxTopNode, source.positionNormalized.y + (source.size() / H - groupHeight(list)) / 2)
    for (const obj of list) {
      let code = `E${obj.code.slice(1)}`
      if (!NODE_CODES.has(code)) code = `N${code.slice(1)}`
      const target = node(code, x, y, true, false, 'E_R')
      draw(obj, source, target, 0.4, 0.2, 'S', 1.5)
      if (obj.isTiny) continue
      y += fsize(obj) / H + D.paddingNodeGroupY
    }
    return y - D.paddingNodeGroupY
  }
  const drawFinalConsumption = (N6_1: SNode) => {
    const F6_1_1 = flowOf('F6_1_1')
    const F6_1_2 = flowOf('F6_1_2')
    const N6_1_1 = node('N6_1_1', D.xN6_1_X + input.transformationShift, N6_1.positionNormalized.y)
    const N6_1_2 = node('N6_1_2', D.xN6_1_X + input.transformationShift, yInvert(N6_1_1.position.y + fsize(F6_1_1)) + D.paddingConsumption)
    draw(F6_1_1, N6_1, N6_1_1, 0.2)
    draw(F6_1_2, N6_1, N6_1_2, 0.2, 0.6)
    if (dis.energyConsumption) drawEnergyConsumption(N6_1_1)
    if (dis.nonEnergyConsumption) drawFlowGroup(D.xN6_1_2_X, N6_1_2, childrenOf(['6_1_2_1', '6_1_2_2', '6_1_2_3']))
  }
  const drawEnergyConsumption = (N6_1_1: SNode) => {
    const F1 = flowOf('F6_1_1_1')
    const F2 = flowOf('F6_1_1_2')
    const F3s = flowOf('F6_1_1_3')
    if (!(dis.industry || dis.transport || dis.otherSectors)) {
      drawFlowGroup(D.xN6_1_1_X_agg, N6_1_1, [F1, F2, F3s])
      return
    }
    const numberSectors = Number(!F1.isTiny) + Number(!F2.isTiny) + Number(!F3s.isTiny)
    const x = D.xN6_1_1_X_dis + input.transformationShift
    let y = numberSectors > 1 ? D.yN6_1_1_X_X : N6_1_1.positionNormalized.y
    const paddingSectors = (numberSectors === 2 ? 4 : 1.5) * D.paddingNodeGroupY
    const N6_1_1_1 = node('N6_1_1_1', x, y)
    draw(F1, N6_1_1, N6_1_1_1, 0.2, 0.6)
    if (!F1.isTiny) {
      if (dis.industry) y = drawFlowGroup(D.xN6_1_1_X_X, N6_1_1_1, initializeChildFlows(F1))
      else y += fsize(F1) / H
      y += paddingSectors
    }
    let transportFlows: FlowData[] = []
    const nodeHeight = fsize(F2) / H
    if (!F2.isTiny && dis.transport) {
      transportFlows = initializeChildFlows(F2)
      y += groupHeight(transportFlows) / 2 - nodeHeight / 2
    }
    const N6_1_1_2 = node('N6_1_1_2', x, y)
    draw(F2, N6_1_1, N6_1_1_2, 0.2, 0.8)
    if (!F2.isTiny) {
      if (dis.transport) y = drawFlowGroup(D.xN6_1_1_X_X, N6_1_1_2, transportFlows)
      else y += nodeHeight
      y += paddingSectors
    }
    let otherFlows: FlowData[] = []
    if (!F3s.isTiny && dis.otherSectors) {
      otherFlows = initializeChildFlows(F3s)
      y += groupHeight(otherFlows) / 2 - fsize(F3s) / H / 2
    }
    const N6_1_1_3 = node('N6_1_1_3', x, y)
    draw(F3s, N6_1_1, N6_1_1_3, 0.2, 0.6)
    if (!F3s.isTiny && dis.otherSectors) drawFlowGroup(D.xN6_1_1_X_X, N6_1_1_3, otherFlows)
  }

  // ---------- the diagram (sankey.js: drawCommonPartDiagram) ----------

  const F1_1 = flowOf('F1_1')
  const F1_2 = flowOf('F1_2')
  const F1_3 = flowOf('F1_3')
  const F1_4 = flowOf('F1_4')
  const F1_1_1 = flowOf('F1_1_1')
  const F1_1_2 = flowOf('F1_1_2')
  const F2_1 = flowOf('F2_1')
  const F2_2 = flowOf('F2_2')
  const F3 = flowOf('F3')
  const F4 = flowOf('F4')
  const F5_1 = flowOf('F5_1')
  const F5_2 = flowOf('F5_2')
  const F6_1 = flowOf('F6_1')
  const F6_2 = flowOf('F6_2')
  const F6_3 = flowOf('F6_3')
  const F6_4 = flowOf('F6_4')
  const F6_5 = flowOf('F6_5')
  const F6_6 = flowOf('F6_6')
  const F6_7 = flowOf('F6_7')
  const F6_8 = flowOf('F6_8')
  void F3

  const N1 = node('N1', D.xN1, D.yMain, true, false, 'B')
  const N6 = node('N6', D.xN6 + input.transformationShift, D.yMain)

  if (dis.allSources) {
    const N1_1 = node('N1_1', D.xN1_1, yInvert(N1.position.y + fsize(F1_2) + fsize(F1_3) + fsize(F1_4)), true, false, 'B')
    const E1_4 = node('E1_4', xInvert(N1.position.x) - 0.02, 0.15, false, true, 'R')
    const E1_3 = node('E1_3', xInvert(E1_4.position.x - fsize(F1_4)) - D.paddingNodeGroupX, 0.05, false, true, 'R')
    const E1_2 = node('E1_2', xInvert(E1_3.position.x - fsize(F1_3)) - D.paddingNodeGroupX, 0.05, false, true, 'L')
    draw(F1_4, E1_4, N1, 0.2)
    draw(F1_3, E1_3, N1, 0.1)
    draw(F1_2, E1_2, N1, 0)
    draw(F1_1, N1_1, N1)
    if (dis.production) {
      const E1_1_2 = node('E1_1_2', 0.002, N1_1.positionNormalized.y, true)
      const E1_1_1 = node('E1_1_1', 0.002, yInvert(E1_1_2.position.y + fsize(F1_1_2) + xScale(D.paddingNodeGroupX)), true, false, 'B')
      draw(F1_1_2, E1_1_2, N1_1)
      draw(F1_1_1, E1_1_1, N1_1)
    }
  }

  const xTransformation = (N6.positionNormalized.x + N1.positionNormalized.x) / 2
  const E4 = node('E4', xTransformation + 0.05 + xInvert(fsize(F2_1) - fsize(F2_2)), D.yBottom, false, true, 'B')
  if (!dis.transformation) {
    const N5 = node('N5', xTransformation, D.yMain)
    const T2 = node('T2', xTransformation, Math.max(D.yT2, yInvert(N5.position.y + fsize(F5_1)) + D.paddingTransformationFlow))
    draw(F5_1, N5, N6)
    draw(F5_2, N1, N5)
    draw(F2_1, N1, T2, 0.2, 0.1)
    draw(F2_2, T2, N6, 0.2, 0.7)
    draw(F4, T2, E4, 0.2)
  } else if (dis.rpiTransformation || dis.ehgTransformation) {
    // Refineries and electricity and heat generation opened up too (drawDisaggregateRPIEHGTransformation).
    const plants = ['6', '7', '8', '9', '10', '11', '12']
    const rpi = ['1', '2', '3']
    const ehg = ['1', '2', '3', '4']
    const height = (list: [FlowData, FlowData][]) => list.filter(([a, b]) => !(a.isTiny && b.isTiny))
    const main = height(plants.map((x) => [flowOf(`F2_${x}_1`), flowOf(`F2_${x}_2`)]))
    const rpiFlows = height(rpi.map((x) => [flowOf(`F2_6_${x}_1`), flowOf(`F2_6_${x}_2`)]))
    const ehgFlows = height(ehg.map((x) => [flowOf(`F2_11_${x}_1`), flowOf(`F2_11_${x}_2`)]))
    const sum = (l: [FlowData, FlowData][]) => l.reduce((a, [x, y]) => a + Math.max(fsize(x), fsize(y)), 0)
    const heightTransformation = (sum(main) + sum(rpiFlows) + sum(ehgFlows)) / H + (main.length + rpiFlows.length + ehgFlows.length - 3) * D.paddingTransformationFlow
    let yTrans: number
    if (yInvert(N1.position.y + fsize(F5_1)) + heightTransformation + 2 * D.paddingN5N3 < E4.positionNormalized.y - D.paddingN3E4)
      yTrans = yInvert(N1.position.y + fsize(F5_1) - Math.max(fsize(F2_1), fsize(F2_2)) / 2) + heightTransformation / 2 + D.paddingN5N3
    else yTrans = yInvert(E4.position.y - Math.max(fsize(F2_1), fsize(F2_2)) / 2) - D.paddingN3E4 - heightTransformation / 2 - D.paddingN5N3
    const reach = size(input.scaleMax) + xScale(D.nodeThickness)
    const N2_1 = node('N2_1', xInvert(N1.position.x + reach), yTrans, true, false, 'B')
    const N2_2 = node('N2_2', xInvert(N6.position.x - reach), yTrans, true, false, 'B')
    let nodeYPosition = yInvert(N2_1.position.y + Math.max(fsize(F2_1), fsize(F2_2)) / 2) - heightTransformation / 2
    const N5 = node('N5', xTransformation, Math.min(N1.positionNormalized.y, yInvert(yScale(nodeYPosition) - fsize(F5_1)) - 3.5 * D.paddingN5N3))
    draw(F5_1, N1, N5, 0.2, 0)
    draw(F5_2, N5, N6, 0.2, 1)
    draw(F2_1, N1, N2_1, 0.2)
    draw(F2_2, N2_2, N6, 0.2)
    const plant = (x: string, from: SNode, to: SNode, wid = 0.5, pos = 0, code = `F2_${x}`, lossCode = `F4_${x}`) => {
      const inflow = flowOf(`${code}_1`)
      const outflow = flowOf(`${code}_2`)
      const tnode = node(`T2_${x}`, xTransformation, nodeYPosition)
      draw(inflow, from, tnode, wid, pos, 'S', 1.3)
      draw(outflow, tnode, to, wid, pos, 'T', 1.3)
      draw(flowOf(lossCode), tnode, E4, 0.2)
      if (!(inflow.isTiny && outflow.isTiny)) nodeYPosition += Math.max(fsize(inflow), fsize(outflow)) / H + D.paddingTransformationFlow
    }
    const N2_6_1 = node('N2_6_1', xInvert(N2_1.position.x + reach), yTrans / 2.2)
    const N2_6_2 = node('N2_6_2', xInvert(N2_2.position.x - reach), yTrans / 2.2)
    if (dis.rpiTransformation) {
      draw(flowOf('F2_6_1'), N2_1, N2_6_1, 0.2)
      draw(flowOf('F2_6_2'), N2_6_2, N2_2, 0.2)
      rpi.forEach((k, idx) => {
        const inflow = flowOf(`F2_6_${k}_1`)
        const outflow = flowOf(`F2_6_${k}_2`)
        let y = nodeYPosition
        if (idx === 0) {
          y = yTrans / 2.2
          nodeYPosition += 1.5 * (Math.max(fsize(inflow), fsize(outflow)) / H + D.paddingTransformationFlow)
        }
        const tnode = node(`T2_6_${k}`, xTransformation, y)
        draw(inflow, N2_6_1, tnode, 0.5, 0, 'S', 1.3)
        draw(outflow, tnode, N2_6_2, 0.5, 0, 'T', 1.3)
        draw(flowOf(`F4_6_${k}`), tnode, E4, 0.2)
        if (!(inflow.isTiny && outflow.isTiny) && idx !== 0) nodeYPosition += Math.max(fsize(inflow), fsize(outflow)) / H + D.paddingTransformationFlow
      })
      nodeYPosition += D.paddingTransformationFlow
      for (const x of plants) if (Number(x) > 6 && Number(x) < 11) plant(x, N2_1, N2_2)
    } else {
      for (const x of plants) if (Number(x) < 11) plant(x, N2_1, N2_2)
      nodeYPosition += D.paddingTransformationFlow
    }
    if (dis.ehgTransformation) {
      const yOffset = !dis.rpiTransformation || rpiFlows.length === 0 ? 1.2 : 1.5
      const N2_11_1 = node('N2_11_1', xInvert(N2_1.position.x + reach), yTrans * yOffset, true, false, 'B')
      const N2_11_2 = node('N2_11_2', xInvert(N2_2.position.x - reach), yTrans * yOffset, true, false, 'B')
      draw(flowOf('F2_11_1'), N2_1, N2_11_1, 0.2)
      draw(flowOf('F2_11_2'), N2_11_2, N2_2, 0.2)
      for (const k of ehg) {
        const inflow = flowOf(`F2_11_${k}_1`)
        const outflow = flowOf(`F2_11_${k}_2`)
        const tnode = node(`T2_11_${k}`, xTransformation, nodeYPosition)
        draw(inflow, N2_11_1, tnode, 0.5, 0.1, 'S', 1.3)
        draw(outflow, tnode, N2_11_2, 0.5, 0.1, 'T', 1.3)
        draw(flowOf(`F4_11_${k}`), tnode, E4, 0.2)
        if (!(inflow.isTiny && outflow.isTiny)) nodeYPosition += Math.max(fsize(inflow), fsize(outflow)) / H + D.paddingTransformationFlow
      }
      nodeYPosition += D.paddingTransformationFlow
      for (const x of plants) if (Number(x) > 11) plant(x, N2_1, N2_2, 0.1, 0)
    } else {
      for (const x of plants) if (Number(x) >= 11) plant(x, N2_1, N2_2)
    }
    const N3 = node('N3', xTransformation, nodeYPosition + D.paddingN5N3 - D.paddingTransformationFlow)
    draw(F3, N2_2, N3, 0, 0.02)
    draw(F3, N3, N2_1, 0, 0.02)
  } else {
    // Transformation opened into its plants (sankey.js: drawDisaggregateTransformation).
    const plants = ['6', '7', '8', '9', '10', '11', '12']
    let nbNodes = 0
    let sumSizeFlow = 0
    for (const obj of plants) {
      const f1 = flowOf(`F2_${obj}_1`)
      const f2 = flowOf(`F2_${obj}_2`)
      if (f1.isTiny && f2.isTiny) continue
      sumSizeFlow += Math.max(fsize(f1), fsize(f2))
      nbNodes++
    }
    const heightTransformation = sumSizeFlow / H + (nbNodes - 1) * D.paddingTransformationFlow
    let yTrans: number
    if (yInvert(N1.position.y + fsize(F5_1)) + heightTransformation + 2 * D.paddingN5N3 < E4.positionNormalized.y - D.paddingN3E4)
      yTrans = yInvert(N1.position.y + fsize(F5_1) - Math.max(fsize(F2_1), fsize(F2_2)) / 2) + heightTransformation / 2 + D.paddingN5N3
    else yTrans = yInvert(E4.position.y - Math.max(fsize(F2_1), fsize(F2_2)) / 2) - D.paddingN3E4 - heightTransformation / 2 - D.paddingN5N3
    const N2_1 = node('N2_1', xInvert(N1.position.x + size(input.scaleMax) + xScale(D.nodeThickness)), yTrans, true, false, 'B')
    const N2_2 = node('N2_2', xInvert(N6.position.x - size(input.scaleMax) - xScale(D.nodeThickness)), yTrans, true, false, 'B')
    let nodeYPosition = yInvert(N2_1.position.y + Math.max(fsize(F2_1), fsize(F2_2)) / 2) - heightTransformation / 2
    const N5 = node('N5', xTransformation, Math.min(N1.positionNormalized.y, yInvert(yScale(nodeYPosition) - fsize(F5_1)) - D.paddingN5N3))
    draw(F5_1, N1, N5, 0.2, 0)
    draw(F5_2, N5, N6, 0.2, 1)
    draw(F2_1, N1, N2_1, 0.2)
    draw(F2_2, N2_2, N6, 0.2)
    for (const obj of plants) {
      const inflow = flowOf(`F2_${obj}_1`)
      const outflow = flowOf(`F2_${obj}_2`)
      const losses = flowOf(`F4_${obj}`)
      const tnode = node(`T2_${obj}`, xTransformation, nodeYPosition)
      draw(inflow, N2_1, tnode, 0.5, 0, 'S', 1.3)
      draw(outflow, tnode, N2_2, 0.5, 0, 'T', 1.3)
      draw(losses, tnode, E4, 0.2)
      if (inflow.isTiny && outflow.isTiny) continue
      nodeYPosition += Math.max(fsize(inflow), fsize(outflow)) / H + D.paddingTransformationFlow
    }
    const N3 = node('N3', xTransformation, nodeYPosition + D.paddingN5N3 - D.paddingTransformationFlow)
    draw(F3, N2_2, N3, 0, 0.02)
    draw(F3, N3, N2_1, 0, 0.02)
  }

  if (dis.afterTransformation) {
    const N6_1 = node('N6_1', D.xN6_1 + input.transformationShift, D.yMain)
    const E6_5 = node('E6_5', N6_1.positionNormalized.x, yInvert(N6_1.position.y + fsize(F6_1)) + D.paddingConsumption + 0.28)
    const E6_8 = node('E6_8', xInvert(E6_5.position.x - fsize(F6_5)) - D.paddingNodeGroupX - 0.02, D.yBottom, false, true, 'B')
    const E6_6 = node('E6_6', xInvert(E6_8.position.x - fsize(F6_8)) - D.paddingNodeGroupX, 0.9, false, true, 'L')
    const E6_7 = node('E6_7', xInvert(E6_6.position.x - fsize(F6_6)) - D.paddingNodeGroupX, 0.75, false, true, 'L')
    const E6_4 = node('E6_4', N6.positionNormalized.x + 5 * D.paddingNodeGroupX - 0.03, 0.8, false, false, 'B')
    const E6_2 = node('E6_2', N6.positionNormalized.x + 3 * D.paddingNodeGroupX, 0.9, false, false, 'B')
    const E6_3 = node('E6_3', N6.positionNormalized.x + 1 * D.paddingNodeGroupX, D.yBottom, false, false, 'L')
    draw(F6_1, N6, N6_1)
    draw(F6_5, N6, E6_5, 0.15, 0.99)
    draw(F6_8, N6, E6_8, 0.2)
    draw(F6_6, N6, E6_6, 0.2)
    draw(F6_7, N6, E6_7, 0.2)
    draw(F6_4, N6, E6_4, 0.2)
    draw(F6_2, N6, E6_2, 0.2)
    draw(F6_3, N6, E6_3, 0.2)
    void E6_6
    if (dis.finalConsumption) drawFinalConsumption(N6_1)
    if (dis.energyBranch) drawFlowGroup(D.xE6_5_X, E6_5, childrenOf(['6_5_1', '6_5_2', '6_5_3', '6_5_4', '6_5_5', '6_5_6', '6_5_7', '6_5_8', '6_5_9', '6_5_10', '6_5_11', '6_5_12', '6_5_13', '6_5_14', '6_5_15', '6_5_16']))
  }

  // ---------- nodes (node.js) ----------

  const scaleRes = 1
  const fontSize = Math.max(scaleRes * D.nodeFontRel * H, 9)
  const lineHeight = Math.max(H / 80, fontSize * 0.95)
  const nodes: DrawnNode[] = []
  const warnings: string[] = []

  for (const n of drawnNodes.values()) {
    const nodeSize = Math.max(n.size(), 3 * D.drawFuelMinPixelSize)
    let wx: number
    let wy: number
    let tx: number
    let ty: number
    let x: number
    let y: number
    if (n.vertical) {
      wx = n.thickness
      wy = nodeSize
      tx = n.position.x - n.thickness / 2
      ty = n.position.y
      x = tx
      y = ty - n.rev * wy
    } else {
      wx = nodeSize
      wy = n.thickness
      tx = n.position.x
      ty = n.position.y - n.thickness / 2
      x = tx - n.rev * wx
      y = ty
    }
    let tyName = ty
    let txLabel = tx
    let tyValue = ty
    if (n.reverse) txLabel -= wx
    const gapLabelDiagram = 3
    const gapNameValue = 2
    const gapLabelRight = 8
    switch (n.labelPosition) {
      case 'B':
        tyName += wy + lineHeight + gapLabelDiagram
        tyValue = tyName + lineHeight + gapNameValue
        break
      case 'L':
        tyValue = tyName + lineHeight + gapNameValue
        break
      case 'R':
        txLabel += n.size() + gapLabelRight
        tyValue = tyName + lineHeight + gapNameValue
        break
      default:
        tyValue -= gapLabelDiagram
        tyName = tyValue - lineHeight - gapNameValue
    }
    const valueText = `${input.format(n.value())} ${input.unit}`
    const labelLines: DrawnNode['labelLines'] = []
    const name = input.name(n.code)
    const wraps = n.labelPosition !== 'E_R' && !n.code.startsWith('T2') && n.code !== 'N3' && n.code !== 'E4'
    if (wraps) {
      const words = name.split(/\s+/)
      const maxWidth = H / 7
      const top = n.labelPosition === 'T' || n.labelPosition === 'L' || n.labelPosition === 'R'
      const boxLines: string[][] = []
      let line: string[] = []
      let boxWidth = input.measure(valueText, fontSize)
      for (const word of words) {
        line.push(word)
        let lineWidth = input.measure(line.join(' '), fontSize)
        if (lineWidth > maxWidth && line.length > 1) {
          line.pop()
          boxLines.push(line)
          line = [word]
          lineWidth = input.measure(word, fontSize)
        }
        boxWidth = Math.max(boxWidth, lineWidth)
      }
      boxLines.push(line)
      if (top) boxLines.reverse()
      let lx = txLabel
      if (n.code === 'N1' || n.code === 'N6_1' || n.code === 'N2_1') {
        lx -= boxWidth * 0.6
        txLabel = lx
      } else if (n.labelPosition === 'L') {
        lx -= boxWidth + 15
        txLabel = lx
      }
      boxLines.forEach((l, il) => labelLines.push({ x: lx, y: tyName + (1 - 2 * (top ? 1 : 0)) * il * lineHeight, text: l.join(' ') }))
      if (!top) tyValue += (boxLines.length - 1) * lineHeight
    } else labelLines.push({ x: txLabel, y: tyName, text: name })

    const tiny = wx < D.nodeSizeMin || wy < D.nodeSizeMin
    let hit: string | undefined
    if (tiny) {
      const xx = n.vertical ? x : x + (nodeSize - D.nodeSizeMin) / 2
      const yy = n.vertical ? y + (nodeSize - D.nodeSizeMin) / 2 : y
      const wxx = n.vertical ? wx : D.nodeSizeMin
      const wyy = n.vertical ? D.nodeSizeMin : wy
      hit = `M ${num(xx)} ${num(yy)} h ${num(wxx)} v ${num(wyy)} h ${num(-wxx)} Z`
    }
    nodes.push({ code: n.code, path: shapePath(n, wx, wy, x, y), hit, value: n.value(), labelLines, valueLabel: { x: txLabel, y: tyValue, text: valueText }, fontSize, vertical: n.vertical })
  }
  void FUEL_LOSSES_COLOR
  return { nodes, flows: drawnFlows, warnings }
}

/** The arrow-headed rectangle of a node: forward for vertical nodes, downward for horizontal ones, backward for N3. */
function shapePath(n: SNode, wx: number, wy: number, x: number, y: number): string {
  const bottom = y + wy
  const right = x + wx
  if (n.code === 'N3') {
    const px = wy <= 25 ? (wy / 2) * 0.66 : (wy / 2) * 0.33
    return `M ${num(x)} ${num(y)} l ${num(-px)} ${num(wy / 2)} L ${num(x)} ${num(bottom)} H ${num(right)} V ${num(y)} Z`
  }
  if (n.vertical) {
    const px = wy <= 25 ? (wy / 2) * 0.66 : (wy / 2) * 0.33
    return `M ${num(x)} ${num(y)} H ${num(right)} l ${num(px)} ${num(wy / 2)} L ${num(right)} ${num(bottom)} H ${num(x)} Z`
  }
  const py = wx <= 25 ? (wx / 2) * 0.66 : (wx / 2) * 0.33
  return `M ${num(x)} ${num(y)} V ${num(bottom)} l ${num(wx / 2)} ${num(py)} L ${num(right)} ${num(bottom)} V ${num(y)} Z`
}
