import { Tooltip } from '../tooltip'
import { ChartColumn, ChevronRight } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import './table.css'

export interface BalanceRow {
  code: string
  label: string
  level: number
  parent?: string
  values: (number | null)[]
  flags?: (string | undefined)[]
}

export interface BalanceTableLabels {
  line: string
  /** "Show the lines of {row}" / "Hide the lines of {row}". */
  expand: string
  collapse: string
  expandAll: string
  collapseAll: string
  missing: string
  /** "Show the charts of {row}". */
  showCharts?: string
}

/**
 * An energy balance sheet (as Eurostat's enbal): balance lines as rows, fuels as columns. Lines
 * with sub-lines open and close with a button in their row header (aria-expanded); the first
 * column and the header stay in view while the table scrolls.
 */
export function BalanceTable({
  caption,
  unit,
  columns,
  rows,
  locale = 'en',
  decimals = 0,
  labels,
  initiallyOpen = ['NRGSUP'],
  chartLine,
  onChart,
}: {
  caption: string
  unit?: string
  columns: { code: string; label: string }[]
  rows: BalanceRow[]
  locale?: string
  decimals?: number
  labels: BalanceTableLabels
  initiallyOpen?: string[]
  /** The line whose charts are shown, and how to pick another (a chart button on every line). */
  chartLine?: string
  onChart?: (code: string) => void
}) {
  const id = useId()
  const [open, setOpen] = useState<Set<string>>(() => new Set(initiallyOpen))
  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const parents = useMemo(() => new Set(rows.map((r) => r.parent).filter(Boolean) as string[]), [rows])
  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, r])), [rows])
  // A line shows when every line above it is open.
  const visible = (r: BalanceRow) => {
    for (let p = r.parent; p; p = byCode.get(p)?.parent) if (!open.has(p)) return false
    return true
  }
  const toggle = (code: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  const allOpen = [...parents].every((p) => open.has(p))

  return (
    <div className="balance-table">
      <div className="balance-table__tools">
        <button type="button" className="ecl-button ecl-button--tertiary balance-table__all" onClick={() => setOpen(allOpen ? new Set() : new Set(parents))}>
          {allOpen ? labels.collapseAll : labels.expandAll}
        </button>
      </div>
      <div className="data-table balance-table__scroll" role="region" aria-labelledby={`${id}-caption`} tabIndex={0}>
        <table className="data-table__table">
          <caption id={`${id}-caption`} className="data-table__caption">
            {caption}
            {unit && <span className="data-table__unit"> ({unit})</span>}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="data-table__sticky balance-table__line">
                {labels.line}
              </th>
              {columns.map((c) => (
                <th key={c.code} scope="col" className="data-table__num balance-table__fuel">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.filter(visible).map((r) => {
              const expandable = parents.has(r.code)
              const isOpen = open.has(r.code)
              return (
                <tr key={r.code} className={`balance-table__row balance-table__row--l${Math.min(r.level, 3)}${chartLine === r.code ? ' balance-table__row--active' : ''}`}>
                  <th scope="row" className="data-table__sticky balance-table__line" style={{ paddingLeft: `${12 + r.level * 16}px` }}>
                    {expandable ? (
                      <Tooltip content={(isOpen ? labels.collapse : labels.expand).replace('{row}', r.label)}>
                        <button
                          type="button"
                          className="balance-table__toggle"
                          aria-expanded={isOpen}
                          aria-label={(isOpen ? labels.collapse : labels.expand).replace('{row}', r.label)}
                          onClick={() => toggle(r.code)}
                        >
                          <ChevronRight size={16} aria-hidden="true" className="balance-table__chevron" />
                        </button>
                      </Tooltip>
                    ) : (
                      <span className="balance-table__spacer" aria-hidden="true" />
                    )}
                    <span className="balance-table__label">{r.label}</span>
                    {onChart && (
                      <Tooltip content={(labels.showCharts ?? '{row}').replace('{row}', r.label)}>
                        <button
                          type="button"
                          className="balance-table__chart"
                          aria-pressed={chartLine === r.code}
                          aria-label={(labels.showCharts ?? '{row}').replace('{row}', r.label)}
                          onClick={() => onChart(r.code)}
                        >
                          <ChartColumn size={14} aria-hidden="true" />
                        </button>
                      </Tooltip>
                    )}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={columns[i]?.code ?? i} className="data-table__num">
                      {v == null ? (
                        <span aria-label={labels.missing} title={labels.missing}>
                          –
                        </span>
                      ) : (
                        nf.format(v)
                      )}
                      {r.flags?.[i] && (
                        <sup className="data-table__flag">
                          <abbr title={r.flags[i]}>{r.flags[i]}</abbr>
                        </sup>
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
