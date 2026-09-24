// Measures how follow-up messages are understood without the model (rules + word-overlap
// fallback), on the labelled cases in src/eval/cases.ts. The model's accuracy is measured in the
// browser: `npm run dev`, then open http://localhost:5173/#/eval (development builds only).
//
//   npm run eval:actions
import { readFileSync } from 'node:fs'
import { runEval, summarize } from '../src/eval/runEval'
import { buildKnowledgeIndex } from '../src/llm/knowledge'

const read = (f: string) => JSON.parse(readFileSync(`public/data/eurostat/energy/${f}`, 'utf8'))
const { docFreq } = buildKnowledgeIndex(read('knowledge.json').passages)
const results = await runEval(read('dictionary.json'), read('codelists.json'), undefined, undefined, docFreq)
for (const r of results) {
  const mark = r.verdict === 'correct' ? '✓' : r.verdict === 'asked' ? '?' : '✗'
  console.log(`${mark} [${r.lang}] ${r.text.padEnd(45)} expect ${r.expect.padEnd(10)} route ${r.route.padEnd(9)} rules ${String(r.rules).padEnd(10)} overlap ${r.fallback}${r.missing ? '  (expected option not offered!)' : ''}`)
}
const s = summarize(results)
console.log(`\n${s.correct}/${s.total} handled correctly by the rules alone, ${s.asked} offered as buttons, ${s.wrong} wrong.`)
console.log(`Word-overlap fallback top-1: ${s.fallbackTop1}/${s.total}.`)

if (s.wrong) process.exitCode = 1
