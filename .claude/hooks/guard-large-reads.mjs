// PreToolUse (Bash): stops shell commands that would dump large files into the context.
// Allowed: grep, jq, head/tail, sed -n, wc, du, ls, git (they print a slice).
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8'))
const cmd = input.tool_input?.command ?? ''
const LARGE = /(public\/models\/|(^|[\s/])dist\/|node_modules\/|package-lock\.json|energy\/(knowledge|dictionary|codelists)\.json)/
const DUMP = /(^|[|;&]\s*)(cat|less|more|bat|strings|xxd|od)\s/

if (LARGE.test(cmd) && DUMP.test(cmd) && !/\|\s*(head|tail|wc|grep|jq)\b/.test(cmd)) {
  process.stderr.write('Blocked by token guard: this would print a large file. Use grep -n, jq, head/tail or sed -n on a range.\n')
  process.exit(2)
}
