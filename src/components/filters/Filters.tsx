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
      {filters.map((f) => (
        <FilterField key={f.dim} filter={f} onChange={onChange} labels={labels} disabled={disabled} />
      ))}
    </>
  )
}

/** One filter of the toolbar (so the toolbar can order them and fold some away). */
export function FilterField({
  filter: f,
  onChange,
  labels,
  disabled,
}: {
  filter: FilterControl
  onChange: (filter: FilterControl, codes: string[]) => void
  labels: EclMultiSelectLabels
  disabled?: boolean
}) {
  return f.multiple ? (
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
    <EclSelect id={`filter-${f.dim}`} label={f.label} value={f.selected[0] ?? ''} options={f.options} disabled={disabled} onChange={(code) => onChange(f, [code])} />
  )
}

/**
 * A single-choice ECL select (label, native <select>, ECL chevron): the filters and the toolbar's
 * year and unit use the same one, so every dropdown looks and behaves alike.
 */
export function EclSelect({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  options: FilterOption[]
  onChange: (code: string) => void
  disabled?: boolean
}) {
  return (
    <div className="ecl-form-group filters__single">
      <label className="ecl-form-label" htmlFor={id}>
        {label}
      </label>
      <div className="ecl-select__container ecl-select__container--s">
        <select id={id} className="ecl-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="ecl-select__icon filters__icon" aria-hidden="true">
          <EclChevron />
        </div>
      </div>
    </div>
  )
}

/** ECL's own select chevron (the same icon ECL draws in its multiple select), so all match. */
function EclChevron() {
  return (
    <svg className="ecl-icon ecl-icon--xs ecl-icon--rotate-180" viewBox="0 0 48 48" width="48" height="48" fill="currentColor" focusable="false" aria-hidden="true">
      <path d="m45 30.12-2.73 2.82-18.24-18.36L5.73 33 3 30.18 24.03 9z" />
    </svg>
  )
}
