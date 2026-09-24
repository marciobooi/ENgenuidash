import type { EnergyCodelists, EnergyDictionary } from '../data/eurostat'
import { plannerTerms } from '../genui/concepts'
import { hasEnergySignal, normalize } from './energyScope'

/**
 * Meaningfulness check: every content word of a question must be something ENgenuidash knows —
 * energy vocabulary (dictionary, codelists, glossary, knowledge base), a place, a number or an
 * ordinary question/analysis word. "What is the date of oil?" or "What colour is natural gas?"
 * contain an energy word but ask about something the data does not cover, so they get a
 * clarification instead of a dashboard or a generated answer.
 */

// Ordinary question and analysis words (EN/DE/FR, accent-free). Stop words are ignored anyway.
const QUESTION_WORDS = new Set(
  (
    // English
    'what which who whom whose why how when where much many show display give tell list compare comparison compared ' +
    'versus between difference differences differ different same similar change changes changed trend trends evolution ' +
    'evolve develop developed development growth grow grew grown increase increased increasing decrease decreased ' +
    'decreasing rise rose risen fall fell fallen drop dropped decline declined highest lowest largest smallest biggest ' +
    'most least top bottom rank ranking ranked average mean median total overall latest current recent today now year ' +
    'years month months monthly annual annually yearly per capita head person level levels rate rates value values number ' +
    'numbers amount amounts figure figures statistic statistics data dataset datasets table chart charts graph map bar ' +
    'bars line lines pie area only just also please explain explanation define definition meaning means useful important ' +
    'importance role impact impacts effect effects affect affects matter matters reason reasons cause causes benefit ' +
    'benefits advantage advantages disadvantage disadvantages purpose relevant main key cheap cheaper cheapest expensive ' +
    'costly high higher low lower since until from last past next previous first latest dependent depend depends work ' +
    'works working calculate calculated calculation calculations measure measured measurement include included includes ' +
    'exclude excluded country countries member state states region regions europe european union world global breakdown ' +
    'split mix composition source sources come comes coming happen happened happening full history historical ever ' +
    'available availability typical standard normal good bad best worst big small large share percentage percent part ' +
    'parts type types kind kinds category categories sector sectors use used using help does did done make made produce ' +
    'produced much more less fewer about there here this that these those their them they its were been being have has ' +
    'had would could should will can may might must shall add remove instead without with only except versus vs'
  )
    .concat(
      ' ' +
        // German
        'wie was welche welcher welches wer warum wann viel viele zeige zeigen gib vergleich vergleiche vergleichen unterschied ' +
        'unterschiede hoch hoher hochste hochsten niedrig niedriger niedrigste entwicklung trend anstieg ruckgang durchschnitt ' +
        'gesamt insgesamt aktuell aktuelle heute jahr jahre jahren jahres monat monate monatlich jahrlich pro kopf anteil wert ' +
        'werte daten tabelle diagramm karte erklare erklaren erklarung bedeutung bedeutet definition wichtig rolle wirkung ' +
        'grund grunde vorteil vorteile teuer billig gunstig seit bis letzten land lander mitgliedstaaten nutzlich funktioniert ' +
        'berechnet gemessen quelle quellen verteilung aufteilung entwickelt gestiegen gesunken steigt sinkt mehr weniger ' +
        'gross klein art arten sektor sektoren nur auch bitte hinzufugen entfernen ohne',
      ' ' +
        // French
        'quel quelle quels quelles qui pourquoi comment quand combien montre montrer affiche donne compare comparer comparaison ' +
        'difference differences evolution tendance hausse baisse augmentation diminution plus moins eleve elevee elevees bas ' +
        'basse moyenne total totale actuel actuelle aujourd hui annee annees mois mensuel mensuelle annuel annuelle par ' +
        'habitant part valeur valeurs donnees tableau graphique carte explique expliquer explication definition signifie sens ' +
        'important importante role impact raison raisons avantage avantages cher chere bon marche depuis jusqu dernier ' +
        'derniers dernieres pays etats membres utile fonctionne calcule calculee mesure source sources repartition type types ' +
        'secteur secteurs seulement aussi ajoute ajouter retire sans avec',
      ' ' +
        // Conversational filler (EN/DE/FR): "add France too please", "can you show me…", "bitte auch"
        'too please pls thanks thank okay yes yeah can could would like want wanna need see let lets look again well ' +
        'maybe perhaps actually rather very really still yet already both either neither one two three four five some ' +
        'few several plus another else whole every each all put include take give get keep change switch replace ' +
        'bitte danke noch mal gerne kannst konnen konntest mochte mochten will wollen brauche sehen zeig nimm fuge ' +
        'alle beide jetzt dann wieder ja okay eins zwei drei ' +
        'merci stp svp encore peux pouvez pourrais pourriez voudrais veux voir mets ajoute enleve tous toutes deux ' +
        'trois oui maintenant ensuite aussi bien',
      ' ' +
        // Words used to steer a dashboard ("I prefer columns", "Germany alone", "go back to 2015",
        // "wie hat sich das entwickelt", "lieber als Balken", "s'il te plaît")
        'ones prefer rather draw plot alone back raw instead instead ' +
        'hat sich lieber zuruck allein ' +
        'plait prefere plutot retour seul seule produire produit produite produisent erzeugen erzeugt',
    )
    .split(/\s+/),
)

