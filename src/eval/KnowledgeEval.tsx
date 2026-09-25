import { useState } from 'react'
import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { GENERATION, SYSTEM_PROMPT } from '../llm/config'
import { loadGlossary } from '../llm/glossary'
import { loadKnowledge } from '../llm/knowledge'
import { modelPrompt } from '../llm/prompt'
import type { ChatMessage, GenerationOptions } from '../llm/protocol'
import { withoutUnfinishedSentence } from '../llm/useLocalLLM'
import { answerProblems, missingFacts, MODEL_CASES } from './modelCases'

type Complete = (messages: ChatMessage[], options: GenerationOptions) => Promise<string>

export interface KnowledgeResult {
  q: string
  /** The facts reached the prompt (retrieval did its job). */
  retrieved: boolean
  missingInPrompt: string[]
  answer: string
  problems: string[]
  ms: number
  promptChars: number
}

declare global {
  interface Window {
    __knowledgeEval?: { running: boolean; results: KnowledgeResult[] }
    /** Tuning runs: overrides of the generation options and prompt layout (console only). */
    __knowledgeEvalOptions?: { temperature?: number; questionLast?: boolean; system?: string }
  }
}

/**
 * Written answers from the knowledge base (src/eval/modelCases.ts): for each question, whether
 * its facts reached the prompt (retrieval) and whether the model's answer states them (the
 * model). Separating the two shows what to tune. Results are also on window.__knowledgeEval.
 */
export function KnowledgeEval({ dict, codelists, complete, ready }: { dict: EnergyDictionary | null; codelists: EnergyCodelists | null; complete: Complete; ready: boolean }) {
  const [results, setResults] = useState<KnowledgeResult[]>([])
  const [running, setRunning] = useState(false)

  const run = async () => {
    if (!dict || !codelists || !ready) return
    setRunning(true)
    setResults([])
    window.__knowledgeEval = { running: true, results: [] }
    try {
      await Promise.all([loadGlossary(), loadKnowledge()])
      for (const c of MODEL_CASES) {
        const started = performance.now()
        // Conceptual: definitions and passages, no data slice (the knowledge base is what is tested).
        const o = window.__knowledgeEvalOptions ?? {}
        const { prompt } = await modelPrompt(c.q, dict, codelists, c.lang, { conceptual: true, questionLast: o.questionLast })
        const options = o.temperature === undefined ? GENERATION : { ...GENERATION, temperature: o.temperature }
        const raw = await complete([{ role: 'system', content: o.system ?? SYSTEM_PROMPT }, { role: 'user', content: prompt }], options)
        const answer = withoutUnfinishedSentence(raw)
        const missingInPrompt = missingFacts(c, prompt)
        const result: KnowledgeResult = {
          q: c.q,
          retrieved: !missingInPrompt.length,
          missingInPrompt,
          answer,
          problems: answerProblems(c, answer),
          ms: Math.round(performance.now() - started),
          promptChars: prompt.length,
        }
        setResults((r) => [...r, result])
        window.__knowledgeEval.results.push(result)
      }
    } finally {
      setRunning(false)
      window.__knowledgeEval.running = false
    }
  }

  const retrieved = results.filter((r) => r.retrieved).length
  const correct = results.filter((r) => !r.problems.length).length
  const usedWhenGiven = results.filter((r) => r.retrieved && !r.problems.length).length
  return (
    <section style={{ marginTop: 40 }} aria-labelledby="knowledge-eval">
      <h2 className="ecl-u-type-heading-3" id="knowledge-eval">
        Answers from the knowledge base (model)
      </h2>
      <button type="button" className="ecl-button ecl-button--secondary" onClick={run} disabled={running || !ready || !dict}>
        {running ? `Running… ${results.length}/${MODEL_CASES.length}` : `Run ${MODEL_CASES.length} knowledge-base questions`}
      </button>
      {!ready && <p className="ecl-u-type-paragraph">The model is not loaded yet.</p>}
      {results.length > 0 && (
        <p className="ecl-u-type-paragraph">
          Facts in the prompt: <strong>{retrieved}</strong>/{results.length} · correct answers: <strong>{correct}</strong>/{results.length} · correct when the facts
          were given: <strong>{usedWhenGiven}</strong>/{retrieved} · average {Math.round(results.reduce((n, r) => n + r.ms, 0) / results.length)} ms
        </p>
      )}
      {results.length > 0 && (
        <table className="ecl-table ecl-table--zebra">
          <thead className="ecl-table__head">
            <tr className="ecl-table__row">
              {['', 'Question', 'In prompt', 'Answer', 'Problems', 'ms'].map((h) => (
                <th key={h} className="ecl-table__header" scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="ecl-table__body">
            {results.map((r) => (
              <tr key={r.q} className="ecl-table__row">
                <td className="ecl-table__cell">{r.problems.length ? '✗' : '✓'}</td>
                <td className="ecl-table__cell">{r.q}</td>
                <td className="ecl-table__cell">{r.retrieved ? 'yes' : `no: ${r.missingInPrompt.join('; ')}`}</td>
                <td className="ecl-table__cell">{r.answer}</td>
                <td className="ecl-table__cell">{r.problems.join('; ')}</td>
                <td className="ecl-table__cell">{r.ms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
