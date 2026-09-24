/**
 * Separates a streamed reply into hidden reasoning and the visible answer. Qwen models with
 * thinking on start their reply with "<think> … </think>"; only what follows is shown. A reply
 * that does not start with "<think>" is shown as it arrives.
 *
 * Some chat templates (Qwen3.5 with enable_thinking) end the prompt with "<think>\n" themselves:
 * the reply then starts inside the reasoning, without an opening tag. Pass `promptOpened: true`
 * so everything up to "</think>" stays hidden.
 */
export class ThinkingFilter {
  constructor({ promptOpened = false }: { promptOpened?: boolean } = {}) {
    if (promptOpened) this.raw = '<think>'
  }

  private raw = ''
  /** Index in `raw` where the answer starts; -1 while undecided or still thinking. */
  private answerFrom = -1
  private emitted = 0

  /** Adds a chunk of model output; returns the new visible text (possibly empty). */
  push(chunk: string): string {
    this.raw += chunk
    if (this.answerFrom < 0) {
      const lead = this.raw.trimStart()
      if (!lead) return ''
      if (!lead.startsWith('<think>')) {
        // Could still become "<think>" once more characters arrive ("<thi").
        if ('<think>'.startsWith(lead)) return ''
        this.answerFrom = 0
      } else {
        const end = this.raw.indexOf('</think>')
        if (end < 0) return ''
        this.answerFrom = end + '</think>'.length
      }
    }
    return this.flush()
  }

  /** Thinking ran out of budget: whatever comes next is the answer. */
  forceAnswer() {
    this.answerFrom = this.raw.length
  }

  /** True while the model is inside its reasoning block. */
  get thinking(): boolean {
    return this.answerFrom < 0 && this.raw.trimStart().startsWith('<think>')
  }

  get answering(): boolean {
    return this.answerFrom >= 0
  }

  private flush(): string {
    const visible = this.raw
      .slice(this.answerFrom)
      .replace(/<\/?think>/g, '')
      .replace(/^\s+/, '')
    const out = visible.slice(this.emitted)
    this.emitted = visible.length
    return out
  }
}
