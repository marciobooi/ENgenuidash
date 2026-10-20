# SVGs for the presentation mode

What the infographic-style presentation (Present button) can use. **Status:** `draw` = I draw it inline in the code, `supply` = needs a designer or Eurostat's library, `have` = already in the project.

## Specification (for anything supplied)

- One SVG per file, `viewBox="0 0 64 64"` for pictograms, `0 0 3 2` style ratio for flags, transparent background.
- Pictograms: one colour only, `fill="currentColor"` (the app colours them yellow or dark blue). No text inside, no embedded fonts or bitmaps.
- File names: lower case, hyphens, as in the table (`wind-turbine.svg`).
- Illustrations: flat colours from the palette below, under 100 KB each.
- Palette: dark blue `#0b2a7a`, blue `#0e47cb`, light blue `#a9bfee`, yellow `#ffd617`, gold `#c9a227`, white `#ffffff`, ink `#14213d`.

## 1. Energy pictograms (25, status: draw)

| # | File | Shows | Used for |
|---|---|---|---|
| 1 | `wind-turbine.svg` | Wind turbine | wind, renewables |
| 2 | `solar-panel.svg` | Solar panel | solar, renewables |
| 3 | `hydro-dam.svg` | Dam with water | hydropower |
| 4 | `geothermal.svg` | Steam from the ground | geothermal |
| 5 | `biomass.svg` | Log and leaf | biomass, solid biomass |
| 6 | `biogas.svg` | Digester tank | biogas, bio-waste |
| 7 | `heat-pump.svg` | Unit with arrows | heating and cooling |
| 8 | `gas-flame.svg` | Flame | natural gas, heating |
| 9 | `oil-barrel.svg` | Barrel with drop | oil, oil security |
| 10 | `coal.svg` | Lumps of coal | solid fuels |
| 11 | `nuclear.svg` | Atom | nuclear |
| 12 | `pylon.svg` | Electricity pylon | electricity, networks |
| 13 | `plug.svg` | Plug | electricity use |
| 14 | `battery.svg` | Battery | storage |
| 15 | `electric-car.svg` | Car with plug | transport |
| 16 | `house.svg` | House | households, buildings |
| 17 | `factory.svg` | Factory | industry |
| 18 | `tanker.svg` | Ship | imports, trade |
| 19 | `pipeline.svg` | Pipe with valve | gas imports |
| 20 | `thermometer.svg` | Thermometer | cold homes, energy poverty |
| 21 | `euro-coin.svg` | Coin with euro sign | prices |
| 22 | `shield.svg` | Shield | energy security |
| 23 | `light-bulb.svg` | Bulb | efficiency |
| 24 | `family.svg` | Adult and child | households, people |
| 25 | `leaf.svg` | Leaf | renewables, shares |

## 2. Flags (32, status: draw)

27 EU Member States, plus Norway, Iceland, Türkiye and the United Kingdom, as simple geometric flags, plus the EU flag (ring of twelve stars).

`at be bg hr cy cz dk ee fi fr de el hu ie it lv lt lu mt nl pl pt ro sk si es se` · `no is tr uk` · `eu`

Used on comparison slides ("Germany vs France") and on a country's title slide.

## 3. Country shapes (27, status: draw from existing data)

Outlines of the 27 Member States taken from the geographic data the app already has (the map uses it). Used for a "country in the EU" slide. No files to supply.

## 4. Backgrounds (3, status: draw)

| File | Shows | Used for |
|---|---|---|
| `wave-light.svg` | Soft light-blue waves | title slide |
| `blob-yellow.svg` | Yellow rounded shape | quote and ring slides |
| `ribbon.svg` | Blue and yellow ribbon (as in the Eurostat banner) | closing slide (`have`: `src/assets/banner-graphical-element.svg`) |

## 5. Illustrated scenes (9, status: have)

Supplied as nine SVG scenes (800 x 600, Eurostat palette) and imported with `python3 scripts/import-scenes.py <folder>`: the labels are removed (the presentation writes its own words in the reader's language) and the ids made unique. The result is `src/genui/deck/art/scenes.ts`.

| Id | Scene | Chosen for |
|---|---|---|
| `scene-wind-farm` | Wind farm | renewables, wind |
| `scene-solar-roof` | Solar roof | solar, capacity, buildings |
| `scene-household` | Household with meter and lamp | households, poverty, prices |
| `scene-city-industry` | City and industry | efficiency, consumption, industry |
| `scene-tanker-pipeline` | Tanker and pipeline | trade, imports, dependence, security |
| `scene-energy-mix` | Ring chart with source icons | closing slide, mix, diversification |
| `scene-biomass-geothermal` | Biogas dome and geothermal well | biomass, biogas, geothermal |
| `scene-hydro-dam` | Hydroelectric dam | hydro |
| `scene-oil-pumps` | Oil pumps and tank | oil |

## Totals

- To draw: 25 pictograms, 32 flags, 3 backgrounds (one exists) and 27 country shapes from existing data.
- Supplied: 9 illustrated scenes (done).
