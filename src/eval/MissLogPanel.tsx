import { useState } from 'react'
import { clearMisses, missesAsCases, readMisses, type Miss } from './missLog'

/** Messages this browser's app did not handle well (see missLog.ts), ready to become test cases. */
export function MissLog() {
  const [misses, setMisses] = useState<Miss[]>(() => readMisses())
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(missesAsCases(misses))
    setCopied(true)
  }

  return (
    <section style={{ marginTop: 40 }} aria-labelledby="miss-log">
      <h2 className="ecl-u-type-heading-3" id="miss-log">
        Misunderstood messages (this browser)
      </h2>
      <p className="ecl-u-type-paragraph">
        {misses.length} message(s) refused, asked to rephrase, not understood, offered as buttons or without data. Stored in this
        browser only; add them to the test sets with the expected result.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="ecl-button ecl-button--secondary" onClick={copy} disabled={!misses.length}>
          {copied ? 'Copied' : 'Copy as test cases'}
        </button>
        <button type="button" className="ecl-button ecl-button--tertiary" onClick={() => setMisses(readMisses())}>
          Refresh
        </button>
        <button
          type="button"
          className="ecl-button ecl-button--tertiary"
          onClick={() => {
            clearMisses()
            setMisses([])
          }}
          disabled={!misses.length}
        >
          Clear
        </button>
      </div>
      {misses.length > 0 && (
        <table className="ecl-table ecl-table--zebra" style={{ marginTop: 16 }}>
          <thead className="ecl-table__head">
            <tr className="ecl-table__row">
              {['Message', 'What happened', 'Context', 'Lang', 'When'].map((h) => (
                <th key={h} className="ecl-table__header" scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="ecl-table__body">
            {misses.map((m) => (
              <tr key={m.at + m.text} className="ecl-table__row">
                <td className="ecl-table__cell">{m.text}</td>
                <td className="ecl-table__cell">{m.kind}</td>
                <td className="ecl-table__cell">{m.followUp ? 'follow-up' : 'first question'}</td>
                <td className="ecl-table__cell">{m.lang}</td>
                <td className="ecl-table__cell">{new Date(m.at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
