import { useState } from 'react'
import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { GENERATION, SYSTEM_PROMPT } from '../llm/config'
import { loadGlossary } from '../llm/glossary'
import { loadKnowledge } from '../llm/knowledge'
import { modelPrompt } from '../llm/prompt'
import type { ChatMessage, GenerationOptions } from '../llm/protocol'
import { checkModelAnswer, runAnswerEval, type AnswerResult } from './runAnswers'

type Complete = (messages: ChatMessage[], options: GenerationOptions) => Promise<string>

interface ModelResult {
  q: string
  answer: string
  ms: number
  problems: string[]
}

/**
 * Answer quality (src/eval/answerCases.ts): what the app answers without the model (routes,
 * definitions, quotes), and, when the model is loaded, its written answers to the "why"
 * questions, checked for the facts they must mention and the wrong claims they must not make.
 */
export function AnswerEval({ dict, codelists, complete, ready }: { dict: EnergyDictionary | null; codelists: EnergyCodelists | null; complete: Complete; ready: boolean }) {
  const [results, setResults] = useState<AnswerResult[]>([])
  const [model, setModel] = useState<ModelResult[]>([])
  const [running, setRunning] = useState(false)

  const run = async () => {
    if (!dict || !codelists) return
    setRunning(true)
    setModel([])
    try {
      await loadGlossary()
      const { docFreq } = await loadKnowledge()
      const all = await runAnswerEval(dict, codelists, docFreq)
      setResults(all)
      if (!ready) return
      for (const r of all.filter((x) => x.case.model)) {
        const started = performance.now()
        const { prompt } = await modelPrompt(r.case.q, dict, codelists, r.case.lang, { conceptual: true })
        const answer = await complete([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }], GENERATION)
        const result = { q: r.case.q, answer, ms: Math.round(performance.now() - started), problems: checkModelAnswer(r.case, answer) }
        setModel((m) => [...m, result])
      }
    } finally {
      setRunning(false)
    }
  }

  const ok = results.filter((r) => r.ok).length
  const modelOk = model.filter((m) => !m.problems.length).length
  return (
    <section style={{ marginTop: 40 }} aria-labelledby="answer-eval">
      <h2 className="ecl-u-type-heading-3" id="answer-eval">
        Answers: quality
      </h2>
      <button type="button" className="ecl-button ecl-button--secondary" onClick={run} disabled={running || !dict || !codelists}>
        {running ? 'Running…' : 'Run answer evaluation'}
      </button>
      {results.length > 0 && (
        <p className="ecl-u-type-paragraph">
          Without the model: <strong>{ok}</strong>/{results.length} correct.
          {model.length > 0 && (
            <>
              {' '}
              Model answers: <strong>{modelOk}</strong>/{model.length} pass · average {Math.round(model.reduce((n, m) => n + m.ms, 0) / model.length)} ms
            </>
          )}
          {!ready && ' The model is not loaded: its answers are not measured.'}
        </p>
      )}
      {results.length > 0 && (
        <table className="ecl-table ecl-table--zebra">
          <thead className="ecl-table__head">
            <tr className="ecl-table__row">
              {['', 'Question', 'Route', 'Answer (no model)', 'Problems'].map((h) => (
                <th key={h} className="ecl-table__header" scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="ecl-table__body">
            {results.map((r) => (
              <tr key={r.case.q} className="ecl-table__row">
                <td className="ecl-table__cell">{r.ok ? '✓' : '✗'}</td>
                <td className="ecl-table__cell">{r.case.q}</td>
                <td className="ecl-table__cell">{r.dataset ? `${r.route} · ${r.dataset}` : r.route}</td>
                <td className="ecl-table__cell">{r.text.slice(0, 160)}</td>
                <td className="ecl-table__cell">{r.problems.join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {model.length > 0 && (
        <table className="ecl-table ecl-table--zebra" style={{ marginTop: 16 }}>
          <thead className="ecl-table__head">
            <tr className="ecl-table__row">
              {['', 'Question', 'Model answer', 'ms', 'Problems'].map((h) => (
                <th key={h} className="ecl-table__header" scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="ecl-table__body">
            {model.map((m) => (
              <tr key={m.q} className="ecl-table__row">
                <td className="ecl-table__cell">{m.problems.length ? '✗' : '✓'}</td>
                <td className="ecl-table__cell">{m.q}</td>
                <td className="ecl-table__cell">{m.answer}</td>
                <td className="ecl-table__cell">{m.ms}</td>
                <td className="ecl-table__cell">{m.problems.join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
