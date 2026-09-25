import { normalize } from '../llm/energyScope'

/**
 * A question as people type it, made readable for the rules (route.ts). Many users are not native
 * English speakers, so before a question is routed:
 *
 *   1. request lead-ins are dropped: "show me", "tell me about", "mount/build/create a dashboard
 *      of", "I want to see", "zeig mir", "erstelle ein Dashboard zu", "montre-moi", "fais un tableau
 *      de bord sur"… ("what is" stays: without a place or period it asks for a definition);
 *   2. energy words and country names in other EU languages (Spanish, Italian, Portuguese, Polish,
 *      Dutch) become English keywords: "pobreza energética en España" → "energy poverty in spain";
 *   3. typing slips in words the app knows are corrected: "enrgy import dependancy" → "energy
 *      import dependency", "portgal" → "portugal" (see Vocabulary.correct).
 *
 * The chat shows what the user typed; only the routing reads the prepared text. The interface
 * (and the answers) stay in English, German or French.
 */

// ---------- 1. request lead-ins ----------

const OBJECT = '(?:an? |the |my |one )?(?:(?:new|interactive|nice|simple|quick) )?(?:dashboard|dash|chart|graph|plot|visuali[sz]ation|overview|report|table|page|view)s?'
const LEAD_INS = [
  // English
  `(?:please |pls |hi |hello |hey )+`,
  `(?:can|could|would|will) you (?:please )?(?:show|give|tell|make|build|create|mount|display|plot|draw|generate|get|find)(?: me| us)?(?: about)?`,
  `(?:i (?:want|would like|d like|wanna|need) (?:to )?(?:see|know|look at|have|get)?)`,
  `(?:show|give|tell|get|find|display|visuali[sz]e)(?: me| us)?(?: about| on)?`,
  `(?:make|build|create|mount|generate|open|prepare|do)(?: me| us)? ${OBJECT}(?: (?:of|for|about|on|with|showing|on the))?`,
  `(?:let me see|let s see|lets see|i m interested in|im interested in|info on|information on|data on|data about|numbers on|stats on|statistics on)`,
  `${OBJECT} (?:of|for|about|on|with)`,
  // German
  `(?:bitte |hallo )+`,
  `(?:kannst du|konnen sie|konntest du|konnten sie)(?: mir)?(?: bitte)?(?: (?:zeigen|geben|sagen|erstellen))?`,
  `(?:zeig|zeige|zeigen sie|gib|geben sie|sag|sagen sie)(?: mir| uns)?(?: bitte)?`,
  `(?:erstelle|erstellen sie|mach|mache|baue|bau)(?: mir)?(?: bitte)? (?:ein |eine |einen )?(?:dashboard|diagramm|grafik|ubersicht|tabelle)(?: (?:zu|zum|zur|uber|fur|mit))?`,
  `(?:ich mochte|ich will|ich hatte gern|ich hatte gerne)(?: gern| gerne)?(?: (?:sehen|wissen))?`,
  // French
  `(?:s il te plait |s il vous plait |bonjour |salut )+`,
  `(?:peux tu|pouvez vous|pourrais tu|pourriez vous)(?: me)?(?: (?:montrer|donner|dire|faire|creer|afficher))?`,
  `(?:montre|montrez|donne|donnez|dis|dites|affiche|affichez)(?: moi| nous)?`,
  `(?:fais|faites|cree|creez|construis|genere)(?: moi)? (?:un |une |le |la )?(?:tableau de bord|graphique|dashboard|apercu|tableau)(?: (?:sur|de|du|des|pour|avec))?`,
  `(?:je voudrais|je veux|j aimerais)(?: (?:voir|savoir|connaitre))?`,
]
const LEAD_IN = new RegExp(`^(?:${LEAD_INS.join('|')})\\b\\s*`)

/** Drops request lead-ins (repeatedly: "please can you show me a chart of …"). */
export function withoutLeadIns(q: string): string {
  let text = q
  for (let i = 0; i < 4; i++) {
    const next = text.replace(LEAD_IN, '').trim()
    if (next === text || !next) break
    text = next
  }
  return text
}

// ---------- 2. other EU languages → English keywords ----------

// Whole phrases first (before their words are translated one by one).
const PHRASES: [RegExp, string][] = [
  [/\b(pobreza energetica|poverta energetica|ubostwo energetyczne|energiearmoede|energie armoede)\b/g, 'energy poverty'],
  [/\b(energia elektryczna|energii elektrycznej)\b/g, 'electricity'],
  [/\b(gas natural|gas naturale|gas naturais|gaz ziemny|gazu ziemnego)\b/g, 'natural gas'],
  [/\b(paises bajos|paesi bassi|paises baixos)\b/g, 'netherlands'],
  [/\b(republica checa|repubblica ceca)\b/g, 'czechia'],
  [/\b(union europea|unione europea|uniao europeia|unia europejska|unii europejskiej|europese unie)\b/g, 'eu'],
]

