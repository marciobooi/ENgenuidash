import { normalize } from '../llm/energyScope'
import { withCanonicalWords } from './synonyms'

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
  `(?:please |pls |hi |hello |hey |uh+ |um+ |er+ |erm |ok |okay |so |like |well |hmm+ |just |actually |basically )+`,
  `(?:can|could|would|will) you (?:please )?(?:show|give|tell|make|build|create|mount|display|plot|draw|generate|get|find)(?: me| us)?(?: about)?`,
  `(?:i (?:want|would like|d like|wanna|need) (?:to )?(?:see|know|look at|have|get)?)`,
  `(?:show|give|tell|get|find|display|visuali[sz]e)(?: me| us)?(?: about| on)?`,
  `(?:make|build|create|mount|generate|open|prepare|do)(?: me| us)? ${OBJECT}(?: (?:of|for|about|on|with|showing|on the))?`,
  `(?:let me see|let s see|lets see|i m interested in|im interested in|info on|information on|data on|data about|numbers on|stats on|statistics on)`,
  `${OBJECT} (?:of|for|about|on|with)`,
  `(?:do you (?:have|know)(?: any| some)?(?: about| on)?)`,
  `(?:is there (?:any |some )?(?:data|info|information|stats|statistics|numbers|figures)? ?(?:on|about|for|of)?)`,
  `(?:i wonder|quick question|one question|question)(?: about)? ?`,
  `(?:i (?:need|want|d like|would like|am looking for|m looking for|look for)(?: to)?(?: (?:understand|learn about|check|compare|explore))?(?: an?| the)?)`,
  `(?:take a look at|have a look at|look at|check out|explore|analy[sz]e)`,
  `(?:an? )?(?:overview|summary|snapshot|picture|look) (?:of|on|at|for)`,
  // German
  `(?:bitte |hallo )+`,
  `(?:ich (?:brauche|suche|interessiere mich fur))`,
  `(?:hast du|haben sie|gibt es)(?: (?:daten|infos?|informationen|zahlen))?(?: (?:zu|zum|zur|uber))?`,
  `(?:was ist mit|wie sieht es (?:mit|in|bei))`,
  `(?:zeig|zeige) mir mal`,
  `(?:kannst du|konnen sie|konntest du|konnten sie)(?: mir)?(?: bitte)?(?: (?:zeigen|geben|sagen|erstellen))?`,
  `(?:zeig|zeige|zeigen sie|gib|geben sie|sag|sagen sie)(?: mir| uns)?(?: bitte)?`,
  `(?:erstelle|erstellen sie|mach|mache|baue|bau)(?: mir)?(?: bitte)? (?:ein |eine |einen )?(?:dashboard|diagramm|grafik|ubersicht|tabelle)(?: (?:zu|zum|zur|uber|fur|mit))?`,
  `(?:ich mochte|ich will|ich hatte gern|ich hatte gerne)(?: gern| gerne)?(?: (?:sehen|wissen))?`,
  // French
  `(?:avez vous|as tu|y a t il)(?: des?)?(?: (?:donnees|infos?|informations|chiffres))?(?: (?:sur|de))?`,
  `(?:parle moi de|parlez moi de|dis moi ce qu il en est de)`,
  `(?:j ai besoin de|je cherche)`,
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
const PHRASES: [RegExp, string | ((...match: string[]) => string)][] = [
  // Definition and "why" questions: "qué es la energía solar", "cos è il biogas", "co to jest biogaz", "por qué es importante la eficiencia energética".
  [/^(que es|que significa|que quer dizer|cos e|che cos e|cosa significa|o que e|co to jest|co znaczy|wat is|wat betekent)\s+(?:(?:la|el|lo|l|un|una|il|uno|o|a|um|uma|de|het|een|le)\s+)?/, 'what is '],
  [/^(por que|porque|perche|dlaczego|waarom)\s+(?:es |e |sono |jest |is |sa |son )?(?:importante|importanti|wazn\w+|belangrijk\w*)\s+(?:(?:la|el|lo|l|las|los|le|i|gli|a|o|as|os|de|het)\s+)?(.+)$/, 'why is $2 important'],
  // Energy flow diagram: "flusso di energia", "przepływ energii", "energiestroom".
  [/\b(flusso|flussi|flujo|flujos|fluxo|fluxos|przeplyw|przeplywy|przeplywu) (de |di |del |do |da |of |van |w )?(energia|energii|energetyczny|energetici|energetico|energetica)\b/g, 'energy flow'],
  [/\bflussi energetici\b/g, 'energy flows'],
  [/\benergiestro(?:om|men)(?:diagram\w*)?\b/g, 'energy flow'],
  // Profile and balance in Dutch and Portuguese: "energieprofiel", "perfil de energia", "energiebalans".
  [/\b(perfil|profilo|profil) (de |di |del |dell |of )?(energia|energii)\b/g, 'energy profile'],
  [/\benergie ?profiel\b/g, 'energy profile'],
  [/\benergie ?balans(en)?\b/g, 'energy balance'],
  // Trade: "de dónde importa España el gas", "da dove importa l'Italia il gas", "skąd Polska importuje gaz", "waar importeert Nederland gas vandaan".
  [/\b(de donde|da dove|de onde|skad|waar)\b/g, 'where does'],
  [/\b(gas|olie|aardolie|kolen|elektriciteit)leveranciers\b/g, '$1 suppliers'],
  // Price components: "composición del precio de la electricidad", "składniki ceny energii elektrycznej", "samenstelling van de elektriciteitsprijs".
  [/\b(componentes|componenti|skladniki|componenten|onderdelen|composicion|composizione|composicao|samenstelling|desglose|scomposizione|rozbicie|uitsplitsing|decomposicao)\b(?: (?:de|del|dello|della|di|do|da|van|dei|of|ceny|cen))*(?: (?:el|la|il|o|a|het|de|l)\b)* ?(?:precio|prezzo|preco|prijs|prices?|ceny|cen)s?\b(?: (?:de|della|del|do|da|van|dell|di))*(?: (?:la|el|l|a|o|il)\b)*(?: (electricidad|elettricita|eletricidade|elektriciteit|electricity|stroom|gas|gazu|gaz|energia))?/g, (_m: string, _w: string, fuel?: string) => `${/electric|elettric|eletric|elektric|stroom/.test(fuel ?? '') ? 'electricity' : /gas/.test(fuel ?? '') ? 'gas' : 'energy'} price components`],
  [/\b(composicion|composizione|composicao|samenstelling)(?: (?:del|dello|della|do|da|van|de|di))*(?: (?:el|la|il|o|a|het|l)\b)* ?(?:elektriciteitsprijs|gasprijs)\b/g, 'energy price components'],
  [/\belektriciteitsprijz?en\b|\belektriciteitsprijs\b/g, 'electricity price'],
  [/\belektriciteits(productie|verbruik)\b/g, 'electricity $1'],
  // Dutch compounds: "gasverbruik", "elektriciteitsproductie", "energieprijs".
  [/\b(gas|olie|kolen|energie|elektriciteits)(verbruik|productie|prijs|prijzen)\b/g, (_m: string, what: string, kind: string) => `${what === 'elektriciteits' ? 'electricity' : what === 'energie' ? 'energy' : what} ${kind === 'verbruik' ? 'consumption' : kind === 'productie' ? 'production' : 'price'}`],
  [/\b(oil|olie|energie)crisis\b/g, (_m: string, w: string) => `${w === 'energie' ? 'energy' : 'oil'} crisis`],
  // Monthly data in Dutch.
  [/\b(wedlug|wg) (kraju )?(pochodzenia|przeznaczenia)\b|\bper land van (herkomst|oorsprong)\b/g, 'by country of origin'],
  [/\b(maandelijks\w*|per maand)\b/g, 'monthly'],
  // Renewables: "cuota de energías renovables", "quota rinnovabili", "udział odnawialnych", "aandeel hernieuwbare energie".
  [/\b(quota|cuota|participacion|udzial|aandeel|parte|parcela|participacao)\s+(?:(?:de|di|dell|dei|del|da|do|van|w)\s+)?(?:(?:energias?|energii|energie|energia)\s+)?(?:renovables?|rinnovabili|renovaveis|renovavel|odnawialn\w*|hernieuwbare)(?:\s+(?:energie|energia|energias|energii))?/g, 'renewable shares'],
  [/\b(suministro|approvvigionamento|abastecimento|dostawy|aanbod|oferta|fornitura|fornecimento) (de |di |do |da |of |van )?(biomasa|biomassa|biomasy)\b/g, 'biomass supply'],
  // Reporting dashboards in Dutch and Polish; oil security.
  [/\bdywersyfikacja (zrodel )?energii\b/g, 'diversification of energy sources'],
  [/\b(gas natural licuado|gas naturale liquefatto|gas natural liquefeito|gaz ziemny skroplony|vloeibaar aardgas)\b/g, 'liquefied natural gas'],
  [/\b(intensidad|intensita|intensidade|intensywnosc|intensiteit) (energetica|energetico|energetyczna|energetische)\b|\benergie[- ]intensiteit\b/g, 'energy intensity'],
  [/\b(energia|energii) (wodna|wodnej)\b/g, 'hydropower'],
  [/\benergie[- ]efficientie\b/g, 'energy efficiency'],
  [/\bzaleznosc energetyczna od krajow trzecich\b/g, 'energy dependence on third countries'],
  [/\b(olie|aardolie)zekerheid\b/g, 'oil security'],
  [/\b(pobreza energetica|poverta energetica|ubostwo energetyczne|energiearmoede|energie armoede)\b/g, 'energy poverty'],
  [/\b(energia elektryczna|energii elektrycznej)\b/g, 'electricity'],
  [/\b(perfil|profilo|profil) (energetico|energetica|energetyczny|energetico)\b/g, 'energy profile'],
  [/\b(pasaporte|passaporto|passaporte|paszport) (energetico|energetica|energetyczny)\b/g, 'energy passport'],
  [/\b(balance|bilancio|balanco|bilans) (energetico|energetica|energetyczny|energetico)\b/g, 'energy balance'],
  [/\b(diagrama|diagramma|diagram) (de |dei |di |del |of )?(flujos?|flussi|fluxos?|przeplywu) (de |di |del )?(energia|energetici|energetica|energii)\b/g, 'energy flow diagram'],
  [/\b(flujos? de energia|flussi di energia|fluxos? de energia)\b/g, 'energy flows'],
  [/\b(por|per) (mes|meses|mese|mesi)\b|\b(al mes|mensual\w*|mensile|mensili|mensal|mensais|miesieczn\w*)\b/g, 'monthly'],
  [/\b(por|per) (pais|paese|paises|paesi) (de |di |d )?(origen|origine|origem)\b/g, 'by country of origin'],
  [/\bde donde (importa|compra|obtiene|recibe|importan) (el |la )?(gas|petroleo|electricidad|carbon)\b/g, 'imports of $3 by partner'],
  [/\b(quien|quién) (suministra|vende|abastece) (el |la )?(gas|petroleo|electricidad)\b/g, 'who supplies $4'],
  [/\b(cuadro de mando|tablero de control|cruscotto di controllo|painel de controlo|painel de controle|panel de control)\b/g, 'dashboard'],
  [/\b(eficiencia energetica|efficienza energetica|efektywnosc energetyczna|energie efficientie|energy efficientie)\b/g, 'energy efficiency'],
  [/\b(seguridad energetica|sicurezza energetica|seguranca energetica|bezpieczenstwo energetyczne|energiezekerheid|seguridad de suministro|seguridad del suministro|seguridad de abastecimiento|sicurezza dell approvvigionamento|seguranca de abastecimento)\b/g, 'energy security'],
  [/\b(dependencia energetica|dipendenza energetica|zaleznosc energetyczna|energieafhankelijkheid)\b/g, 'energy dependency'],
  [/\b(dependencia de terceros paises|dipendenza dai paesi terzi|dependencia de paises terceiros|zaleznosc od krajow trzecich|afhankelijkheid van derde landen)\b/g, 'energy dependence on third countries'],
  [/\b(reservas|scorte|zapasy|voorraden) (de |di |del |of |van )?(petroleo|petrolio|ropy|aardolie|crudo)\b|\b(seguridad|sicurezza|seguranca|bezpieczenstwo) (petrolera|petrolifera|petrolifera|naftowe?|olie)\b/g, 'oil security'],
  [/\b(petroleo|petrolio|ropa|aardolie) (reservas|scorte|zapasy|voorraden)\b/g, 'oil security'],
  [/\b(terceros paises|paesi terzi|paises terceiros|kraje trzecie|derde landen)\b/g, 'third countries'],
  [/\b(energias? renovables?|energie rinnovabili|energia rinnovabile|energias? renovaveis|energia renovavel|energia odnawialna|odnawialne zrodla energii|hernieuwbare energie)\b/g, 'renewable energy'],
  [/\b(capacidad instalada|capacita installata|capacidade instalada|zainstalowana moc|geinstalleerd vermogen|capacidad de energia)\b/g, 'installed capacity'],
  [/\b(energia solar|energia solare|energia sloneczna|zonne energie|zonne-energie)\b/g, 'solar energy'],
  [/\b(energia eolica|energia eolica|energia wiatrowa|windenergie)\b/g, 'wind energy'],
  [/\b(calefaccion|riscaldamento|aquecimento|ogrzewanie|verwarming) (renovable|rinnovabile|renovavel|odnawialne|hernieuwbare)\b/g, 'renewable heating'],
  [/\b(consumo final de energia|consumo de energia final|consumo finale di energia|zuzycie energii finalnej)\b/g, 'final energy consumption'],
  [/\b(consumo de energia primaria|consumo di energia primaria|zuzycie energii pierwotnej)\b/g, 'primary energy consumption'],
  [/\b(facturas de (la )?(luz|electricidad|gas)|bollette (della luce|del gas)|faturas de (eletricidade|gas))\b/g, 'prices'],
  // (English as people who speak another language put it: "energetic poverty", "renewable energies", "poverty energetic")
  [/\b(energetic|energetical) (poverty|dependence|dependency|security|efficiency|independence|situation|balance|consumption|transition|profile|passport)\b/g, 'energy $2'],
  [/\b(poverty|dependence|dependency|security|efficiency|independence|situation|balance|consumption|transition|profile|passport) (energetic|energetical)\b/g, 'energy $1'],
  [/\b(renewables?) energies\b/g, 'renewable energy'],
  [/\b(renewable|clean|green|solar|wind) energies\b/g, '$1 energy'],
  [/\b(gas natural|gas naturale|gas naturais|gaz ziemny|gazu ziemnego)\b/g, 'natural gas'],
  [/\b(paises bajos|paesi bassi|paises baixos)\b/g, 'netherlands'],
  [/\b(republica checa|repubblica ceca)\b/g, 'czechia'],
  [/\b(union europea|unione europea|uniao europeia|unia europejska|unii europejskiej|europese unie)\b/g, 'eu'],
]

