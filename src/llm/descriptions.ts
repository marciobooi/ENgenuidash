/**
 * "About this indicator" texts in every app language. Eurostat publishes its dataset
 * descriptions (reference metadata, knowledge.json) in English only, and some lose their
 * formulas when extracted ("… calculated using the following ratio: where: TIMP represents…").
 * These are faithful, edited versions of the "Data description" section of each metadata file
 * the dashboards show, keyed by the passage id in knowledge.json, with the metadata title.
 * A passage without an entry here keeps Eurostat's English text (marked as English).
 */
export interface Description {
  title: Record<'en' | 'de' | 'fr', string>
  text: Record<'en' | 'de' | 'fr', string>
}

export const DESCRIPTIONS: Record<string, Description> = {
  'meta:nrg_d_hhq': {
    title: {
      en: 'Energy statistics - quantities (nrg_quant)',
      de: 'Energiestatistik – Mengen (nrg_quant)',
      fr: 'Statistiques de l’énergie – quantités (nrg_quant)',
    },
    text: {
      en: 'Annual data on quantities for crude oil, petroleum products, natural gas and manufactured gases, electricity and derived heat, solid fossil fuels, renewables and wastes, and hydrogen, covering the whole energy sector from supply through transformation to final consumption by sector and fuel type. It also includes annual imports and exports of energy carriers by country of origin and destination, and infrastructure information.',
      de: 'Jährliche Mengendaten zu Rohöl, Erdölerzeugnissen, Erdgas und hergestellten Gasen, Elektrizität und abgeleiteter Wärme, festen fossilen Brennstoffen, erneuerbaren Energien und Abfällen sowie Wasserstoff – für den gesamten Energiesektor, von der Versorgung über die Umwandlung bis zum Endverbrauch nach Sektor und Energieträger. Dazu kommen jährliche Einfuhren und Ausfuhren von Energieträgern nach Herkunfts- und Bestimmungsland sowie Angaben zur Infrastruktur.',
      fr: 'Données annuelles sur les quantités de pétrole brut, de produits pétroliers, de gaz naturel et de gaz manufacturés, d’électricité et de chaleur dérivée, de combustibles fossiles solides, d’énergies renouvelables et de déchets, et d’hydrogène, couvrant tout le secteur de l’énergie, de l’approvisionnement à la consommation finale par secteur et par combustible, en passant par la transformation. Elles comprennent aussi les importations et exportations annuelles de vecteurs énergétiques par pays d’origine et de destination, ainsi que des informations sur les infrastructures.',
    },
  },
  'meta:sdg_07_11': {
    title: {
      en: 'Final energy consumption (sdg_07_11)',
      de: 'Endenergieverbrauch (sdg_07_11)',
      fr: 'Consommation d’énergie finale (sdg_07_11)',
    },
    text: {
      en: 'The indicator measures the energy end-use in a country, excluding all non-energy use of energy carriers (e.g. natural gas used not for combustion but for producing chemicals). Final energy consumption covers only the energy consumed by end users, such as industry, transport, households, services and agriculture; it excludes the energy sector’s own consumption and losses in transformation and distribution.',
      de: 'Der Indikator misst den Energieendverbrauch eines Landes ohne jede nichtenergetische Nutzung von Energieträgern (z. B. Erdgas, das nicht verbrannt, sondern zur Herstellung von Chemikalien verwendet wird). Der Endenergieverbrauch umfasst nur die Energie, die von Endnutzern wie Industrie, Verkehr, Haushalten, Dienstleistungen und Landwirtschaft verbraucht wird; der Eigenverbrauch des Energiesektors sowie Umwandlungs- und Verteilungsverluste sind nicht enthalten.',
      fr: 'L’indicateur mesure l’utilisation finale d’énergie d’un pays, hors toute utilisation non énergétique des vecteurs énergétiques (par exemple le gaz naturel utilisé non pour la combustion mais pour produire des produits chimiques). La consommation d’énergie finale ne couvre que l’énergie consommée par les utilisateurs finaux, comme l’industrie, les transports, les ménages, les services et l’agriculture ; elle exclut la consommation propre du secteur de l’énergie et les pertes de transformation et de distribution.',
    },
  },
  'meta:sdg_07_10': {
    title: {
      en: 'Primary energy consumption (sdg_07_10)',
      de: 'Primärenergieverbrauch (sdg_07_10)',
      fr: 'Consommation d’énergie primaire (sdg_07_10)',
    },
    text: {
      en: 'The indicator measures the total energy needs of a country, excluding all non-energy use of energy carriers (e.g. natural gas used not for combustion but for producing chemicals). Primary energy consumption covers the consumption of end users such as industry, transport, households, services and agriculture, plus the energy sector’s own consumption for producing and transforming energy, transformation losses (e.g. in producing electricity from combustible fuels) and transmission and distribution losses.',
      de: 'Der Indikator misst den gesamten Energiebedarf eines Landes ohne jede nichtenergetische Nutzung von Energieträgern (z. B. Erdgas, das nicht verbrannt, sondern zur Herstellung von Chemikalien verwendet wird). Der Primärenergieverbrauch umfasst den Verbrauch der Endnutzer wie Industrie, Verkehr, Haushalte, Dienstleistungen und Landwirtschaft, dazu den Eigenverbrauch des Energiesektors für Erzeugung und Umwandlung, die Umwandlungsverluste (z. B. bei der Stromerzeugung aus Brennstoffen) sowie die Übertragungs- und Verteilungsverluste.',
      fr: 'L’indicateur mesure les besoins énergétiques totaux d’un pays, hors toute utilisation non énergétique des vecteurs énergétiques (par exemple le gaz naturel utilisé non pour la combustion mais pour produire des produits chimiques). La consommation d’énergie primaire couvre la consommation des utilisateurs finaux comme l’industrie, les transports, les ménages, les services et l’agriculture, plus la consommation propre du secteur de l’énergie pour produire et transformer l’énergie, les pertes de transformation (par exemple lors de la production d’électricité à partir de combustibles) et les pertes de transport et de distribution.',
    },
  },
  'meta:nrg_ind_ei': {
    title: { en: 'Energy intensity (nrg_ind_ei)', de: 'Energieintensität (nrg_ind_ei)', fr: 'Intensité énergétique (nrg_ind_ei)' },
    text: {
      en: 'Energy intensity is the amount of energy used per unit of GDP. Values in chain-linked volumes are best for comparing periods within one country; values in purchasing power standards (PPS) are best for comparing countries in one year. Energy data come from Eurostat’s simplified energy balances (nrg_bal_s) and GDP data from the national accounts (nama_10_gdp).',
      de: 'Die Energieintensität ist die pro Einheit des BIP eingesetzte Energiemenge. Werte in verketteten Volumen eignen sich am besten für den Vergleich von Zeiträumen innerhalb eines Landes, Werte in Kaufkraftstandards (KKS) für den Vergleich von Ländern in einem Jahr. Die Energiedaten stammen aus den vereinfachten Energiebilanzen von Eurostat (nrg_bal_s), die BIP-Daten aus den Volkswirtschaftlichen Gesamtrechnungen (nama_10_gdp).',
      fr: 'L’intensité énergétique est la quantité d’énergie utilisée par unité de PIB. Les valeurs en volumes chaînés conviennent le mieux pour comparer des périodes dans un même pays ; les valeurs en standards de pouvoir d’achat (SPA) pour comparer des pays une même année. Les données sur l’énergie proviennent des bilans énergétiques simplifiés d’Eurostat (nrg_bal_s) et celles sur le PIB des comptes nationaux (nama_10_gdp).',
    },
  },
  'meta:nrg_ind_ep': {
    title: { en: 'Energy productivity (nrg_ind_ep)', de: 'Energieproduktivität (nrg_ind_ep)', fr: 'Productivité énergétique (nrg_ind_ep)' },
    text: {
      en: 'Energy productivity is the GDP produced per unit of energy. Values in chain-linked volumes are best for comparing periods within one country; values in purchasing power standards (PPS) are best for comparing countries in one year. Energy data come from Eurostat’s simplified energy balances (nrg_bal_s) and GDP data from the national accounts (nama_10_gdp).',
      de: 'Die Energieproduktivität ist das pro Energieeinheit erwirtschaftete BIP. Werte in verketteten Volumen eignen sich am besten für den Vergleich von Zeiträumen innerhalb eines Landes, Werte in Kaufkraftstandards (KKS) für den Vergleich von Ländern in einem Jahr. Die Energiedaten stammen aus den vereinfachten Energiebilanzen von Eurostat (nrg_bal_s), die BIP-Daten aus den Volkswirtschaftlichen Gesamtrechnungen (nama_10_gdp).',
      fr: 'La productivité énergétique est le PIB produit par unité d’énergie. Les valeurs en volumes chaînés conviennent le mieux pour comparer des périodes dans un même pays ; les valeurs en standards de pouvoir d’achat (SPA) pour comparer des pays une même année. Les données sur l’énergie proviennent des bilans énergétiques simplifiés d’Eurostat (nrg_bal_s) et celles sur le PIB des comptes nationaux (nama_10_gdp).',
    },
  },
  'meta:sdg_07_30': {
    title: { en: 'Energy productivity (sdg_07_30)', de: 'Energieproduktivität (sdg_07_30)', fr: 'Productivité énergétique (sdg_07_30)' },
    text: {
      en: 'The indicator measures the economic output produced per unit of gross available energy, i.e. the energy products needed to satisfy all demand in the country. Output is given in euros in chain-linked volumes (reference year 2010, at 2010 exchange rates) or in purchasing power standards (PPS).',
      de: 'Der Indikator misst die Wirtschaftsleistung je Einheit der Bruttoverfügbaren Energie, also der Energieprodukte, die zur Deckung der gesamten Nachfrage im Land nötig sind. Die Wirtschaftsleistung wird in Euro in verketteten Volumen (Referenzjahr 2010, zu Wechselkursen von 2010) oder in Kaufkraftstandards (KKS) angegeben.',
      fr: 'L’indicateur mesure la production économique par unité d’énergie brute disponible, c’est-à-dire les produits énergétiques nécessaires pour satisfaire toute la demande du pays. La production est exprimée en euros en volumes chaînés (année de référence 2010, aux taux de change de 2010) ou en standards de pouvoir d’achat (SPA).',
    },
  },
  'meta:nrg_ind_id': {
    title: {
      en: 'Energy imports dependency (nrg_ind_id)',
      de: 'Energieimportabhängigkeit (nrg_ind_id)',
      fr: 'Dépendance aux importations d’énergie (nrg_ind_id)',
    },
    text: {
      en: 'Energy import dependency shows the share of a country’s total energy needs met by imports from other countries. It is net energy imports divided by gross available energy, as a percentage. Values below zero mean the country exports more energy than it imports.',
      de: 'Die Energieimportabhängigkeit zeigt, welcher Anteil des gesamten Energiebedarfs eines Landes durch Einfuhren aus anderen Ländern gedeckt wird. Sie entspricht den Nettoenergieeinfuhren geteilt durch die Bruttoverfügbare Energie, in Prozent. Werte unter null bedeuten, dass das Land mehr Energie aus- als einführt.',
      fr: 'La dépendance aux importations d’énergie indique la part des besoins énergétiques totaux d’un pays couverte par des importations d’autres pays. Elle correspond aux importations nettes d’énergie divisées par l’énergie brute disponible, en pourcentage. Une valeur négative signifie que le pays exporte plus d’énergie qu’il n’en importe.',
    },
  },
  'meta:sdg_07_50': {
    title: {
      en: 'Energy import dependency by products (sdg_07_50)',
      de: 'Energieimportabhängigkeit nach Produkten (sdg_07_50)',
      fr: 'Dépendance aux importations d’énergie par produit (sdg_07_50)',
    },
    text: {
      en: 'The indicator shows the share of a country’s total energy needs met by imports from other countries. It is calculated as net imports divided by gross available energy: (imports – exports) / gross available energy.',
      de: 'Der Indikator zeigt, welcher Anteil des gesamten Energiebedarfs eines Landes durch Einfuhren aus anderen Ländern gedeckt wird. Er wird als Nettoeinfuhren geteilt durch die Bruttoverfügbare Energie berechnet: (Einfuhren – Ausfuhren) / Bruttoverfügbare Energie.',
      fr: 'L’indicateur montre la part des besoins énergétiques totaux d’un pays couverte par des importations d’autres pays. Il est calculé comme les importations nettes divisées par l’énergie brute disponible : (importations – exportations) / énergie brute disponible.',
    },
  },
  'meta:nrg_ind_id3cf': {
    title: {
      en: 'Import dependency on third countries by fuel type (nrg_ind_id3cf)',
      de: 'Importabhängigkeit von Drittländern nach Brennstoffart (nrg_ind_id3cf)',
      fr: 'Dépendance aux importations des pays tiers par type de combustible (nrg_ind_id3cf)',
    },
    text: {
      en: 'The indicator shows how much of the EU’s supply of each fuel group comes from imports from countries outside the EU. It combines the imports reported in the trade tables of the energy questionnaires with the energy balances (imports, primary production, recovered and recycled products and stock changes), fuel by fuel within each fuel group.',
      de: 'Der Indikator zeigt, welcher Teil der Versorgung der EU mit den einzelnen Brennstoffgruppen aus Einfuhren aus Ländern außerhalb der EU stammt. Er verbindet die in den Handelstabellen der Energiefragebögen gemeldeten Einfuhren mit den Energiebilanzen (Einfuhren, Primärerzeugung, zurückgewonnene und recycelte Produkte sowie Bestandsveränderungen), Brennstoff für Brennstoff innerhalb jeder Gruppe.',
      fr: 'L’indicateur montre quelle part de l’approvisionnement de l’UE pour chaque groupe de combustibles provient d’importations de pays hors UE. Il combine les importations déclarées dans les tableaux d’échanges des questionnaires sur l’énergie avec les bilans énergétiques (importations, production primaire, produits récupérés et recyclés et variations de stocks), combustible par combustible au sein de chaque groupe.',
    },
  },
  'meta:nrg_ind_idogas': {
    title: {
      en: 'Natural gas import dependency by country of origin (nrg_ind_idogas)',
      de: 'Erdgasimportabhängigkeit nach Herkunftsland (nrg_ind_idogas)',
      fr: 'Dépendance aux importations de gaz naturel par pays d’origine (nrg_ind_idogas)',
    },
    text: {
      en: 'This indicator traces natural gas imports back to their ultimate country of origin, removing gas that only transits through other countries. The calculation method is described in a document annexed to Eurostat’s metadata.',
      de: 'Dieser Indikator führt Erdgaseinfuhren auf ihr eigentliches Herkunftsland zurück und rechnet Gas heraus, das andere Länder nur durchquert. Die Berechnungsmethode ist in einem Anhang zu den Metadaten von Eurostat beschrieben.',
      fr: 'Cet indicateur retrace les importations de gaz naturel jusqu’à leur pays d’origine réel, en excluant le gaz qui ne fait que transiter par d’autres pays. La méthode de calcul est décrite dans un document annexé aux métadonnées d’Eurostat.',
    },
  },
  'meta:nrg_ind_idooil': {
    title: {
      en: 'Oil and petroleum products import dependency by country of origin (nrg_ind_idooil)',
      de: 'Importabhängigkeit bei Öl und Erdölerzeugnissen nach Herkunftsland (nrg_ind_idooil)',
      fr: 'Dépendance aux importations de pétrole et de produits pétroliers par pays d’origine (nrg_ind_idooil)',
    },
    text: {
      en: 'This indicator traces imports of oil and petroleum products back to their ultimate country of origin, removing fuels that only transit through other countries. The calculation method and important notes are described in a document annexed to Eurostat’s metadata.',
      de: 'Dieser Indikator führt Einfuhren von Öl und Erdölerzeugnissen auf ihr eigentliches Herkunftsland zurück und rechnet Brennstoffe heraus, die andere Länder nur durchqueren. Die Berechnungsmethode und wichtige Hinweise sind in einem Anhang zu den Metadaten von Eurostat beschrieben.',
      fr: 'Cet indicateur retrace les importations de pétrole et de produits pétroliers jusqu’à leur pays d’origine réel, en excluant les combustibles qui ne font que transiter par d’autres pays. La méthode de calcul et des remarques importantes sont décrites dans un document annexé aux métadonnées d’Eurostat.',
    },
  },
  'meta:nrg_ind_ffgae': {
    title: {
      en: 'Share of fossil fuels in gross available energy (nrg_ind_ffgae)',
      de: 'Anteil fossiler Brennstoffe an der Bruttoverfügbaren Energie (nrg_ind_ffgae)',
      fr: 'Part des combustibles fossiles dans l’énergie brute disponible (nrg_ind_ffgae)',
    },
    text: {
      en: 'The share of fossil fuels in gross available energy is the sum of all fossil sources divided by the total of all fuels, as a percentage. Fossil sources are solid fossil fuels, manufactured gases, peat, oil shale and oil sands, natural gas, oil and petroleum products (excluding the biofuel portion) and non-renewable waste. The data come from Eurostat’s simplified energy balances (nrg_bal_s).',
      de: 'Der Anteil fossiler Brennstoffe an der Bruttoverfügbaren Energie ist die Summe aller fossilen Quellen geteilt durch die Summe aller Brennstoffe, in Prozent. Fossile Quellen sind feste fossile Brennstoffe, hergestellte Gase, Torf, Ölschiefer und Ölsande, Erdgas, Öl und Erdölerzeugnisse (ohne Biokraftstoffanteil) sowie nicht erneuerbare Abfälle. Die Daten stammen aus den vereinfachten Energiebilanzen von Eurostat (nrg_bal_s).',
      fr: 'La part des combustibles fossiles dans l’énergie brute disponible est la somme de toutes les sources fossiles divisée par le total de tous les combustibles, en pourcentage. Les sources fossiles sont les combustibles fossiles solides, les gaz manufacturés, la tourbe, les schistes et sables bitumineux, le gaz naturel, le pétrole et les produits pétroliers (hors part de biocarburants) et les déchets non renouvelables. Les données proviennent des bilans énergétiques simplifiés d’Eurostat (nrg_bal_s).',
    },
  },
  'meta:nrg_ind_fecf': {
    title: {
      en: 'Share of fuels in final energy consumption (nrg_ind_fecf)',
      de: 'Anteil der Brennstoffe am Endenergieverbrauch (nrg_ind_fecf)',
      fr: 'Part des combustibles dans la consommation d’énergie finale (nrg_ind_fecf)',
    },
    text: {
      en: 'The share of a fuel in final energy consumption is that fuel divided by the total of all fuels, as a percentage. The fuels are solid fossil fuels, natural gas, oil and petroleum products (excluding the biofuel portion), renewables and biofuels, electricity, heat and other fuels. The data come from Eurostat’s simplified energy balances (nrg_bal_s).',
      de: 'Der Anteil eines Brennstoffs am Endenergieverbrauch ist dieser Brennstoff geteilt durch die Summe aller Brennstoffe, in Prozent. Die Brennstoffe sind feste fossile Brennstoffe, Erdgas, Öl und Erdölerzeugnisse (ohne Biokraftstoffanteil), erneuerbare Energien und Biokraftstoffe, Elektrizität, Wärme und sonstige Brennstoffe. Die Daten stammen aus den vereinfachten Energiebilanzen von Eurostat (nrg_bal_s).',
      fr: 'La part d’un combustible dans la consommation d’énergie finale est ce combustible divisé par le total de tous les combustibles, en pourcentage. Les combustibles sont les combustibles fossiles solides, le gaz naturel, le pétrole et les produits pétroliers (hors part de biocarburants), les énergies renouvelables et biocarburants, l’électricité, la chaleur et les autres combustibles. Les données proviennent des bilans énergétiques simplifiés d’Eurostat (nrg_bal_s).',
    },
  },
  'meta:nrg_ind_ioc': {
    title: {
      en: 'Energy import origin concentration index by fuel (nrg_ind_ioc)',
      de: 'Konzentrationsindex der Herkunft von Energieeinfuhren nach Brennstoff (nrg_ind_ioc)',
      fr: 'Indice de concentration de l’origine des importations d’énergie par combustible (nrg_ind_ioc)',
    },
    text: {
      en: 'The index shows how concentrated a country’s energy imports are on a few countries of origin. It is calculated for every fuel whose import origins are reported in the annual energy statistics, using imports converted with their calorific values, and rounded to 4 decimal places.',
      de: 'Der Index zeigt, wie stark sich die Energieeinfuhren eines Landes auf wenige Herkunftsländer konzentrieren. Er wird für jeden Brennstoff berechnet, dessen Einfuhrherkunft in der jährlichen Energiestatistik gemeldet wird, mit den über ihren Heizwert umgerechneten Einfuhren, und auf 4 Dezimalstellen gerundet.',
      fr: 'L’indice montre à quel point les importations d’énergie d’un pays sont concentrées sur quelques pays d’origine. Il est calculé pour chaque combustible dont l’origine des importations est déclarée dans les statistiques annuelles de l’énergie, à partir des importations converties selon leur pouvoir calorifique, et arrondi à 4 décimales.',
    },
  },
  'meta:nrg_ind_di': {
    title: {
      en: 'Diversity index of energy supply (nrg_ind_di)',
      de: 'Diversitätsindex der Energieversorgung (nrg_ind_di)',
      fr: 'Indice de diversité de l’approvisionnement énergétique (nrg_ind_di)',
    },
    text: {
      en: 'The diversity index shows how evenly a country’s energy supply is spread across fuels. It is calculated from the energy balances for the overall supply (primary production, recovered and recycled products, imports and stock draw) and for the sectors of final energy consumption, using all fuels of the energy balance.',
      de: 'Der Diversitätsindex zeigt, wie gleichmäßig sich die Energieversorgung eines Landes auf die Brennstoffe verteilt. Er wird aus den Energiebilanzen für die gesamte Versorgung (Primärerzeugung, zurückgewonnene und recycelte Produkte, Einfuhren und Bestandsentnahmen) sowie für die Sektoren des Endenergieverbrauchs berechnet, mit allen Brennstoffen der Energiebilanz.',
      fr: 'L’indice de diversité montre à quel point l’approvisionnement énergétique d’un pays est réparti entre les combustibles. Il est calculé à partir des bilans énergétiques pour l’approvisionnement total (production primaire, produits récupérés et recyclés, importations et prélèvements sur stocks) et pour les secteurs de la consommation d’énergie finale, avec tous les combustibles du bilan énergétique.',
    },
  },
  'meta:nrg_ind_esr': {
    title: {
      en: 'Energy self-reliance (nrg_ind_esr)',
      de: 'Energieautarkie (nrg_ind_esr)',
      fr: 'Autosuffisance énergétique (nrg_ind_esr)',
    },
    text: {
      en: 'Energy self-reliance is the share of a country’s energy supply it produces itself: primary production plus recovered and recycled products, divided by the same plus imports and stock draw, as a percentage rounded to 2 decimals. The data come from Eurostat’s simplified energy balances (nrg_bal_s); the indicator is most meaningful for the total of all fuels.',
      de: 'Die Energieautarkie ist der Anteil der Energieversorgung, den ein Land selbst erzeugt: Primärerzeugung plus zurückgewonnene und recycelte Produkte, geteilt durch dieselben zuzüglich Einfuhren und Bestandsentnahmen, in Prozent auf 2 Dezimalstellen gerundet. Die Daten stammen aus den vereinfachten Energiebilanzen von Eurostat (nrg_bal_s); am aussagekräftigsten ist der Indikator für die Summe aller Brennstoffe.',
      fr: 'L’autosuffisance énergétique est la part de l’approvisionnement énergétique qu’un pays produit lui-même : production primaire plus produits récupérés et recyclés, divisée par ces mêmes éléments plus les importations et les prélèvements sur stocks, en pourcentage arrondi à 2 décimales. Les données proviennent des bilans énergétiques simplifiés d’Eurostat (nrg_bal_s) ; l’indicateur est surtout pertinent pour le total de tous les combustibles.',
    },
  },
  'meta:nrg_inf_epc': {
    title: {
      en: 'Electricity production capacities by main fuel groups and operator (nrg_inf_epc)',
      de: 'Stromerzeugungskapazitäten nach Hauptbrennstoffgruppen und Betreiber (nrg_inf_epc)',
      fr: 'Capacités de production d’électricité par principaux groupes de combustibles et exploitant (nrg_inf_epc)',
    },
    text: {
      en: 'Data collected through the annual electricity and heat questionnaire and the annual renewables questionnaire, under the EU regulation on energy statistics (Regulation (EC) No 1099/2008). They cover total capacity and capacity by source of electricity, by type of generation and by type of firing and fuel in power plants using combustible fuels, in megawatts (MWe).',
      de: 'Die Daten werden über die jährlichen Fragebögen zu Elektrizität und Wärme sowie zu erneuerbaren Energien erhoben, auf Grundlage der EU-Verordnung über die Energiestatistik (Verordnung (EG) Nr. 1099/2008). Sie umfassen die Gesamtkapazität sowie die Kapazität nach Stromquelle, nach Erzeugungsart und nach Feuerungsart und Brennstoff in Kraftwerken mit Brennstoffen, in Megawatt (MWe).',
      fr: 'Données collectées au moyen des questionnaires annuels sur l’électricité et la chaleur et sur les énergies renouvelables, en vertu du règlement de l’UE sur les statistiques de l’énergie (règlement (CE) n° 1099/2008). Elles couvrent la capacité totale et la capacité par source d’électricité, par type de production et par type de combustion et de combustible dans les centrales utilisant des combustibles, en mégawatts (MWe).',
    },
  },
  'meta:nrg_inf_lbpc': {
    title: {
      en: 'Liquid biofuels production capacities (nrg_inf_lbpc)',
      de: 'Produktionskapazitäten für flüssige Biokraftstoffe (nrg_inf_lbpc)',
      fr: 'Capacités de production de biocarburants liquides (nrg_inf_lbpc)',
    },
    text: {
      en: 'Production capacities for liquid biofuels: biogasoline, biodiesels, bio jet kerosene and other liquid biofuels, in thousand tonnes. The data are collected through standard questionnaires under the EU regulation on energy statistics (Regulation (EC) No 1099/2008).',
      de: 'Produktionskapazitäten für flüssige Biokraftstoffe: Biobenzin, Biodiesel, Bio-Kerosin und sonstige flüssige Biokraftstoffe, in tausend Tonnen. Die Daten werden über Standardfragebögen auf Grundlage der EU-Verordnung über die Energiestatistik (Verordnung (EG) Nr. 1099/2008) erhoben.',
      fr: 'Capacités de production de biocarburants liquides : bioessence, biodiesels, biokérosène et autres biocarburants liquides, en milliers de tonnes. Les données sont collectées au moyen de questionnaires standard en vertu du règlement de l’UE sur les statistiques de l’énergie (règlement (CE) n° 1099/2008).',
    },
  },
  'meta:nrg_inf_stcs': {
    title: {
      en: 'Solar thermal collectors’ surface (nrg_inf_stcs)',
      de: 'Fläche solarthermischer Kollektoren (nrg_inf_stcs)',
      fr: 'Surface des capteurs solaires thermiques (nrg_inf_stcs)',
    },
    text: {
      en: 'The surface of solar collectors for solar thermal energy (not solar photovoltaics), in thousand square metres. The data are collected through standard questionnaires under the EU regulation on energy statistics (Regulation (EC) No 1099/2008).',
      de: 'Die Fläche der Kollektoren für Solarthermie (nicht Photovoltaik), in tausend Quadratmetern. Die Daten werden über Standardfragebögen auf Grundlage der EU-Verordnung über die Energiestatistik (Verordnung (EG) Nr. 1099/2008) erhoben.',
      fr: 'La surface des capteurs solaires thermiques (hors photovoltaïque), en milliers de mètres carrés. Les données sont collectées au moyen de questionnaires standard en vertu du règlement de l’UE sur les statistiques de l’énergie (règlement (CE) n° 1099/2008).',
    },
  },
  'meta:nrg_inf_hptc': {
    title: {
      en: 'Heat pumps - technical characteristics by technologies (nrg_inf_hptc)',
      de: 'Wärmepumpen – technische Merkmale nach Technologien (nrg_inf_hptc)',
      fr: 'Pompes à chaleur – caractéristiques techniques par technologie (nrg_inf_hptc)',
    },
    text: {
      en: 'Technical characteristics of heat pumps by technology: the net maximum thermal capacity, the average seasonal performance factor (SPF) and the average time of use.',
      de: 'Technische Merkmale von Wärmepumpen nach Technologie: die maximale thermische Nettoleistung, die durchschnittliche Jahresarbeitszahl (SPF) und die durchschnittliche Nutzungsdauer.',
      fr: 'Caractéristiques techniques des pompes à chaleur par technologie : la capacité thermique maximale nette, le facteur de performance saisonnier moyen (SPF) et la durée moyenne d’utilisation.',
    },
  },
  'meta:nrg_inf_nuc': {
    title: {
      en: 'Nuclear energy facilities (nrg_inf_nuc)',
      de: 'Kernenergieanlagen (nrg_inf_nuc)',
      fr: 'Installations d’énergie nucléaire (nrg_inf_nuc)',
    },
    text: {
      en: 'Statistics on the civil use of nuclear energy: enrichment capacity, production capacity and production of fresh and MOX fuel elements, production of nuclear heat, the average burn-up of discharged fuel, and the production and capacity of uranium and plutonium reprocessing plants.',
      de: 'Statistiken zur zivilen Nutzung der Kernenergie: Anreicherungskapazität, Produktionskapazität und Produktion frischer Brennelemente und MOX-Brennelemente, Erzeugung von Kernwärme, der durchschnittliche Abbrand entladener Brennelemente sowie Produktion und Kapazität von Wiederaufarbeitungsanlagen für Uran und Plutonium.',
      fr: 'Statistiques sur l’utilisation civile de l’énergie nucléaire : capacité d’enrichissement, capacité de production et production d’éléments combustibles neufs et MOX, production de chaleur nucléaire, taux de combustion moyen du combustible déchargé, et production et capacité des usines de retraitement d’uranium et de plutonium.',
    },
  },
  'meta:nrg_ti_sff': {
    title: {
      en: 'Trade by partner country (nrg_t)',
      de: 'Handel nach Partnerland (nrg_t)',
      fr: 'Échanges par pays partenaire (nrg_t)',
    },
    text: {
      en: 'Annual imports and exports of energy carriers such as crude oil and petroleum products, natural gas, electricity, solid fossil fuels and combustible renewables, by country of origin and destination. The data cover in principle the EU Member States, EFTA countries and EU candidate and potential candidate countries, mostly from 1990.',
      de: 'Jährliche Einfuhren und Ausfuhren von Energieträgern wie Rohöl und Erdölerzeugnissen, Erdgas, Elektrizität, festen fossilen Brennstoffen und brennbaren erneuerbaren Energien, nach Herkunfts- und Bestimmungsland. Die Daten umfassen grundsätzlich die EU-Mitgliedstaaten, die EFTA-Länder sowie die Kandidatenländer und potenziellen Kandidatenländer der EU, meist ab 1990.',
      fr: 'Importations et exportations annuelles de vecteurs énergétiques comme le pétrole brut et les produits pétroliers, le gaz naturel, l’électricité, les combustibles fossiles solides et les énergies renouvelables combustibles, par pays d’origine et de destination. Les données couvrent en principe les États membres de l’UE, les pays de l’AELE et les pays candidats et candidats potentiels, le plus souvent depuis 1990.',
    },
  },
  'meta:nrg_pc_202': {
    title: {
      en: 'Gas prices - bi-annual data (from 2007 onwards) (nrg_pc_202)',
      de: 'Gaspreise – halbjährliche Daten (ab 2007) (nrg_pc_202)',
      fr: 'Prix du gaz – données semestrielles (à partir de 2007) (nrg_pc_202)',
    },
    text: {
      en: 'European statistics on natural gas prices for household and non-household final customers, published twice a year.',
      de: 'Europäische Statistik der Erdgaspreise für Haushalte und Nichthaushaltskunden, zweimal jährlich veröffentlicht.',
      fr: 'Statistiques européennes sur les prix du gaz naturel pour les clients finals résidentiels et non résidentiels, publiées deux fois par an.',
    },
  },
  'meta:nrg_pc_204': {
    title: {
      en: 'Electricity prices - bi-annual data (from 2007 onwards) (nrg_pc_204)',
      de: 'Strompreise – halbjährliche Daten (ab 2007) (nrg_pc_204)',
      fr: 'Prix de l’électricité – données semestrielles (à partir de 2007) (nrg_pc_204)',
    },
    text: {
      en: 'European statistics on electricity prices for household and non-household final customers, published twice a year.',
      de: 'Europäische Statistik der Strompreise für Haushalte und Nichthaushaltskunden, zweimal jährlich veröffentlicht.',
      fr: 'Statistiques européennes sur les prix de l’électricité pour les clients finals résidentiels et non résidentiels, publiées deux fois par an.',
    },
  },
  'meta:ten00119': {
    title: {
      en: 'Market share of the largest generator in the electricity market (ten00119)',
      de: 'Marktanteil des größten Stromerzeugers (ten00119)',
      fr: 'Part de marché du plus grand producteur d’électricité (ten00119)',
    },
    text: {
      en: 'The indicator is based on annual data collected by Eurostat on the electricity market: the number of generating companies and their shares of national net generation and installed capacity, new and decommissioned capacity, and the number of retailers selling to final customers.',
      de: 'Der Indikator beruht auf jährlichen Daten, die Eurostat zum Strommarkt erhebt: Zahl der Stromerzeuger und ihre Anteile an der nationalen Nettoerzeugung und installierten Leistung, neu angeschlossene und stillgelegte Kapazität sowie die Zahl der Stromversorger für Endkunden.',
      fr: 'L’indicateur repose sur des données annuelles collectées par Eurostat sur le marché de l’électricité : nombre de producteurs et leurs parts de la production nette et de la capacité installée nationales, capacités nouvelles et déclassées, et nombre de fournisseurs vendant aux clients finals.',
    },
  },
  'meta:nrg_chdd_a': {
    title: {
      en: 'Energy statistics - cooling and heating degree days (nrg_chdd)',
      de: 'Energiestatistik – Kühl- und Heizgradtage (nrg_chdd)',
      fr: 'Statistiques de l’énergie – degrés-jours de refroidissement et de chauffage (nrg_chdd)',
    },
    text: {
      en: 'The heating degree day (HDD) index describes how much energy buildings need for heating, based on the weather; the cooling degree day (CDD) index does the same for cooling (air conditioning). Both are derived from observed air temperatures, interpolated to a 25 km grid across Europe.',
      de: 'Der Index der Heizgradtage (HDD) beschreibt anhand des Wetters, wie viel Energie Gebäude zum Heizen benötigen; der Index der Kühlgradtage (CDD) beschreibt dasselbe für die Kühlung (Klimatisierung). Beide werden aus gemessenen Lufttemperaturen abgeleitet, interpoliert auf ein 25-km-Raster für Europa.',
      fr: 'L’indice des degrés-jours de chauffage (DJC) décrit, selon la météo, les besoins en énergie de chauffage des bâtiments ; l’indice des degrés-jours de refroidissement (DJR) fait de même pour la climatisation. Tous deux sont calculés à partir des températures de l’air observées, interpolées sur une grille de 25 km pour l’Europe.',
    },
  },
}
