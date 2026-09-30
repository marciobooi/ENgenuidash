/**
 * Other ways of naming what a view shows, rewritten to the words its rules know, so "energy
 * passport of Germany", "how much does electricity cost in France" or "wie teuer ist Strom" reach
 * the country profile and the price dashboards instead of "I don't understand". Runs on the
 * prepared question (lower case, no accents, apostrophes as spaces; see prepare.ts), in English,
 * German and French. Only the routing reads the result; the chat keeps what was typed.
 */
const RULES: [RegExp, string][] = [
  // ---- the country energy profile ----
  [/\b(country )?energy (passports?|snapshots?|cards?|summary|summaries|picture|situation|landscape|portraits?|country reports?|reports?|in numbers|in figures|at a glance|state of play)\b/g, 'energy profile'],
  [/\b(country|national) (cards?|profiles?|passports?|snapshots?)\b/g, 'country profile'],
  [/\b(the )?(state|situation|picture) of (the )?energy\b/g, 'energy profile'],
  [/\bhow (is|are) (?:the )?(.+?) doing (?:on |in |with |regarding )?(?:the )?energy(?:[- ]?wise)?\b/g, 'energy profile of $2'],
  [/\bhow (?:the )?(.+?) (?:is|are) doing (?:on |in |with |regarding )?(?:the )?energy(?:[- ]?wise)?\b/g, 'energy profile of $1'],
  [/\b(everything|all|anything)(?: there is)?(?: to know)? (?:about|on) (?:the )?energy\b/g, 'energy profile'],
  [/\b(energiepass\w*|energiesteckbrief\w*|steckbrief|energieportrait\w*|energiesituation|energielage|energie in zahlen|energieuberblick\w*)\b/g, 'energy profile'],
  [/\bwie steht (.+?) energetisch da\b/g, 'energy profile of $1'],
  [/\balles (zu|zur|zum|uber) (die |der |den )?energie\b/g, 'energy profile'],
  [/\b(passeport energetique|fiche energie|fiche energetique|situation energetique|apercu energetique|etat des lieux energetique|portrait energetique|energie en chiffres|bilan de l energie de)\b/g, 'energy profile'],
  // ---- prices ----
  [/\b(?:getting|becoming|gets|becomes|become|going|growing) (?=(?:more |less )?(?:expensive|cheap|cheaper|costly|pricey|pricier))/g, ''],
  [/\b(?:more|less|most|least) (?:expensive|costly|cheap|pricey)\b/g, 'prices'],
  [/\b(expensive|pricey|pricier|cheap|cheaper|cheapest|costly|bills?|tariffs?)\b/g, 'prices'],
  // ("network costs and taxes" are price components, not prices: only "how much does … cost", "the cost of …", "pay for")
  [/\bhow much (?:does|do|will|would|is|are) (.+?) (?:cost|costs)\b/g, '$1 prices'],
  [/\b(?:the )?costs? of (electricity|gas|energy|power|heating|fuel|oil|petrol|diesel)\b/g, '$1 prices'],
  [/\b(?:pay|pays|paying|paid) for\b/g, 'prices for'],
  [/\b(teuer|teurer|teuerste\w*|billig\w*|gunstig\w*|kostet|kosten|rechnung\w*|tarife?)\b/g, 'prices'],
  [/\b(coute|coutent|couter|cout|cher|chere|chers|cheres|tarifs?|factures?|bon marche)\b/g, 'prices'],
]

/** The question with other names of a view's subject turned into the words the rules read. */
export function withCanonicalWords(q: string): string {
  let text = q
  for (const [re, to] of RULES) text = text.replace(re, to)
  // ("prices prices": both a synonym and the word itself were there)
  return text.replace(/\bprices(?: prices)+\b/g, 'prices').replace(/\s+/g, ' ').trim()
}
