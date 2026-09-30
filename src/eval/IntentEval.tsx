import { useState } from 'react'
import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { AUTO_PROB, MIN_PROB } from '../genui/intent'
import { loadKnowledge } from '../llm/knowledge'
import { INTENT_CASES } from './intentCases'
import { INTENT_HOLDOUT } from './intentHoldout'
import { runIntentEval, summarizeIntent, type IntentResult } from './runIntent'
import type { Choose } from './runEval'

/**
 * Which dashboard the model says a question asks for, when the rules cannot read it (src/genui/intent.ts):
 * how often its first choice is right, how often the right one is among the buttons offered, and
 * how sure it must be for a dashboard to open without asking. The tuning set can be run as often
 * as needed; the holdout only to report (it is never tuned on).
 */
export function IntentEval({ dict, codelists, choose, ready }: { dict: EnergyDictionary | null; codelists: EnergyCodelists | null; choose: Choose; ready: boolean }) {
  const [results, setResults] = useState<IntentResult[]>([])
  const [which, setWhich] = useState<'tuning' | 'holdout'>('tuning')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (set: 'tuning' | 'holdout') => {
    if (!dict || !codelists || !ready) return
    setWhich(set)
    setRunning(true)
    setError(null)
    setResults([])
    try {
      const { docFreq } = await loadKnowledge()
      await runIntentEval(set === 'tuning' ? INTENT_CASES : INTENT_HOLDOUT, dict, codelists, choose, docFreq, (r) => setResults((all) => [...all, r]))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const s = results.length ? summarizeIntent(results) : null
  return (
    <section style={{ marginTop: 32 }}>
      <h2 className="ecl-u-type-heading-3">Which dashboard: the model's choice when the rules cannot read a question</h2>
      <p className="ecl-u-type-paragraph">
        {INTENT_CASES.length} tuning and {INTENT_HOLDOUT.length} holdout questions (src/eval/intentCases.ts, intentHoldout.ts). Buttons offered above p = {MIN_PROB}; opens without asking above p = {AUTO_PROB > 1 ? 'never (off)' : AUTO_PROB}.
        {!ready && ' The model is not loaded.'}
      </p>
      <button type="button" className="ecl-button ecl-button--primary" onClick={() => run('tuning')} disabled={running || !ready || !dict}>
        Run tuning set
      </button>{' '}
      <button type="button" className="ecl-button ecl-button--secondary" onClick={() => run('holdout')} disabled={running || !ready || !dict}>
        Run holdout (report only)
      </button>
      {error && <p role="alert">{error}</p>}
      {s && (
        <ul className="ecl-u-type-paragraph" style={{ marginTop: 16 }}>
          <li>
            {which}: {s.population} questions the rules cannot read (of {results.length}; {s.handledByRules} handled by the rules)
          </li>
          <li>
            First choice right: <strong>{s.top1}</strong>/{s.population} · average {s.avgMs} ms
          </li>
          <li>
            Right dashboard among the buttons: <strong>{s.offeredRecall}</strong>/{s.realQuestions} · buttons offered on "none" questions (should be 0): <strong>{s.falseOffers}</strong>/{s.noneCases}
          </li>
          <li>
            Opening without asking above p:{' '}
            {s.thresholds.map((t) => `${t.p}: ${t.right}/${t.opened}`).join(' · ')}
          </li>
        </ul>
      )}
      {results.length > 0 && (
        <table className="ecl-table ecl-table--zebra" style={{ marginTop: 16 }}>
          <thead className="ecl-table__head">
            <tr className="ecl-table__row">
              {['', 'Lang', 'Question', 'Label', 'Model', 'p', 'Buttons', 'ms'].map((h) => (
                <th key={h} className="ecl-table__header" scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="ecl-table__body">
            {results.map((r) => (
              <tr key={r.case.text} className="ecl-table__row">
                <td className="ecl-table__cell">{r.handledByRules ? 'rules' : r.top === r.case.intent || (r.top && r.case.alt?.includes(r.top as never)) ? '✓' : '✗'}</td>
                <td className="ecl-table__cell">{r.case.lang}</td>
                <td className="ecl-table__cell">{r.case.text}</td>
                <td className="ecl-table__cell">{r.case.intent}</td>
                <td className="ecl-table__cell">{r.top ?? '–'}</td>
                <td className="ecl-table__cell">{r.prob !== undefined ? r.prob.toFixed(2) : '–'}</td>
                <td className="ecl-table__cell">{r.offered?.map((c) => `${c.id} ${c.prob.toFixed(2)}`).join(', ') ?? '–'}</td>
                <td className="ecl-table__cell">{r.ms ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