// Word by word (normalised: no accents; Polish ł is read as l).
const WORDS: Record<string, string> = {}
const add = (english: string, words: string) => words.split(' ').forEach((w) => (WORDS[w] = english))
add('renewable', 'renovable renovables rinnovabile rinnovabili renovavel renovaveis odnawialne odnawialnych odnawialna odnawialnej hernieuwbare hernieuwbaar')
add('energy', 'energia energii energetica energetico energetyczna energetyczny energetyczne')
add('electricity', 'electricidad elettricita eletricidade elektrycznosc elektrycznosci elektriciteit stroom')
add('consumption', 'consumo consumos zuzycie konsumpcja verbruik')
// (Not French "gaz": French is read natively, "gaz naturel" included.)
add('gas', 'gazu aardgas')
add('oil', 'petroleo petrolio ropa ropy olie aardolie')
// (Not Spanish "carbón": "carbon" is English too, as in "carbon emissions".)
add('coal', 'carbone carvao wegiel wegla steenkool kolen')
add('nuclear', 'nucleare jadrowa jadrowej jadrowa kernenergie')
add('prices', 'precio precios prezzo prezzi preco precos cena ceny cen prijs prijzen')
add('imports', 'importaciones importazioni importacoes importy invoer')
add('dependency', 'dependencia dipendenza zaleznosc afhankelijkheid')
add('emissions', 'emisiones emissioni emissoes emisje emisji uitstoot emissies')
add('efficiency', 'eficiencia efficienza efektywnosc efficientie')
add('households', 'hogares famiglie domicilios agregados gospodarstwa gospodarstw huishoudens')
add('production', 'produccion produzione producao produkcja produkcji productie opwekking')
add('solar', 'solare solarna solarnej zonne')
add('wind', 'eolica eolico eolicas wiatrowa wiatrowej wiatru')
add('share', 'cuota participacion quota udzial aandeel')
add('industry', 'industria przemysl')
add('transport', 'transporte trasporti transportu vervoer')
add('supply', 'suministro approvvigionamento abastecimento dostawy levering')
add('poverty', 'pobreza poverta ubostwo armoede')
add('in', 'em w')
add('since', 'desde dal dalla od sinds')
// Countries (the native names, and the Polish forms used after "w": "w Polsce").
add('spain', 'espana spagna espanha hiszpania hiszpanii spanje')
add('italy', 'italia italie wlochy wloszech italie')
add('france', 'francia franca francja francji frankrijk')
add('germany', 'alemania germania alemanha niemcy niemczech duitsland')
add('portugal', 'portogallo portugalia portugalii')
add('poland', 'polonia polska polsce polen')
add('netherlands', 'holanda olanda holandia holandii nederland')
add('belgium', 'belgica belgio belgia belgii belgie')
add('greece', 'grecia grecja grecji griekenland')
add('sweden', 'suecia svezia szwecja szwecji zweden')
add('austria', 'austrii oostenrijk')
add('ireland', 'irlanda irlandia irlandii ierland')
add('denmark', 'dinamarca danimarca dania danii denemarken')
add('finland', 'finlandia finlandii')
add('hungary', 'hungria ungheria wegry wegrzech hongarije')
add('romania', 'rumania romenia rumunia rumunii roemenie')
add('czechia', 'chequia cechia czechy czechach tsjechie')
add('croatia', 'croacia croazia chorwacja chorwacji kroatie')
add('slovakia', 'eslovaquia slovacchia slowacja slowacji slowakije')
add('slovenia', 'eslovenia slowenia slowenii slovenie')
add('lithuania', 'lituania litwa litwie litouwen')
add('latvia', 'letonia lettonia lotwa lotwie letland')
add('estonia', 'estonii estland')
add('bulgaria', 'bulgarii bulgarije')
add('cyprus', 'chipre cipro cypr cyprze')
add('malta', 'malcie')
add('luxembourg', 'luxemburgo lussemburgo luksemburg luksemburgu luxemburg')
// Function words of those languages (dropped: the rules read the content words).
// (Not "das", "den" or "de": German and French are read natively.)
for (const w of 'del della dello delle degli los las gli nei nel nella dos het een voor por para com con uit dla oraz ile jak jaki jaka jakie qual quale quanto cuanto cual'.split(' ')) WORDS[w] = ''

/** Energy words and places in Spanish, Italian, Portuguese, Polish or Dutch, in English. */
export function toEnglishKeywords(q: string): string {
  let text = q
  for (const [re, en] of PHRASES) text = text.replace(re, en)
  return text
    .split(' ')
    .map((w) => (w in WORDS ? WORDS[w] : w))
    .filter(Boolean)
    .join(' ')
}

// ---------- all steps ----------

/**
 * The question for the rules: normalised (lower case, no accents), request lead-ins dropped,
 * other EU languages as English keywords, and typing slips corrected with `correct` (a known word
 * for an unknown one, or null).
 */
export function prepareQuestion(text: string, { unknownWords, correct }: { unknownWords?: (t: string) => string[]; correct?: (w: string) => string | null } = {}): string {
  let q = normalize(text)
    .replace(/[łŁ]/g, 'l')
    .replace(/[’'`´]/g, ' ')
    // French inversions: "peux-tu", "montre-moi", "pouvez-vous" (other hyphens stay: "non-energy").
    .replace(/-(tu|vous|moi|nous|toi|je|il|elle|on)\b/g, ' $1')
    .replace(/[,;!]/g, ' ')
    .replace(/[^a-z0-9?\-./ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Politeness at the end: "… please", "… bitte", "… s'il vous plaît".
    .replace(/\s+(please|pls|thanks|thank you|bitte|danke|s il (te|vous) plait|svp|stp|merci)\s*\??$/, '')
  // "whats" is "what is" (a definition question stays one).
  q = q.replace(/\bwhats\b/g, 'what is')
  q = withoutLeadIns(q)
  q = toEnglishKeywords(q)
  if (unknownWords && correct) {
    for (const w of new Set(unknownWords(q))) {
      const fixed = correct(w)
      if (fixed) q = q.replace(new RegExp(`\\b${w}\\b`, 'g'), fixed)
    }
  }
  return q
}
