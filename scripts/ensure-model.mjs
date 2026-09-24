// Makes sure the language model is in public/models before `dev` and `build`, so the app always
// serves it itself (the browser never downloads it from the Hugging Face Hub).
// Quick check only: if every file is there, nothing is downloaded or re-hashed. Otherwise the
// full download runs once (scripts/download-model.mjs verifies sizes and SHA-256).
// A failed download does not stop dev/build: the dashboards work without the model, and the
// chat's free-form answers become available once the files are in place.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct'
const FILES = [
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_q4f16.onnx',
  'onnx/model_q4.onnx',
  'onnx/model_quantized.onnx',
]
const dir = join(process.cwd(), 'public/models', MODEL_ID)
const missing = FILES.filter((f) => !existsSync(join(dir, f)))

if (!missing.length) {
  console.log(`Model ready in ${dir}`)
} else {
  console.log(`Model files missing (${missing.length}); downloading ${MODEL_ID} once…`)
  const run = spawnSync(process.execPath, [join(process.cwd(), 'scripts/download-model.mjs')], { stdio: 'inherit' })
  if (run.status !== 0) {
    console.warn('\n⚠ Could not download the model. Dashboards still work; free-form chat answers need the model.')
    console.warn('  Retry later with: npm run model:download\n')
  }
}
