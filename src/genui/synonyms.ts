/**
 * Other ways of naming what a view shows, rewritten to the words its rules know, so "energy
 * passport of Germany", "how much does electricity cost in France" or "wie teuer ist Strom" reach
 * the country profile and the price dashboards instead of "I don't understand". Runs on the
 * prepared question (lower case, no accents, apostrophes as spaces; see prepare.ts), in English,
 * German and French. Only the routing reads the result; the chat keeps what was typed.
 */
const RULES: [RegExp, string | ((...match: string[]) => string)][] = [
  // ---- the country energy profile ----
  [/\b(country )?energy (passports?|snapshots?|cards?|summary|summaries|picture|situation|landscape|portraits?|country reports?|reports?|in numbers|in figures|at a glance|state of play)\b/g, 'energy profile'],
  [/\b(country|national) (cards?|profiles?|passports?|snapshots?)\b/g, 'country profile'],
  [/\b(the )?(state|situation|picture) of (the )?energy\b/g, 'energy profile'],
  // "Polish electricity", "German households": the country named by its adjective.
  [/\b(polish|german|french|spanish|italian|portuguese|greek|swedish|dutch|belgian|austrian|danish|finnish|irish|hungarian|czech|slovak|romanian|bulgarian|croatian|slovenian|lithuanian|latvian|estonian|maltese|cypriot|luxembourgish) (electricity|energy|gas|natural gas|oil|coal|renewables?|households?|industry|grid|power|nuclear|economy)\b/g, (_m: string, adj: string, what: string) => `${what} of ${({ polish: 'poland', german: 'germany', french: 'france', spanish: 'spain', italian: 'italy', portuguese: 'portugal', greek: 'greece', swedish: 'sweden', dutch: 'netherlands', belgian: 'belgium', austrian: 'austria', danish: 'denmark', finnish: 'finland', irish: 'ireland', hungarian: 'hungary', czech: 'czechia', slovak: 'slovakia', romanian: 'romania', bulgarian: 'bulgaria', croatian: 'croatia', slovenian: 'slovenia', lithuanian: 'lithuania', latvian: 'latvia', estonian: 'estonia', maltese: 'malta', cypriot: 'cyprus', luxembourgish: 'luxembourg' } as Record<string, string>)[adj]}`],
  // "Russian gas imports", "Norwegian oil": the partner named by its adjective.
  [/\b(russian|norwegian|american|algerian|qatari|azerbaijani|libyan|nigerian|kazakh|saudi|iraqi|british|ukrainian) (natural gas|gas|crude oil|oil|coal|lng)(?: imports?)?\b/g, (_m: string, who: string, what: string) => `${what} imports from ${({ russian: 'russia', norwegian: 'norway', american: 'united states', algerian: 'algeria', qatari: 'qatar', azerbaijani: 'azerbaijan', libyan: 'libya', nigerian: 'nigeria', kazakh: 'kazakhstan', saudi: 'saudi arabia', iraqi: 'iraq', british: 'united kingdom', ukrainian: 'ukraine' } as Record<string, string>)[who]}`],
  [/\b(?:key|main|basic|headline) energy (?:figures|facts|numbers|statistics|stats|data)\b|\bwhat does energy look like in\b/g, 'energy profile of'],
  [/\b(?:full )?energy accounts?\b|\bsupply transformation (?:and )?consumption(?: balance)?\b(?!.*\bmonthly\b)/g, 'energy balance'],
  [/\bfrom (?:supply|source|sources|production) to (?:final |end[ -]?)?(?:use|uses|consumption)\b/g, 'energy flow diagram'],
  [/\bhow (is|are) (?:the )?(.+?) doing (?:on |in |with |regarding )?(?:the )?energy(?:[- ]?wise)?\b/g, 'energy profile of $2'],
  [/\bhow (?:is|are) (?:the )?(.+?) (?:on the whole|overall|in general|generally|altogether|all in all|as a whole)\b/g, 'energy profile of $1'],
  [/\bhow (?:the )?(.+?) (?:is|are) doing (?:on |in |with |regarding )?(?:the )?energy(?:[- ]?wise)?\b/g, 'energy profile of $1'],
  [/\b(everything|all|anything)(?: there is)?(?: to know)? (?:about|on) (?:the )?energy\b/g, 'energy profile'],
  [/\b(energiepass\w*|energiesteckbrief\w*|steckbrief|energieportrait\w*|energiesituation|energielage|energie in zahlen|energieuberblick\w*)\b/g, 'energy profile'],
  [/\bwie steht (.+?) energetisch da\b/g, 'energy profile of $1'],
  [/\balles (zu|zur|zum|uber) (die |der |den )?energie\b/g, 'energy profile'],
  [/\b(passeport energetique|fiche energie|fiche energetique|situation energetique|apercu energetique|etat des lieux energetique|portrait energetique|energie en chiffres|bilan de l energie de)\b/g, 'energy profile'],
  // ---- oil, trade and the energy flow diagram ----
  [/\b(?:fuel|petroleum|oil) supply security\b|\bsecurity of (?:oil|fuel|petroleum) supply\b|\b(?:strategic )?(?:oil|petroleum) reserves?\b|\bemergency (?:oil )?stocks\b|\boil shock\b|\bhow many days of (?:oil|fuel|petrol) \w+ have\b/g, 'oil security'],
  [/\b(?:erdolvorrate|erdolreserve\w*|olvorrate|erdolversorgung\w*)\b/g, 'oil security'],
  [/\b(?:stocks? de petrole|reserves? de petrole|stocks? petroliers?|approvisionnement en petrole)\b/g, 'oil security'],
  [/\bhow much (?:crude )?(?:oil|petroleum) (?:does|do) (?:the )?(.+?) import\b/g, 'oil security of $1'],
  [/\b(?:crude )?oil supply\b/g, 'oil security'],
  // ---- renewables (SHARES): capacity, technologies, sectors ----
  // (one word or two that name a dashboard)
  [/^(?:the )?capacit(?:y|ies)$/g, 'renewable capacity by technology'],
  [/^(?:the )?(?:energy )?security$/g, 'energy security dashboard'],
  [/^(?:the )?(?:energy )?poverty$/g, 'energy poverty indicators'],
  [/^(?:the )?dependence$|^(?:the )?dependency$/g, 'energy import dependency'],
  [/^(?:the )?diversification$/g, 'diversification of energy sources'],
  [/^(?:the )?(?:buildings?|dwellings?) renewables?$/g, 'renewables in buildings'],
  [/^(?:the )?transport renewables?$/g, 'renewables in transport'],
  // ("shares" alone, or "shares Poland": the SHARES renewables dashboard)
  [/^(?:the )?shares\b(?! (?:of|in|for|by|from|tool|database|data|methodology|dashboard|results|statistics|figures|numbers))/g, 'renewable energy dashboard'],
  [/\b(?:installed|how much) (?:(?:solar|wind|hydro\w*|geothermal|biomass|ocean|tidal)(?: power| energy)?)(?: (?:capacity|capacities|power))?(?: does (\w+) have)?(?: installed)?\b/g, 'renewable capacity by technology $1'],
  [/\b(?:solar|wind|hydro\w*|hydroelectric|geothermal|tidal|ocean|renewable|green)(?: power| energy)? (?:capacity|capacities)\b/g, 'renewable capacity by technology'],
  [/\b(?:gigawatts?|gw|megawatts?|mw) of (?:solar|wind|hydro\w*|geothermal|renewable)(?: power| energy| capacity)?\b/g, 'renewable capacity by technology'],
  [/\b(?:installed|installierte\w*) (?:renewable |green )?(?:capacity|capacities|leistung)\b/g, 'renewable capacity by technology'],
  [/\b(?:solarkapazitat\w*|windkapazitat\w*|kapazitat (?:der |von )?(?:erneuerbare\w*|solar\w*|wind\w*)|installierte leistung)\b/g, 'renewable capacity by technology'],
  [/\b(?:capacite (?:installee )?(?:solaire|eolienne|renouvelable|hydraulique)|puissance (?:installee )?(?:solaire|eolienne|renouvelable))\b/g, 'renewable capacity by technology'],
  [/\bhow much (?:of )?(?:the )?(?:electricity|power|energy) (?:comes?|is made|is generated|is produced) (?:from|by) (?:wind|solar|hydro\w*|renewables?)\b|\b(?:windkraft|windenergie|solarstrom|solarenergie|photovoltaik)\b|\b(?:eolien\w*|energie eolienne|energie solaire|photovoltaique)\b/g, 'renewable electricity by technology'],
  [/\b(?:wind and solar|solar and wind|wind, solar and hydro|solar, wind and hydro)\b/g, 'renewable electricity by technology'],
  [/\b(?:green|clean) electricity\b/g, 'renewable electricity by technology'],
  [/\b(?:erneuerbarer strom|erneuerbare elektrizitat|gruner strom|strom aus erneuerbare\w*)\b/g, 'renewable electricity by technology'],
  [/\b(?:electricite renouvelable|electricite verte|electricite d origine renouvelable)\b/g, 'renewable electricity by technology'],
  [/\b(?:renewable|green) (?:heating|heat)(?! pumps?)(?! share)\b|\bgreen cooling\b|\brenewable cooling\b/g, 'renewable heating and cooling by technology'],
  [/\b(?:erneuerbare|gruene|grune) (?:warme|heizung|kuhlung|warme und kalte)\b/g, 'renewable heating and cooling by technology'],
  [/\b(?:chaleur renouvelable|chauffage renouvelable|refroidissement renouvelable|froid renouvelable)\b/g, 'renewable heating and cooling by technology'],
  [/\b(?:green|clean|renewable) (?:transport|mobility|fuels?)(?! share)\b|\b(?:biofuels?|biodiesel|bioethanol) (?:in|for|used in) transport\b|\brenewable transport fuels\b/g, 'renewables in transport'],
  [/\b(?:erneuerbare\w*|biokraftstoffe?|biotreibstoffe?) (?:im|in|fur) verkehr\b|\bgruner verkehr\b/g, 'renewables in transport'],
  [/\b(?:renouvelables?|biocarburants?) dans les transports\b|\btransports? (?:verts?|renouvelables?)\b/g, 'renewables in transport'],
  [/\b(?:wood|firewood|pellets?|wood chips|fuelwood|forest biomass|wood pellets) (?:energy|use|fuel|supply|for heating)?\b|\bbiomass in\b|\bbiomass use\b/g, 'biomass supply for energy'],
  [/\b(?:biomasse|brennholz|holzpellets?|holzenergie)(?!\w)(?! supply)/g, 'biomass supply for energy'],
  [/\b(?:biomasse(?! supply)|bois energie|bois de chauffage|granules de bois)\b/g, 'biomass supply for energy'],
  [/\b(?:renewables?|green energy|renewable energy|clean energy) in (?:households?|homes?|houses?|buildings?|dwellings?)\b|\bgreen energy in homes\b/g, 'renewables in buildings'],
  [/\b(?:erneuerbare\w*) (?:in |im )?(?:gebauden?|haushalten?|wohnungen?)\b/g, 'renewables in buildings'],
  [/\b(?:renouvelables?) dans les (?:batiments|menages|logements)\b/g, 'renewables in buildings'],
  [/\bhow (?:green|renewable|clean) (?:is|are) (?:the )?(.+?)(?: s| 's)?(?: energy| power| supply)?\??$/g, 'renewable energy dashboard of $1'],
  [/\bhow (?:much )?(?:are )?renewables (?:doing|performing|progressing) (?:in |for )?(?:the )?/g, 'renewable energy dashboard of '],
  [/\b(?:are we|is the eu|is \w+) on track (?:for|to reach|to meet) (?:the )?(?:42[.,]5 ?%? ?)?(?:renewables?|renewable (?:energy )?(?:target|goal))\b/g, 'renewable energy dashboard'],
  [/\b(?:progress|status|state) (?:to|towards|on|of|with) (?:the )?(?:2030 )?(?:renewables?|renewable (?:energy )?(?:target|goal)s?)\b|\b(?:2030 )?renewable (?:energy )?(?:target|goal)s? progress\b|\bred (?:iii|3) progress\b|\brenewable energy directive progress\b/g, 'renewable energy dashboard'],
  [/\bshares (?:results|statistics|figures|numbers|data|database|tool)\b/g, 'shares dashboard'],
  [/\b(?:renewable energy|renewables) (?:statistics|stats|mix|sources|technologies|sector breakdown|by sector|in each sector)\b|\b(?:mix|sources|technologies) of renewable energy\b|\bwhat are the sources of renewable energy\b/g, 'renewable energy dashboard'],
  [/\b(?:erneuerbare energien|erneuerbaren energien)(?:s)? (?:dashboard|statistik|mix|uberblick|ubersicht)\b/g, 'renewable energy dashboard'],
  [/\b(?:energies renouvelables|renouvelables) (?:statistiques|mix|apercu|tableau de bord)\b/g, 'renewable energy dashboard'],
  // ---- efficiency, security and poverty progress dashboards ----
  [/\bhow (?:energy )?efficient (?:is|are) (?:the )?/g, 'energy efficiency dashboard of '],
  [/\b(?:energy|power) (?:savings?|saving) (?:progress|needed|target|targets|trajectory|trajectories)\b|\bhow much energy (?:does|do|must|should|can) (?:the )?.+? (?:need to |have to )?save\b|\bare we (?:reducing|cutting|lowering) (?:our )?(?:energy|power) (?:consumption|use|demand)\b|\b(?:reduc\w+|cut\w*|lower\w*) (?:the |our )?(?:energy|power) (?:consumption|use|demand)\b/g, 'energy efficiency dashboard'],
  [/\b(?:final |primary )?energy (?:consumption|demand|use) (?:target|targets|trajectory|trajectories|ceiling|ceilings|path)\b|\b(?:final |primary )?energy (?:consumption|demand|use) (?:against|vs|versus|compared with|relative to) the 2030 (?:target|targets|ceiling|ceilings)\b|\b(?:final )?energy (?:consumption|demand|use) by (?:end[ -]?use )?sectors?\b|(?<!(?:electricity|gas|oil|coal|heat|power|fuel) )\bconsumption by sector\b|\beed progress\b|\bnational (?:energy )?(?:efficiency )?contributions?\b/g, 'energy efficiency dashboard'],
  [/\benergieeffizienz(?= [a-z]+$)/g, 'energy efficiency'],
  [/\b(?:energieeffizienz|effizienz) (?:in|von|fur|ziele?|fortschritt\w*)\b|\bwie effizient (?:ist|sind)\b|\benergieverbrauch (?:ziele?|entwicklung|nach sektor\w*)\b|\benergiesparen\b/g, 'energy efficiency dashboard'],
  [/\b(?:efficacite energetique|economies d energie)|\bcomment (?:est |sont )?efficace\b|\bconsommation d energie par secteur\b/g, 'energy efficiency dashboard'],
  [/\bhow (?:secure|safe|resilient|vulnerable) (?:is|are) (?:the )?(.+?)(?: s| 's)?(?: energy)?(?: supply| system)?\??$/g, 'energy security dashboard of $1'],
  [/\benergy security (?:in|of|for|situation|status|overview|indicators)\b/g, 'energy security dashboard'],
  [/\b(?:security of (?:energy )?supply|supply security|energy supply (?:risks?|security|resilience)|secure energy supply|energy resilience|energy risk)\b/g, 'energy security dashboard'],
  [/\bhow (?:diversified|diverse|balanced|varied) (?:is|are) (?:the )?(.+?)(?: s| 's)?(?: energy| supply| mix)?\??$/g, 'diversification of energy sources in $1'],
  [/\b(?:energy|supply|fuel) (?:mix )?(?:diversity|diversification)\b|\bdiversity of (?:the )?(?:energy|supply|fuel)\b/g, 'diversification of energy sources'],
  [/\b(?:dependence|dependency|reliance|dependent) (?:on|upon) (?:non[- ]?eu|third[- ]countr\w+) (?:energy|fuels?|supplies)\b|\bhow dependent (?:is|are) (?:the )?(.+?) on (?:non[- ]?eu|third[- ]countr\w+)(?: energy| fuels?)?\b/g, 'energy dependence on third countries'],
  [/\benergy (?:imports? )?(?:from )?outside the eu\b|\bnon[- ]?eu energy (?:imports?|dependence|supply)\b|\bthird[- ]countr\w+ energy (?:dependence|dependency|imports?)\b|\b(?:dependen\w+|reliance|reliant) (?:on|of) (?:energy )?imports? from (?:outside the eu|non[- ]?eu|third countries)\b/g, 'energy dependence on third countries'],
  [/\b(?:versorgungssicherheit|energiesicherheit|energieversorgungssicherheit)\b/g, 'energy security dashboard'],
  [/\b(?:securite d approvisionnement|securite energetique|securite de l approvisionnement(?: energetique)?)\b/g, 'energy security dashboard'],
  [/\b(?:can t|cannot|couldn t|unable to|not able to|struggle to|struggling to) (?:afford to )?(?:keep|heat|warm)(?: \w+){0,3} (?:warm|heated|heat)\b|\b(?:can t|cannot|unable to|struggle to|struggling to) (?:afford to )?(?:heat|warm)\b|\b(?:cold|unheated|unwarm\w*|badly heated|poorly heated) (?:homes?|houses?|dwellings?|flats?|apartments?)\b|\bhow many people (?:can t|cannot|are unable to|struggle to) (?:afford to )?heat\b/g, 'energy poverty indicators'],
  [/\b(?:utility|energy|electricity|gas|heating) bills? arrears\b|\barrears on (?:utility |energy |electricity |gas |heating )?bills\b|\b(?:overdue|unpaid|late) (?:utility|energy|electricity|gas|heating) bills\b|\bdamp(?:ness)? (?:homes?|houses?|dwellings?)\b|\bleaking roofs?\b|\bfuel poverty\b|\benergy hardship\b|\b(?:vulnerable|poor|low[- ]income) households? (?:and |in )?energy\b|\benergy (?:vulnerable|vulnerability|deprivation|insecurity)\b/g, 'energy poverty indicators'],
  [/\b(?:energiearmut|heizkostenarmut|heizkosten armut|energieverarmung)\b/g, 'energy poverty indicators'],
  [/\b(?:precarite energetique|pauvrete energetique)\b/g, 'energy poverty indicators'],
  [/\b(?:stromimporte?|stromexporte?)\b/g, 'imports of electricity by partner'],
  [/\b(?:importations?|exportations?) (?:de|du|d) (charbon|gaz|petrole|electricite)\b/g, 'imports of $1 by partner'],
  [/\bbalance of energy\b/g, 'energy balance'],
  [/\b(?:energy|power) (?:losses|loss|waste|wasted)\b|\bhow much (?:energy|power) is (?:lost|wasted)\b|\benergy transformation\b|\bfrom (?:production|sources?) to (?:consumption|use|end use)\b|\bwhere does (?:the )?(?:energy|power) (?:of )?(?:\w+ )?go\b/g, 'energy flow diagram'],
  // ---- who supplies whom ----
  [/\bfrom where (?:does |do )?(.+?) (?:gets?|imports?|buys?|receives?|takes?) (?:its |their |the )?(gas|oil|coal|electricity|petroleum)\b/g, 'imports of $2 by partner of $1'],
  [/\bto whom (?:does |do )?(.+?) (?:exports?|sells?|sends?) (?:its |their |the )?(gas|oil|coal|electricity|petroleum)\b/g, 'exports of $2 by partner of $1'],
  [/\bexports? of (\w+) from (.+?) to (?:its |the )?(?:neighbou?rs?|neighbou?ring countries|other countries)\b/g, 'exports of $1 by partner $2'],
  [/\bfrom where (?:the )?energy comes?\b|\bwhere (?:the )?energy (?:comes from|goes)\b|\bdiagram of energy\b/g, 'energy flow diagram'],
  // ---- price structure: how much of a price is tax ----
  [/\bprices? (?:of )?(electricity|gas|energy) (?:breakdown|taxes)(?: breakdown)?\b/g, '$1 price breakdown'],
  [/\bprice (electricity|gas) (?:house|home|family)\b/g, 'household $1 prices'],
  [/\bhow much of (?:the |my |our )?(?:[\w ]{0,20}?)(?:price|bill)s? (?:is|are|goes? to|comes? from) (?:tax\w*|vat|levies|charges|network\w*)\b/g, '$& price breakdown'],
  [/\b(?:share of )?(?:taxes|tax|vat|levies|network (?:costs?|charges?|fees?)) (?:in|of|on) (?:the |my )?(?:household |industrial |business )?(?:electricity|gas|energy) (?:prices?|bills?)\b|\b(?:electricity|gas|energy) (?:prices?|bills?) (?:taxes|tax|vat|breakdown|taxes breakdown)\b/g, '$& price breakdown'],
  [/\b(?:cost|price|prices) of (electricity|gas|energy) for (?:a |one )?(?:famil(?:y|ies)|homes?|houses?)\b/g, 'household $1 prices'],
  [/\b(electricity|gas|energy) (?:price|cost) (?:house|home|family)\b/g, 'household $1 prices'],
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
  for (const [re, to] of RULES) text = text.replace(re, to as string)
  // ("prices prices": both a synonym and the word itself were there)
  return text.replace(/\bprices(?: prices)+\b/g, 'prices').replace(/\s+/g, ' ').trim()
}
