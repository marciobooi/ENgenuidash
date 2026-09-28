# ENgenuidash — Claude working rules (token budget first)

Front-end-only generative UI dashboard for Eurostat **energy** data (React 19, Vite, TS, ECL, Highcharts via Webtools, EN/DE/FR, accessible, local Qwen models in public/models). Pitch: docs/PITCH.md.

## Start of every session
- Run `git log --oneline -15` (and `git diff --stat <last-known>..HEAD | tail -1`) to catch up: work also lands from other sessions. Read a commit (`git show --stat <sha>`) only when it touches the task.

## Save tokens — input
- Never read whole large files. Use `grep -n`, `sed -n 'a,bp'`, Read with offset/limit, or `jq` on JSON.
  Read tool denied: public/models, dist, node_modules. Hook blocks cat/less of those and package-lock.json,
  public/data/eurostat/energy/{knowledge,dictionary,codelists}.json (query them with jq/grep only).
- Search before reading: find the symbol, then read only that range. Don't re-read files you just edited.
- No subagents, workflows or parallel agents unless the user asks. Explore is for wide searches only.
- Pipe noisy commands: `npx vitest run <file> --reporter=dot 2>&1 | tail -20`, `npm run build 2>&1 | tail -15`,
  `git diff --stat` before `git diff <file>`, `git log --oneline -10`.
- Browser checks: prefer `get_page_text`/`read_page` (narrow with `ref_id`) over screenshots; screenshot only as final proof, `scale: 0.5`.
- Eval runs (#/eval): read the summary line/table, not every answer.

## Save tokens — output
- Short answers: result first, no recaps of what was done before, no restating the question, no option surveys — one recommendation.
- Code: minimal diffs with Edit; no full-file rewrites; no comments explaining the change.
- Tables only when comparing numbers.

## Skills / tools to use
- `graphify` — build/query a knowledge graph of the codebase instead of reading many files to understand structure.
- claude-mem `mem-search` / `smart_search` / `smart_outline` — recall past decisions and get file outlines cheaply (check it is working first).
- `task-observer` only at the start of multi-step tasks, not for quick questions.

## Standing constraints
- Models: local only (downloaded by scripts); ask before any new download (name, source, size, licence). Stick to Qwen.
- Commits: no attribution lines. Dev server: `preview_start {name:"dev"}`, never via Bash.
- Energy-only answers; translations (src/i18n.ts) + accessibility on every UI change.
- Eval sets: tune only on MODEL_CASES; HOLDOUT/VALIDATION are never tuned on (src/eval).
