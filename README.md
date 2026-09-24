# ENgenuidash — Energy generative UI dashboard

A chat UI for [SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct) that runs
entirely in the browser — no backend. Built with React + Vite, styled with the
[Europa Component Library](https://ec.europa.eu/component-library/) (`@ecl/preset-eu`), and powered by
[Transformers.js](https://huggingface.co/docs/transformers.js) running ONNX Runtime in a Web Worker.

- **WebGPU** is used when available (`q4f16`, ~275 MB); otherwise it falls back to **WASM/CPU** (`q4`, ~390 MB).
- The ONNX Runtime wasm files are served from this app (`public/ort`, copied by `scripts/copy-ort.mjs`), not a CDN.
- The model is served by the app itself from `public/models` — the browser never contacts the Hugging Face Hub.
  It is downloaded automatically (once) the first time you run `npm run dev` or `npm run build`.

## Run

```bash
npm install
npm run dev
```

## Model files

`npm run dev` and `npm run build` check `public/models` and download SmolLM2 there on the first run
(all three weight formats, ~1 GB, SHA-256 verified; `scripts/ensure-model.mjs`). The folder is
git-ignored and copied into `dist/` by the build, so a deployment serves the model itself. If the
download fails, dev/build still continue: dashboards work without the model, and
`npm run model:download` retries it. Users never see any of this: the model loads silently in the
background, and a failed load is retried automatically.

## Code

- `src/llm/worker.ts` — loads the model and streams generation (off the main thread)
- `src/llm/useLocalLLM.ts` — React hook wrapping the worker
- `src/App.tsx` — chat UI built from ECL components

## Eurostat energy dictionary

`public/data/eurostat/energy/` holds a dictionary of every dataset and table in the
[Eurostat energy database](https://ec.europa.eu/eurostat/web/energy/database) (the `nrg` folder):

- `dictionary.json` — folder tree, dataset/table codes and titles (EN/DE/FR), last update, period
  covered, number of values, API links, and each dataset's dimensions with the codes it actually uses.
  Per dataset also: `units`, `multipleUnits`, `unitsAreAlternatives` (same measure in different units vs.
  units that measure different things) and `defaults` (recommended unit, currency, tax, consumption band).
  A top-level `units` registry gives each unit's symbol, kind and EN/DE/FR label.
- `codelists.json` — labels (EN/DE/FR) for those codes: `SIEC`, `NRG_BAL`, `GEO`, `UNIT`, `NRG_PRC`, …

Regenerate it (takes a few seconds, uses the public Eurostat catalogue and SDMX APIs):

```bash
npm run eurostat:dictionary
```

In the app, `src/data/eurostat` loads the dictionary (`loadEnergyDictionary`, `loadEnergyCodelists`,
`searchDatasets`, `codeLabel`, `describeDataset`…) and fetches data straight from the Eurostat API in the
browser (`fetchEurostatData`, `toSeries` for charts). `describeDataset` produces the compact dataset card
(dimensions, allowed units, defaults) that is given to the language model, which is instructed to use only
the units and codes listed there.

## Energy knowledge base (our own, built from Eurostat documents)

Everything is downloaded once at build time and stored in our own files; the app never calls these
services at runtime:

- `glossary.json` — the official Statistics Explained **energy glossary** (53 entries, with aliases
  and links), used to answer "what is …?" questions word for word.
- `knowledge.json` — ~1,100 passages from the **reference metadata** of every energy dataset, the
  **Statistics Explained energy articles** and the glossary, each with its source, section, URL and date.

```bash
npm run eurostat:all        # dictionary + glossary + knowledge base
```

In the browser, `src/llm/knowledge.ts` searches the passages with BM25 (word pairs included, so
"heat pump" beats "heat"). Confident matches are answered by quoting Eurostat's own sentences with
their source; weaker matches are given to the language model as background. Reuse of Eurostat
content is authorised with acknowledgement: https://ec.europa.eu/eurostat/about-us/policies/copyright

## Local model runtime

`src/llm/worker.ts` runs SmolLM2-360M-Instruct in a Web Worker:

- WebGPU with `q4f16` weights when the GPU supports fp16 shaders, `q4` otherwise; CPU fallback uses `q8`.
- Tokenizer and weights load in parallel; model and ONNX Runtime files are kept in the Cache API.
- The KV cache is reused across turns when the new prompt extends the previous one, so follow-up
  questions only process the new tokens. History is capped (3 exchanges, 1,536 tokens).
- Per-reply stats (time to first token, tokens/s, reused tokens) are logged in development.

The model is loaded only from `public/models` (atomic writes, SHA-256 verified against the Hub at
download time).

## Understanding follow-up messages

With a dashboard on screen, a message goes through these steps:

1. **Rules** (`src/genui/planner.ts`, `refinePlan`): "top 5", "add Germany", "in 2018", "as bar
   chart"… are applied instantly. Countries, years, units and codes come from the Eurostat
   dictionary and codelists.
2. **Action menu** (`src/genui/actions.ts`): if the rules cannot map the message ("show the trend",
   "which countries depend the most?"), the app builds up to 8 concrete options from the current
   dashboard. Each option is a canonical command run through the same rules, so it is always a
   valid plan.
3. **Model pick**: SmolLM2 reads the numbered options and the app takes the probability of each
   option number as the next token (one forward pass, no free text — `choose` in the worker). A
   pick with probability ≥ `CHOICE_MIN_PROB` (`src/llm/config.ts`) is applied; otherwise, or while
   the model is loading, the best options are shown as buttons ("Did you mean…?").

"Explain these figures" never uses free generation: it quotes Eurostat's own description of the
dataset (from the knowledge base) followed by the computed summary and key insights.

### Measuring it

`src/eval/cases.ts` holds labelled follow-up messages (EN/DE/FR). Add one whenever a real message
is misunderstood.

```bash
npm run eval:actions      # rules + fallback, in Node
npm run dev               # then open http://localhost:5173/#/eval for the model's accuracy and speed
```

The `#/eval` page exists only in development builds.
