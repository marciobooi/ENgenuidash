import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { useId, useState } from 'react'
import './table.css'

export interface PartnersTableLabels {
  rank: string
  partner: string
  value: string
  share: string
  shareChange: string
  rankChange: string
  newPartner: string
  /** "up {n}" / "down {n}". */
  up: string
  down: string
  /** "Show all partners ({n})" / "Show the top 10". */
  showAll: string
  showTop: string
  pp: string
}

export interface PartnerRow {
  name: string
  value: number
  share: number
  shareChange: number | null
  rankChange: number | null
  isNew: boolean
}

const TOP = 10

/**
 * Trade partners ranked (as entrade's partner table): value, share of the total, change of that
 * share on the previous year (percentage points) and of the rank. The top 10 first; all on demand.
 */
export function PartnersTable({ caption, captionExtra, unit, rows, locale = 'en', decimals = 0, labels }: { caption: string; /** After the caption: e.g. the toggle between the places of a comparison. */ captionExtra?: ReactNode; unit?: string; rows: PartnerRow[]; locale?: string; decimals?: number; labels: PartnersTableLabels }) {
  const id = useId()
  const [all, setAll] = useState(false)
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: decimals })
  const pct = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const signed = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' })
  const shown = all ? rows : rows.slice(0, TOP)

  return (
    <div className="partners-table">
      <div className="data-table" role="region" aria-labelledby={`${id}-caption`} tabIndex={0}>
        <table className="data-table__table">
          <caption id={`${id}-caption`} className="data-table__caption">
            {caption}
            {unit && <span className="data-table__unit"> ({unit})</span>}
            {captionExtra && <span className="data-table__extra"> {captionExtra}</span>}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="data-table__num">{labels.rank}</th>
              <th scope="col">{labels.partner}</th>
              <th scope="col" className="data-table__num">{labels.value}</th>
              <th scope="col" className="data-table__num">{labels.share}</th>
              <th scope="col" className="data-table__num">{labels.shareChange}</th>
              <th scope="col" className="data-table__num">{labels.rankChange}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.name}>
                <td className="data-table__num">{i + 1}</td>
                <th scope="row">{r.name}</th>
                <td className="data-table__num">{nf.format(r.value)}</td>
                <td className="data-table__num">{pct.format(r.share)} %</td>
                <td className={`data-table__num partners-table__delta${r.shareChange != null && Math.abs(r.shareChange) >= 0.05 ? (r.shareChange > 0 ? ' is-up' : ' is-down') : ''}`}>
                  {r.shareChange == null ? '–' : `${signed.format(r.shareChange)} ${labels.pp}`}
                </td>
                <td className="data-table__num">
                  {r.isNew ? (
                    <span className="partners-table__new">{labels.newPartner}</span>
                  ) : r.rankChange == null || r.rankChange === 0 ? (
                    <Minus size={14} aria-label="0" />
                  ) : (
                    <span className={`partners-table__move ${r.rankChange > 0 ? 'is-up' : 'is-down'}`}>
                      {r.rankChange > 0 ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
                      <span className="sr-only">{(r.rankChange > 0 ? labels.up : labels.down).replace('{n}', String(Math.abs(r.rankChange)))}</span>
                      <span aria-hidden="true">{Math.abs(r.rankChange)}</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > TOP && (
        <button type="button" className="ecl-button ecl-button--tertiary partners-table__more" aria-expanded={all} onClick={() => setAll((x) => !x)}>
          {all ? labels.showTop : labels.showAll.replace('{n}', String(rows.length))}
        </button>
      )}
    </div>
  )
}
