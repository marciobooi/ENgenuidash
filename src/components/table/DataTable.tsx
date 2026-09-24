import { useId } from 'react'
import './table.css'

export interface DataTableProps {
  caption: string
  /** Header of the first column, e.g. "Country". */
  rowHeader?: string
  columns: string[]
  rows: { label: string; values: (number | null)[]; flags?: (string | undefined)[] }[]
  locale?: string
  decimals?: number
  unit?: string
  /** Text for missing values, e.g. "not available". */
  missingLabel?: string
}

/**
 * Accessible data table styled like the ECL table (ECL's own responsive table mode needs
 * markup we don't render, so it is not used): real <th scope> headers, a caption,
 * locale number formatting, Eurostat flags as <abbr>, and a keyboard-scrollable region.
 */
export function DataTable({
  caption,
  rowHeader = '',
  columns,
  rows,
  locale = 'en',
  decimals = 1,
  unit,
  missingLabel = 'not available',
}: DataTableProps) {
  const id = useId()
  const nf = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  return (
    <div
      className="data-table"
      role="region"
      aria-labelledby={`${id}-caption`}
      // Scrollable regions must be keyboard reachable.
      tabIndex={0}
    >
      <table className="data-table__table">
        <caption id={`${id}-caption`} className="data-table__caption">
          {caption}
          {unit && <span className="data-table__unit"> ({unit})</span>}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="data-table__sticky">
              {rowHeader}
            </th>
            {columns.map((c) => (
              <th key={c} scope="col" className="data-table__num">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="data-table__sticky">
                {r.label}
              </th>
              {r.values.map((v, i) => (
                <td key={i} className="data-table__num">
                  {v == null ? (
                    <span aria-label={missingLabel} title={missingLabel}>
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
          ))}
        </tbody>
      </table>
    </div>
  )
}
