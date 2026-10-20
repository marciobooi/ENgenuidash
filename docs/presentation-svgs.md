# SVGs for the presentation mode

What the infographic-style presentation (Present button) can use. **Status:** `draw` = I draw it inline in the code, `supply` = needs a designer or Eurostat's library, `have` = already in the project.

## Specification (for anything supplied)

- One SVG per file, `viewBox="0 0 64 64"` for pictograms, `0 0 3 2` style ratio for flags, transparent background.
- Pictograms: one colour only, `fill="currentColor"` (the app colours them yellow or dark blue). No text inside, no embedded fonts or bitmaps.
- File names: lower case, hyphens, as in the table (`wind-turbine.svg`).
- Illustrations: flat colours from the palette below, under 100 KB each.
- Palette: dark blue `#0b2a7a`, blue `#0e47cb`, light blue `#a9bfee`, yellow `#ffd617`, gold `#c9a227`, white `#ffffff`, ink `#14213d`.

## 1. Energy pictograms (24, status: draw)

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

## 5. Illustrations (6, status: supply, optional)

The illustrated style of the examples (people, objects, scenes). Flat, colours from the palette, no outlines needed.

| # | File | Scene | Used for |
|---|---|---|---|
| 1 | `scene-wind-farm.svg` | Wind turbines on a hill, a small village | renewables title slide |
| 2 | `scene-solar-roof.svg` | House with solar panels, person on a ladder | solar, buildings |
| 3 | `scene-household.svg` | Family at home, thermostat or meter | households, energy poverty |
| 4 | `scene-city-industry.svg` | Chimneys, offices, a train | efficiency, industry |
| 5 | `scene-tanker-pipeline.svg` | Tanker and pipeline across the sea | trade, energy security |
| 6 | `scene-energy-mix.svg` | Plug at the centre with icons of sources around it | closing slide |

## Totals

- To draw: 24 pictograms, 32 flags, 3 backgrounds (one exists) and 27 country shapes from existing data.
- To supply, optional: 6 illustrations. Check that the licence of any Eurostat artwork allows reuse in this tool.

Delivery: drop SVG files in `scripts/temp/` and I will clean them (remove metadata and fixed sizes), recolour where needed and wire them in.
