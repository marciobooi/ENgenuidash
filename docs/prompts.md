Questions

Entrade: 
	- Imports of oil and petroleum products by partner: Eu , 2024
	- Imports of natural gas by partner: France, 2024
	- Imports: Natural gas, Germany, July 2025
	- Exports of oil and petroleum products by partner, EU, March 2023
	- where does France import gas from in May 2024
  	- show energy trade between spain and germany
  	- Oil and petroleum products trade between france and germany, 2022

ENbal: 
	- energy balance of the EU 2024
    	- European Union (27 countries), Total - main fuel families, 2024

Enprices: 
	- what does the electricity price consist of
	- show all available countries for Electricity prices for household consumers
	- Gas price for non-household: Netherlands, 2025
	- now components


Endash: 
	- Share of energy from renewable sources
	- Energy intensity
	- Final energy consumption in services by type of fuel
	- Energy profile: Germany
	- energy profile of households in Germany
	- industry energy profile of France
	- energy profile of Germany per capita
	- energy profile of Germany vs France
	- country energy dashboard for Spain
	- Energieprofil Deutschland
	- profil énergétique de la France
	- key energy indicators Italy

Ensankey:
	- Energy flow diagram: European Union - 27 countries, 2024
	- Energy flow diagram, households: Germany, 2024
	- sankey Germany 2022
	- energy flow diagram of Germany in GWh
	- energy flows of the EU by fuel
	- Energieflussdiagramm Deutschland
	- show me the energy flows of Poland
	- energy flow diagram household
	- the energy flow for house hold in ue in 2020
	- energy flow of homes in France
	- sankey diagram for households Spain 2023


Enmonthly:
	- Supply, transformation and consumption of gas - monthly data
	- Renewables vs non-renewables electricity monthly EU
	- Net electricity generation, renewables and non-renewables: EU-27, June 2026
	- Net electricity generation, renewables and non-renewables: Germany, Spain, France, July 2026
	- Closing stock - national territory: Oil and petroleum products, EU-27, June 2026
	- Crude oil imports: price and volume, 27 countries selected (weighted average), July 2026
	- crude oil prices
	- monthly imports of natural gas by partner Germany
	- monthly oil stocks in the EU

Enoil:
	- oil security dashboard for Germany
	- How dependent is Italy on Russian oil?
	- Oil crisis in the EU
	- Oil stock cover in Germany
	- Russian oil in the EU
	- Petroleum situation in Spain
	- Ölversorgung Krise Deutschland
	- sécurité pétrolière France
	- how many days of oil stocks does Germany have
	- how much oil does Europe import from Russia

Geral:
	- Gross and net production of electricity and derived heat by type of plant and operator
	- Renewable share vs the 2030 target in eu
	- Disaggregated final energy consumption in households - quantities
	- Renewable share vs the 2030 target in eu
	- Renewable energy share Germany vs France and the 2030 target
	- Primary and final energy consumption and the 2030 efficiency targets
	- Final energy consumption in transport by type of fuel
	- Gross production of electricity and derived heat from combustible fuels by type of plant and operator

Definitions (answered in the chat from our written-up concepts, no dashboard; what / why / how / where the data come from):
	- what is biogas?
	- what is wind energy?
	- what is LNG?
	- what is energy poverty?
	- what is the difference between capacity and generation?
	- what is the difference between primary and final energy?
	- what is the EU target for renewables in 2030?
	- why are renewables important?
	- why is energy security important?
	- why is energy efficiency important?
	- how is natural gas calculated?
	- how is the share of renewables calculated?
	- how is energy dependency calculated?
	- how is gross available energy calculated?
	- how are energy prices calculated?
	- how do we get data on wind power?
	- where does Eurostat get energy data?
	- how often is energy data updated?
	- Was ist Biogas?
	- Warum sind erneuerbare Energien wichtig?
	- Woher kommen die Winddaten?
	- Qu'est-ce que l'énergie éolienne ?
	- Comment sont calculés les prix de l'énergie ?


Country profile:
	- Energy profile: Germany
	- Energy profile of Germany per capita
	- Energy profile of households in Germany (or "industry energy profile of France")
	- Energy profile of Germany vs France
	- Portugal profile 
	- show me the energy scorecard of Spain in 2022
	- fetch the energy overview of ue
	- grab the key indicators for France

Not a view of their own (they keep their ordinary dashboard):
	- oil consumption in Spain
	- what is a sankey diagram

Notes (kept in step with src/genui/prompts.test.ts, which runs every line above):
	* Gas and oil imports/exports with a month named ("... July 2025") open the monthly trade by partner in Entrade (Yearly/Monthly switch in its toolbar); "monthly gas imports of Germany" and "gas balance ..." are the monthly gas balance.
	* "Crude oil imports: price and volume ..." and "crude oil prices" are the monthly crude oil dashboard (Enmonthly).
	* "now components" is a follow-up: it works on the price dashboard already on screen.
	* Definitions: "what is / why is ... important / how is ... calculated / where does the data come from" for the concepts in src/llm/concepts.json are answered in the chat, in the language asked, with their Eurostat sources. Terms of the official glossary (crude oil, heat pump, toe ...) keep their glossary definition; a question that adds a country or a year ("what is the price of gas in Germany") is still a dashboard.
	* Other ways of asking (synonyms such as "energy passport", "who supplies Germany with gas", "how much does electricity cost", polite openers, German and French) are listed in src/genui/phrasings.test.ts; add a line there whenever a question is not understood.