// Word by word (normalised: no accents; Polish ł is read as l).
const WORDS: Record<string, string> = {}
const add = (english: string, words: string) => words.split(' ').forEach((w) => (WORDS[w] = english))
add('technology', 'tecnologia tecnologias tecnologie technologia technologie technologii')
add('sector', 'sectores settore settori sektory sektorze')
add('by', 'por door przez')
add('origin', 'origen origine origem pochodzenia')
add('taxes', 'impuestos imposte impostos podatki belastingen')
add('breakdown', 'desglose scomposizione decomposicao rozbicie uitsplitsing')
add('', 'dell dello dall nell sull')
add('capacity', 'capacidad capacita capacidade capacidades pojemnosc moc capaciteit vermogen')
add('installed', 'instalada instalado installata installato zainstalowana geinstalleerd')
add('dashboard', 'panel cuadro tablero cruscotto painel pulpit dashboard')
add('hydro', 'hidraulica hidroelectrica idroelettrica hidroeletrica wodna')
add('biomass', 'biomasa biomassa biomasy')
add('heating', 'calefaccion riscaldamento aquecimento ogrzewanie verwarming')
add('buildings', 'edificios edifici edificios budynki gebouwen')
add('security', 'seguridad sicurezza seguranca bezpieczenstwo veiligheid')
add('bills', 'facturas bollette faturas rachunki rekeningen')
add('renewable', 'renovable renovables rinnovabile rinnovabili renovavel renovaveis odnawialne odnawialnych odnawialna odnawialnej hernieuwbare hernieuwbaar')
add('energy', 'energia energii energetica energetico energetyczna energetyczny energetyczne')
add('electricity', 'electricidad elettricita eletricidade elektrycznosc elektrycznosci elektriciteit stroom')
add('consumption', 'consumo consumos zuzycie konsumpcja verbruik')
// (Not French "gaz": French is read natively, "gaz naturel" included.)
add('gas', 'gazu aardgas')
add('oil', 'petroleo petrolio ropa ropy olie aardolie petrolifera petrolera petroleira petroliferos naftowe naftowy')
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
add('import', 'importa importan importar importuje importuja importeert importeren compra acquista kupuje koopt')
add('suppliers', 'proveedores proveedor fornitori fornitore fornecedores fornecedor dostawcy dostawca leveranciers leverancier')
add('sankey', 'sankeya sankeyem')
add('stocks', 'existencias scorte zapasy voorraden')
add('transport', 'transporcie')
add('indicators', 'indicadores indicatori wskazniki indicatoren')
add('crisis', 'crisi kryzys crise')
add('', 'vandaan')
add('since', 'desde dal dalla od sinds')
// Countries (the native names, and the Polish forms used after "w": "w Polsce").
add('spain', 'espana spagna espanha hiszpania hiszpanii spanje')
add('italy', 'italia italie wlochy wloszech wloch italie')
add('france', 'francia franca francja francji frankrijk')
add('germany', 'alemania germania alemanha niemcy niemczech niemiec duitsland')
add('portugal', 'portogallo portugalia portugalii')
add('poland', 'polonia polska polsce polen polski')
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
for (const w of 'del della dello delle degli los las gli nei nel nella dos het een voor por para com con uit dla oraz ile jak jaki jaka jakie qual quale quanto cuanto cual el il lo'.split(' ')) WORDS[w] = ''

/** Energy words and places in Spanish, Italian, Portuguese, Polish or Dutch, in English. */
export function toEnglishKeywords(q: string): string {
  let text = q
  for (const [re, en] of PHRASES) text = text.replace(re, en as string)
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
  q = withCanonicalWords(toEnglishKeywords(q))
  if (unknownWords && correct) {
    for (const w of new Set(unknownWords(q))) {
      const fixed = correct(w)
      if (fixed) q = q.replace(new RegExp(`\\b${w}\\b`, 'g'), fixed)
    }
  }
  return q
}
