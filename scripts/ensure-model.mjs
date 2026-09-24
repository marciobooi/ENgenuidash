// Makes sure the language models are in public/models before `dev` and `build`, so the app
// always serves them itself (the browser never downloads a model from the Hugging Face Hub).
// Quick check only: if public/models/manifest.json lists every model of src/llm/models.json,
// nothing is downloaded or re-hashed. Otherwise the download runs once
// (scripts/download-model.mjs verifies sizes and SHA-256).
// A failed download does not stop dev/build: the dashboards work without a model, and the
// chat's free-form answers become available once the files are in place.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const models = JSON.parse(readFileSync(join(process.cwd(), 'src/llm/models.json'), 'utf8'))
const manifestPath = join(process.cwd(), 'public/models/manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
// Re-run when a model or its settings changed in models.json (the download skips valid files).
const same = (m, e) => e?.id === m.id && ['maxInputTokens', 'reuseCache', 'chatTemplate', 'thinking', 'thinkingBudget', 'generation'].every((k) => JSON.stringify(m[k]) === JSON.stringify(e[k]))
const missing = Object.entries(models).filter(([key, m]) => !key.startsWith('$') && !same(m, manifest[key]))

if (!missing.length) {
  console.log('Language models ready in public/models')
} else {
  console.log(`Downloading language models once: ${missing.map(([, m]) => m.id).join(', ')}…`)
  const run = spawnSync(process.execPath, [join(process.cwd(), 'scripts/download-model.mjs')], { stdio: 'inherit' })
  if (run.status !== 0) {
    console.warn('\n⚠ Could not download every model. Dashboards still work; free-form chat answers need a model.')
    console.warn('  Retry later with: npm run model:download\n')
  }
}
