import Select from '@ecl/select'
import { useEffect, useId, useRef } from 'react'
import type { FilterOption } from './Filters'

export interface EclMultiSelectLabels {
  /** Placeholder when nothing is selected. */
  placeholder: string
  search: string
  noResults: string
  selectAll: string
  clearAll: string
  /** The button that closes the list and applies the choice. */
  apply: string
  /** Screen-reader text for the number of selected items. */
  counter: string
}

// ECL's Select looks up a global ECL object when it initialises.
declare global {
  interface Window {
    ECL?: Record<string, unknown>
  }
}

/**
 * The Europa Component Library multiple select (search, select all, checkboxes, clear all,
 * apply): a native <select multiple> that ECL's JavaScript enhances. The choice is applied when
 * the list closes. The component is keyed by its options and selection, so a new choice remounts
 * it instead of React and ECL both changing the same DOM.
 */
export function EclMultiSelect({
  label,
  options,
  selected,
  onApply,
  labels,
  disabled,
}: {
  label: string
  options: FilterOption[]
  selected: string[]
  onApply: (codes: string[]) => void
  labels: EclMultiSelectLabels
  disabled?: boolean
}) {
  const id = useId()
  const ref = useRef<HTMLSelectElement>(null)
  const onApplyRef = useRef(onApply)
  useEffect(() => {
    onApplyRef.current = onApply
  })

  useEffect(() => {
    const element = ref.current
    if (!element) return
    window.ECL ??= {}
    const select = new Select(element)
    select.init()
    const initial = selected.join()
    // Apply when the list closes, however it closes (Apply, Escape, a click outside, the toggle):
    // ECL's Apply button does not fire onToggle, so watch the toggle's aria-expanded instead.
    const observer = new MutationObserver(() => {
      if (select.input?.getAttribute('aria-expanded') !== 'false') return
      const codes = Array.from(element.selectedOptions, (o) => o.value)
      if (codes.length && codes.join() !== initial) onApplyRef.current(codes)
    })
    if (select.input) observer.observe(select.input, { attributes: true, attributeFilter: ['aria-expanded'] })
    return () => {
      observer.disconnect()
      select.destroy()
    }
    // Mounted once per key (options and selection): see the component comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="ecl-form-group filters__multi">
      <label className="ecl-form-label" htmlFor={id}>
        {label}
      </label>
      <div className="ecl-select__container ecl-select__container--s">
        <select
          ref={ref}
          id={id}
          className="ecl-select"
          multiple
          disabled={disabled}
          defaultValue={selected}
          data-ecl-select-multiple=""
          data-ecl-select-default={labels.placeholder}
          data-ecl-select-search={labels.search}
          data-ecl-select-no-results={labels.noResults}
          data-ecl-select-all={labels.selectAll}
          data-ecl-select-clear-all={labels.clearAll}
          data-ecl-select-close={labels.apply}
          data-ecl-select-counter={labels.counter}
        >
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
