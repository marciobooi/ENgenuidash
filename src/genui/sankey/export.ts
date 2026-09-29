import type { DrawnFlow, DrawnNode } from './layout'

/** Saves a text or binary blob as a file (the browser's own download). */
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** The drawing as a standalone SVG document: its own size, a white background and the text as it looks on screen. */
export function svgMarkup(svg: SVGSVGElement, title: string): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const vb = svg.viewBox.baseVal
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(Math.round(vb.width)))
  clone.setAttribute('height', String(Math.round(vb.height)))
  // The picture as a whole, not as it is zoomed on screen.
  const zoomed = clone.querySelector(':scope > g')
  zoomed?.setAttribute('transform', 'translate(0 0) scale(1)')
  clone.querySelectorAll('[role],[tabindex],[aria-label],[aria-pressed]').forEach((e) => {
    e.removeAttribute('tabindex')
    e.removeAttribute('role')
  })
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('x', String(vb.x))
  bg.setAttribute('y', String(vb.y))
  bg.setAttribute('width', String(vb.width))
  bg.setAttribute('height', String(vb.height))
  bg.setAttribute('fill', '#ffffff')
  clone.insertBefore(bg, clone.firstChild)
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title')
  t.textContent = title
  clone.insertBefore(t, clone.firstChild)
  return new XMLSerializer().serializeToString(clone)
}

/** The drawing as a PNG (twice the size, for reports). */
export function svgToPng(svg: SVGSVGElement, title: string): Promise<Blob> {
  const vb = svg.viewBox.baseVal
  const markup = svgMarkup(svg, title)
  const scale = 2
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(vb.width * scale)
      canvas.height = Math.round(vb.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas'))
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png')
    }
    img.onerror = () => reject(new Error('image'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  })
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`

/** Every flow of the picture by product: source, target, product, value. */
export function flowsCsv(flows: DrawnFlow[], name: (code: string) => string, fuel: (code: string) => string, unit: string): string {
  const rows = [['source', 'target', 'product', `value (${unit})`].map(csvCell).join(',')]
  for (const f of flows) for (const p of f.paths) rows.push([name(f.source), name(f.target), p.fuel === 'losses' ? '' : fuel(p.fuel), Math.round(p.value * 10) / 10].map(csvCell).join(','))
  return rows.join('\n')
}

/** The nodes of the picture and their values. */
export function nodesCsv(nodes: DrawnNode[], name: (code: string) => string, unit: string): string {
  return [['node', `value (${unit})`].map(csvCell).join(','), ...nodes.map((n) => [name(n.code), Math.round(n.value * 10) / 10].map(csvCell).join(','))].join('\n')
}
