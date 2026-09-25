import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { questionLanguage } from './crossLingual'
import { groundQuestion, type Source } from './grounding'

/**
 * The prompt for a written answer: the question, the verified background (definitions, passages,
 * dataset information, a data slice unless the question is conceptual) and the answer language.
 * Shared by the chat and the evaluation page, so the evaluation measures what users get.
 */
export async function modelPrompt(
  question: string,
  dict: EnergyDictionary | null,
  codelists: EnergyCodelists | null,
  lang: string,
  { conceptual = false, signal, searchWith }: { conceptual?: boolean; signal?: AbortSignal; searchWith?: string } = {},
): Promise<{ prompt: string; sources: Source[] }> {
  const g = await groundQuestion(searchWith ?? question, dict, codelists, lang, signal, { includeData: !conceptual })
  // The background is English; say which language to answer in, every time (the history may
  // hold an earlier "Answer in German.").
  const answerIn = { en: 'Answer in English.', de: 'Answer in German.', fr: 'Answer in French.' }[questionLanguage(question, lang)]
  return { prompt: [question, g.context, answerIn].filter(Boolean).join('\n\n'), sources: g.sources }
}

/**
 * The model's explanation of the dashboard on screen ("Explain these figures"): what the indicator
 * measures, what the main figures show and the most notable change, in plain words. It gets only
 * the dashboard's own facts (Eurostat's description, the key insights, the numbers), so it can
 * rephrase and connect them, not look anything up. A small model can still get details wrong: the
 * reply is labelled as written by the assistant, with the figures and sources under it.
 */
export const EXPLAIN_SYSTEM_PROMPT = [
  'You explain energy statistics dashboards to people who are not experts.',
  'Use only the facts and numbers given in the message; never invent numbers, years or countries.',
  'Quote numbers with their unit and year.',
  'The figures are for the place named in the message (for example the EU-27), never for the world or other regions.',
  'Do not guess causes, policies or future trends that the facts do not state.',
  'Write three or four short sentences of plain prose: what the indicator measures, what the main figures show, and the most notable change.',
  'A change in percentage points is written "pp", never "percent".',
  'Do not use lists, headings or dataset codes.',
].join(' ')

export function explainPrompt(
  spec: { title: string; subtitle: string; summary: string[]; context: string; place?: string },
  facts: { description?: string; insights: string[] },
  lang: string,
): string {
  const answerIn = { en: 'Write in English.', de: 'Write in German.', fr: 'Write in French.' }[lang as 'en' | 'de' | 'fr'] ?? 'Write in English.'
  return [
    `Explain this dashboard: ${spec.title}${spec.subtitle ? ` (${spec.subtitle})` : ''}.`,
    spec.place ? `Place: ${spec.place} only.` : '',
    facts.description ? `What the indicator measures (Eurostat): ${facts.description}` : '',
    facts.insights.length ? `Key facts:\n${facts.insights.map((i) => `- ${i}`).join('\n')}` : '',
    spec.summary.length ? `Summary: ${spec.summary.join(' ')}` : '',
    `Data:\n${spec.context}`,
    answerIn,
  ]
    .filter(Boolean)
    .join('\n\n')
}
