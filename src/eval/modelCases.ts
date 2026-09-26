/**
 * Written answers from the knowledge base (public/data/eurostat/energy/knowledge.json): questions
 * whose answer is in Eurostat's articles, dataset descriptions or glossary, with the facts a
 * correct answer must contain. Used to tune the model's answers (retrieval, prompt, generation):
 * each case is scored twice, on whether the facts reached the prompt (retrieval) and whether the
 * answer states them (the model).
 *
 * `facts`: every group must be matched by one of its variants (case and accents ignored).
 * `never`: statements that would be wrong.
 */
export interface ModelCase {
  q: string
  lang: 'en' | 'de' | 'fr'
  facts: string[][]
  never?: string[]
}

export const MODEL_CASES: ModelCase[] = [
  // Renewables (Renewable energy statistics)
  { q: "What is the EU's 2030 target for renewable energy?", lang: 'en', facts: [['42.5', '42,5']] },
  { q: "What share of the EU's energy came from renewable sources in 2025?", lang: 'en', facts: [['26.2', '26,2']] },
  { q: 'What share of household space heating in the EU is renewable?', lang: 'en', facts: [['32.3', '32,3']] },
  // Households (Energy consumption in households, Electricity and heat statistics)
  { q: 'What do EU households use most of their energy for?', lang: 'en', facts: [['heating'], ['61.5', '61,5']], never: ['cooking is the main', 'lighting is the main'] },
  { q: 'How much electricity does an EU household use per person?', lang: 'en', facts: [['1.6 mwh', '1 545', '1545', '1,545', '1.6 megawatt']] },
  { q: 'Which EU countries have the highest household electricity consumption per person?', lang: 'en', facts: [['finland', 'sweden']] },
  // Coal (Coal production and consumption statistics)
  { q: 'How much hard coal did the EU produce in 2025?', lang: 'en', facts: [['44 million', '44 mt']] },
  { q: 'When did solar overtake coal as a source of electricity in the EU?', lang: 'en', facts: [['2024']] },
  { q: 'How dependent is the EU on imports of solid fossil fuels?', lang: 'en', facts: [['34.2', '34,2']] },
  { q: 'When did the EU ban coal imports from Russia?', lang: 'en', facts: [['2022']] },
  // Oil (Emergency oil stocks statistics)
  { q: 'Why does the EU keep emergency oil stocks?', lang: 'en', facts: [['secur'], ['import']], never: ['renewable'] },
  // Prices (Electricity price statistics, gas price metadata)
  { q: 'What does the electricity price for households consist of?', lang: 'en', facts: [['network'], ['tax']] },
  { q: 'In which EU country do taxes make up the largest share of the household electricity price?', lang: 'en', facts: [['denmark']] },
  // Efficiency (Energy efficiency statistics)
  { q: "Was the EU's primary energy consumption on track for its 2030 target in 2024?", lang: 'en', facts: [['21.1', '21,1'], ['above']], never: ['below the 2030 target', 'was on track', 'is on track', 'remains on track'] },
  // Definitions (glossary, dataset descriptions)
  { q: 'What is gross available energy?', lang: 'en', facts: [['suppl', 'available for all activities', 'energy available']] },
  { q: 'How is the share of fossil fuels in gross available energy calculated?', lang: 'en', facts: [['fossil'], ['divid', 'ratio', 'total']] },
  // Conceptual (no single figure)
  { q: 'Why do countries with more renewables depend less on energy imports?', lang: 'en', facts: [['domestic', 'own production', 'produce', 'import less', 'less import', 'self', 'local']], never: ['not related'] },
  { q: 'Why is natural gas important for electricity production?', lang: 'en', facts: [['flexib', 'reliab', 'stable', 'balanc', 'backup', 'demand', 'peak', 'supply']], never: ['renewable energy source'] },
  // German
  { q: 'Was ist das Ziel der EU für erneuerbare Energien bis 2030?', lang: 'de', facts: [['42,5', '42.5']] },
  // (English variants too: the documents are English, so that is how the facts reach the prompt.)
  { q: 'Wofür verbrauchen Haushalte in der EU die meiste Energie?', lang: 'de', facts: [['heiz', 'raumwarme', 'raumwärme', 'warme', 'wärme', 'heating']] },
  { q: 'Wann hat Solarstrom in der EU die Kohle überholt?', lang: 'de', facts: [['2024']] },
  // French
  { q: "Quelle part de l'énergie de l'UE provenait des sources renouvelables en 2025 ?", lang: 'fr', facts: [['26,2', '26.2']] },
  { q: "Pourquoi l'UE détient-elle des stocks pétroliers d'urgence ?", lang: 'fr', facts: [['securite', 'sécurité', 'security'], ['import']] },
  { q: "Combien de houille l'UE a-t-elle produite en 2025 ?", lang: 'fr', facts: [['44 millions', '44 million']] },
]

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u00a0/g, ' ')

/** The fact groups of a case that `text` does not contain (none: all there). */
export function missingFacts(c: ModelCase, text: string): string[] {
  const t = norm(text)
  return c.facts.filter((group) => !group.some((v) => t.includes(norm(v)))).map((group) => group.join(' | '))
}

/** Problems of a written answer: missing facts, wrong statements, numbers not in its sources. */
export function answerProblems(c: ModelCase, answer: string, source?: string): string[] {
  const t = norm(answer)
  return [
    ...missingFacts(c, answer).map((f) => `missing ${f}`),
    ...(c.never ?? []).filter((w) => t.includes(norm(w))).map((w) => `says "${w}"`),
    ...(source === undefined ? [] : unsupportedNumbers(answer, source).map((n) => `number not in the sources: ${n}`)),
  ]
}

/** A number as written in EN/DE/FR ("1,545", "1 545", "42,5 %") → its value as text ("1545", "42.5"). */
function numberValues(text: string): string[] {
  return (text.replace(/\u00a0|\u202f/g, ' ').match(/\d{1,3}(?:[ ,.]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g) ?? []).map((n) => {
    const grouped = /^\d{1,3}(?:[ ,.]\d{3})+/.test(n) && !/^\d+[.,]\d{1,2}$/.test(n)
    const plain = grouped ? n.replace(/[ ,.](?=\d{3}(\D|$))/g, '') : n
    return String(Number(plain.replace(',', '.')))
  })
}

/**
 * Numbers in an answer that are not in its sources (the prompt or the quoted passage): invented
 * figures ("19 billion tons of hard coal"). Small numbers (below 10) are left out: counts and
 * list items ("three countries") are too common to check.
 */
export function unsupportedNumbers(answer: string, source: string): string[] {
  const known = new Set(numberValues(source))
  return [...new Set(numberValues(answer))].filter((n) => Number(n) >= 10 && !known.has(n))
}