const STOPWORDS = new Set(
  (
    'a an and are as at be by for from has have in is it of on or the to was were with me my i you your we our it ' +
    'der die das den dem des ein eine einer eines und oder ist sind im in am an auf zu fur von mit mir ich du sie es wir ' +
    'le la les un une des du de et ou est sont en au aux a pour par avec sur dans moi je tu vous nous il elle on ce cet cette ces'
  ).split(' '),
)

const MIN_DOC_FREQ = 5

export interface Vocabulary {
  /** Content words of `text` that ENgenuidash does not know. */
  unknownWords(text: string, knowledgeDocFreq?: Map<string, number>): string[]
}

function variants(w: string): string[] {
  const out = [w]
  for (const suffix of ['s', 'es', 'en', 'n', 'e', 'er', 'ed', 'ing']) if (w.length > suffix.length + 3 && w.endsWith(suffix)) out.push(w.slice(0, -suffix.length))
  return out
}

export function buildVocabulary(
  dict: EnergyDictionary | null,
  codelists: EnergyCodelists | null,
  places: Set<string>,
  extraTerms: string[] = [],
): Vocabulary {
  const vocab = new Set<string>()
  const addText = (text: string | undefined) => {
    for (const w of normalize(text ?? '').split(/[^a-z0-9]+/)) if (w.length > 2) vocab.add(w)
  }
  if (dict) {
    for (const ds of Object.values(dict.datasets)) Object.values(ds.title).forEach(addText)
    for (const f of Object.values(dict.folders)) Object.values(f.title).forEach(addText)
    for (const labels of Object.values(dict.dimensions)) Object.values(labels).forEach(addText)
    for (const u of Object.values(dict.units)) {
      addText(u.symbol)
      Object.values(u.label).forEach(addText)
    }
  }
  if (codelists) {
    // Energy codelists only; GEO is covered by `places`, CRUDEOIL/PARTNER names are too broad.
    for (const id of ['SIEC', 'NRG_BAL', 'PLANT_TEC', 'PLANTS', 'GEN_TECH', 'HP_TECH', 'NRG_TECH', 'NRG_PRC', 'NRG_CONS', 'INDIC_NRG', 'TAX', 'CURRENCY', 'CONSOM', 'STK_FLOW', 'UNIT', 'OPERATOR', 'NETWORK']) {
      for (const labels of Object.values(codelists.codelists[id]?.codes ?? {})) {
        for (const [k, v] of Object.entries(labels)) if (k !== 'parent') addText(v)
      }
    }
  }
  extraTerms.forEach(addText)
  // Everything the planner understands; single-word stems of 5+ letters also match longer forms.
  const stems: string[] = []
  for (const term of plannerTerms()) {
    // Single words only: a phrase ("to date", "hors taxe") must not make its words known on
    // their own ("what is the date of oil?").
    const t = normalize(term).trim().replace(/\$$/, '')
    if (t.includes(' ')) continue
    addText(t)
    if (t.length >= 5) stems.push(t)
  }
  const placeWords = new Set([...places].flatMap((p) => p.split(' ')))

  return {
    unknownWords(text, knowledgeDocFreq) {
      // Hyphens split words too: "est-elle", "peut-on", "Kraft-Wärme".
      const words = normalize(text).replace(/[’']/g, ' ').split(/[^a-z0-9_]+/).filter(Boolean)
      return words.filter((w) => {
        if (w.length <= 2 || STOPWORDS.has(w) || /\d/.test(w) || w.includes('_')) return false
        if (placeWords.has(w) || hasEnergySignal(w)) return false
        return !variants(w).some(
          (v) =>
            QUESTION_WORDS.has(v) ||
            vocab.has(v) ||
            stems.some((st) => v.startsWith(st)) ||
            (knowledgeDocFreq?.get(v) ?? 0) >= MIN_DOC_FREQ,
        )
      })
    },
  }
}
