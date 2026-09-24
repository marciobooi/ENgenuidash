# ENgenuidash — Energy generative UI dashboard

A chat UI for European energy statistics whose language model runs entirely in the browser — no
backend. Built with React + Vite, styled with the
[Europa Component Library](https://ec.europa.eu/component-library/) (`@ecl/preset-eu`), and powered by
[Transformers.js](https://huggingface.co/docs/transformers.js) running ONNX Runtime in a Web Worker.

- Every device runs [Qwen3-0.6B](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX)
  (multilingual, Apache 2.0), downloaded once in the format that suits it. Phones and tablets are
  asked first (the download is about 0.6–0.9 GB); computers download it silently. Qwen3.5-0.8B was
  tried on computers and dropped: in the browser it was about 10× slower (47 s vs 4.5 s for the same
  answer) and its answers were not better.
- The ONNX Runtime wasm files are served from this app (`public/ort`, copied by `scripts/copy-ort.mjs`), not a CDN.
- The model is served by the app itself from `public/models` — the browser never contacts the Hugging Face Hub.
  It is downloaded automatically (once) the first time you run `npm run dev` or `npm run build`.

## Run

```bash
npm install
npm run dev
```

## Model files

The models are listed in `src/llm/models.json`. `npm run dev` and `npm run build` download them
into `public/models` on the first run (`scripts/ensure-model.mjs`): the file list comes from the Hub
API, only the parts the app uses are fetched, files are SHA-256
verified, and `public/models/manifest.json` records what is available. The folder is git-ignored
and copied into `dist/` by the build, so a deployment serves the models itself. If a download
fails, dev/build still continue: dashboards work without a model, and `npm run model:download`
retries it. Users never see any of this: the model loads silently in the background, and a failed
load is retried automatically.

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

## From a question to a dataset

`src/genui/planner.ts` turns a question into a plan (dataset, codes, countries, period):

1. **Curated routes** for the common indicators: prices, import dependency, renewable shares,
   degree days, energy intensity, per-capita values, monthly supply.
2. **Energy balances** for products and flows the concepts know (`src/genui/concepts.ts`).
3. **The dictionary** (`src/genui/datasetSearch.ts`) for everything else: question words are
   matched against the titles and code labels of all 141 datasets (EN/DE/FR, IDF-weighted, a light
   stemmer, German compounds split), so "solar capacity in Spain", "gas storage in Germany", "wood
   pellets", "LNG imports", "coal imports from Colombia" (partner country) or "crude oil imports by
   country of origin" (partner breakdown) reach the right dataset and codes without hand-written
   rules. A topic word found nowhere gives no dashboard instead of a guessed one; a dataset with no
   values for the selection is replaced by the next one about the same product.

`npm test` checks these routes (`src/genui/planner.test.ts`).

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

`src/llm/worker.ts` runs Qwen3-0.6B in a Web Worker, in the best format for the device: `q4f16` on
WebGPU with fp16 shaders, `q4` on other WebGPU devices; on CPU (WASM) `q8` on computers (faster)
and `q4` on phones (half the download). If a format fails to load (for example an operator a
browser's WebGPU lacks), the next one is tried.

- Tokenizer and weights load in parallel; model and ONNX Runtime files are kept in the Cache API.
- The KV cache is reused across turns when the new prompt extends the previous one, so follow-up
  questions only process the new tokens. History is capped (3 exchanges, 2,048 tokens).
- **Thinking** is supported but off (`"thinking": false` in `src/llm/models.json`): reasoning
  tokens delayed every answer by over a minute, and grounded answers gain little from it. When on,
  the `<think>` block is hidden (`src/llm/thinking.ts`, also when the chat template opens it in the
  prompt) and the worker closes the reasoning after `thinkingBudget` tokens. Option picking never uses thinking.
- All settings live in `src/llm/models.json` and travel with the files in
  `public/models/manifest.json`.
- Per-reply stats (time to first token, tokens/s, reused tokens) are logged in development.

The model is loaded only from `public/models` (atomic writes, SHA-256 verified against the Hub at
download time).

## Understanding follow-up messages

With a dashboard on screen, a message goes through these steps:

1. **Rules** (`src/genui/planner.ts`, `refinePlan`): "top 5", "add Germany", "in 2018", "as bar
   chart"… are applied instantly. Countries, years, units and codes come from the Eurostat
   dictionary and codelists.
2. **Action menu** (`src/genui/actions.ts`): if the rules cannot map the message, the app builds up
   to 8 concrete options from the current dashboard and shows the best four as buttons ("Did you
   mean…?"), most word overlap first. Each option is a canonical command run through the same
   rules, so it is always a valid plan. The model does not pick for the user: measured on the
   labelled follow-ups (`#/eval`), its picks were right 0 of 69 times, even when confident
   (`scoreActions` still measures it there, with contextual calibration).

"Explain these figures" never uses free generation: it quotes Eurostat's own description of the
dataset (from the knowledge base) followed by the computed summary and key insights.

### Measuring it

`src/eval/cases.ts` holds labelled follow-up messages (EN/DE/FR). Add one whenever a real message
is misunderstood.

```bash
npm test                  # unit tests: routing and guards, 69 labelled follow-ups, insights, thinking filter
npm run eval:actions      # rules + fallback, in Node
npm run dev               # then open http://localhost:5173/#/eval for the model's accuracy and speed
```

The `#/eval` page exists only in development builds.
