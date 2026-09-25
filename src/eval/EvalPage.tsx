import { useState } from 'react'
import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { loadKnowledge } from '../llm/knowledge'
import { AnswerEval } from './AnswerEval'
import { MissLog } from './MissLogPanel'
import { EVAL_CASES } from './cases'
import { runEval, summarize, type CaseResult, type Choose } from './runEval'

/**
 * Development-only page (#/eval): runs the labelled follow-ups through rules → menu → model and
 * reports accuracy and speed on this machine. Not included in production builds.
 */
export default function EvalPage({
  dict,
  codelists,
  choose,
  complete,
  ready,
  model,
}: {
  dict: EnergyDictionary | null
  codelists: EnergyCodelists | null
  choose: Choose
  complete: Parameters<typeof AnswerEval>[0]['complete']
  ready: boolean
  /** Model loaded on this device. */
  model?: string
}) {
  const [results, setResults] = useState<CaseResult[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!dict || !codelists) return
    setRunning(true)
    setError(null)
    setResults([])
    try {
      const { docFreq } = await loadKnowledge()
      await runEval(dict, codelists, ready ? choose : undefined, (r) => setResults((all) => [...all, r]), docFreq)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const s = results.length ? summarize(results) : null
  return (
    <main className="ecl-container" id="main" style={{ paddingBlock: 24 }}>
      <h1 className="ecl-u-type-heading-2">Follow-up understanding: evaluation</h1>
      <p className="ecl-u-type-paragraph">
        {EVAL_CASES.length} labelled messages (src/eval/cases.ts). Model: {ready ? `${model ?? 'loaded'}` : 'not loaded — rules and fallback only'}.
      </p>
      <button type="button" className="ecl-button ecl-button--primary" onClick={run} disabled={running || !dict || !codelists}>
        {running ? `Running… ${results.length}/${EVAL_CASES.length}` : 'Run evaluation'}
      </button>
      {error && <p role="alert">{error}</p>}
      {s && (
        <ul className="ecl-u-type-paragraph" style={{ marginTop: 16 }}>
          <li>
            App outcome: <strong>{s.correct}</strong> correct, <strong>{s.asked}</strong> asked (buttons), <strong>{s.wrong}</strong> wrong, of {s.total}
          </li>
          <li>Rules alone: {s.rulesOnly}/{s.total}</li>
          <li>Word-overlap fallback (top 1): {s.fallbackTop1}/{s.total}</li>
          {s.modelTop1 !== undefined && (
            <li>
              Model pick (top 1, any confidence): {s.modelTop1}/{s.total} · average {s.avgMs} ms per message
            </li>
          )}
        </ul>
      )}
      {results.length > 0 && (
        <table className="ecl-table ecl-table--zebra" style={{ marginTop: 16 }}>
          <thead className="ecl-table__head">
            <tr className="ecl-table__row">
              {['', 'Lang', 'Message', 'Expected', 'Rules', 'Model', 'p', 'ms', 'App'].map((h) => (
                <th key={h} className="ecl-table__header" scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="ecl-table__body">
            {results.map((r) => (
              <tr key={r.text} className="ecl-table__row">
                <td className="ecl-table__cell">{r.verdict === 'correct' ? '✓' : r.verdict === 'asked' ? '?' : '✗'}</td>
                <td className="ecl-table__cell">{r.lang}</td>
                <td className="ecl-table__cell">{r.text}</td>
                <td className="ecl-table__cell">
                  {r.expect}
                  {r.missing ? ' (not offered)' : ''}
                </td>
                <td className="ecl-table__cell">{r.rules ?? '–'}</td>
                <td className="ecl-table__cell">{r.model ?? '–'}</td>
                <td className="ecl-table__cell">{r.prob !== undefined ? r.prob.toFixed(2) : '–'}</td>
                <td className="ecl-table__cell">{r.ms ?? '–'}</td>
                <td className="ecl-table__cell">{r.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <AnswerEval dict={dict} codelists={codelists} complete={complete} ready={ready} />
      <MissLog />
    </main>
  )
}
