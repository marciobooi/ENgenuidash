import { ChevronDown } from 'lucide-react'
import { EclMultiSelect, type EclMultiSelectLabels } from './EclMultiSelect'
import './filters.css'

export interface FilterOption {
  code: string
  label: string
}

/** One filter: a dimension of the data (countries, products…), its options and current choice. */
export interface FilterControl {
  dim: string
  label: string
  /** Several options can be chosen (ECL multiple select); otherwise a single choice (ECL select). */
  multiple: boolean
  options: FilterOption[]
  selected: string[]
}

/**
 * The filters of a dashboard toolbar, with Europa Component Library selects: a multiple select
 * (search, select all, checkboxes) for dimensions that can vary (countries, products), a single
 * select for the others (flow, price band, taxes…). Renders inline in the toolbar.
 */
export function Filters({
  filters,
  onChange,
  labels,
  disabled,
}: {
  filters: FilterControl[]
  onChange: (filter: FilterControl, codes: string[]) => void
  labels: EclMultiSelectLabels
  disabled?: boolean
}) {
  return (
    <>
      {filters.map((f) =>
        f.multiple ? (
          <EclMultiSelect
            // A new choice or option list remounts it (ECL owns the enhanced markup).
            key={`${f.dim}:${f.selected.join()}:${f.options.length}`}
            label={f.label}
            options={f.options}
            selected={f.selected}
            labels={labels}
            disabled={disabled}
            onApply={(codes) => onChange(f, codes)}
          />
        ) : (
          <div key={f.dim} className="ecl-form-group filters__single">
            <label className="ecl-form-label" htmlFor={`filter-${f.dim}`}>
              {f.label}
            </label>
            <div className="ecl-select__container ecl-select__container--s">
              <select id={`filter-${f.dim}`} className="ecl-select" value={f.selected[0] ?? ''} disabled={disabled} onChange={(e) => onChange(f, [e.target.value])}>
                {f.options.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="ecl-select__icon filters__icon" aria-hidden="true">
                <ChevronDown size={18} />
              </div>
            </div>
          </div>
        ),
      )}
    </>
  )
}
