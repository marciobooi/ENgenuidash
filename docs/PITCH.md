# ENgenuidash: ask a question, see the answer

*A pitch you can say out loud. Start with the 30 seconds; the rest is there if they want more.*

---

## The 30 seconds (say this)

> "Today, when someone asks Eurostat a question like *'How dependent is Germany on gas?'*, they get
> a list of tables and codes, and they have to work out the answer themselves.
>
> ENgenuidash answers the question itself. You type it in your own language, and in a few seconds
> you get one page with the right charts, a plain sentence saying what they show, and the official
> source behind every number.
>
> Every number comes straight from Eurostat. The AI never makes one up."

---

## The problem, in plain words

Think of a huge library with no librarian. Everything is in there, but you have to know the shelf
code before you can find anything.

- Eurostat's energy section alone has **about 145 datasets**, each with its own codes and filters.
- Most people are **not statisticians**: citizens, students, journalists, civil servants.
- They arrive with a **question**. They leave with a **table**.
- Many do not read English comfortably, and a lot of the explanations are English only.

**ENgenuidash is the librarian:** you ask, it fetches and lays out the answer.

---

## What it does (five things, with real examples)

**1. It understands a normal question, in English, German or French.**
It copes with typos, with how people actually talk ("how is Spain doing?", "who sells Hungary its
gas?"), and with follow-ups like *"top 5"*, *"in 2018"* or *"add Germany"*.

**2. It builds the right page for that question.** Some examples:
- *"Energy profile of Germany"*: one page with the country's key figures, its rank among the 27
  EU countries, progress towards the 2030 goals, and what its energy is made of.
- *"Energy flow diagram"*: where a country's energy comes from, where it goes, and what is lost
  on the way. There is a version for households.
- *"Oil security in the EU"*: how much oil comes from where, how dependent we are, how many days
  of stock there are. Useful when oil is in the news.
- *"Where does France buy its gas?"*: the supplier countries, month by month if you want.
- *"Electricity price components"*: how much of the bill is energy, network and taxes.

**3. It explains in simple words.**
Each page has a short summary written from the numbers, and a definition of what is being
measured. Questions like *"What is biogas?"*, *"Why do renewables matter?"* or *"How is energy
dependency calculated?"* get a plain answer with a link to the Eurostat page it comes from.

**4. It lets you compare and dig.**
*"Compare with France"* puts two countries side by side, and a small switch on each chart flips it
between them. Filters, data tables and downloads are one click away.

**5. It remembers and shares.**
Past conversations are kept on your own computer, and one link rebuilds the exact same page for a
colleague.

---

## Why you can trust it

This is the point to stress. Most people's worry about AI is that it invents things.

- **The numbers are never written by AI.** They come live from Eurostat's own data service.
- **The AI only arranges the page.** It decides which charts to show, never what the figures are.
- **Every chart names its source** and links back to Eurostat.
- **The sentences are calculated from the data**, for example "Romania had the biggest rise".
- **Gaps are shown, not hidden.** If a country has no data, the page says so.
- The optional AI helper that writes longer explanations **runs on the user's own device**, and
  the app **checks that any number it mentions really is in the sources**.

---

## Why it suits Eurostat

| Question a boss asks | The short answer |
|---|---|
| Is it accurate? | Numbers only come from Eurostat. Nothing is generated. |
| What about privacy? | There is no server collecting questions. The AI runs on the user's device. Nothing goes to an AI company. |
| What does it cost to run? | No per-question fees and no special servers. It can be hosted like an ordinary website. |
| Does it look official? | It uses the Commission's own design system and chart service. |
| Is it accessible? | Keyboard use, screen-reader descriptions for every chart, and a data table behind each one. |
| Which languages? | English, German and French today. Adding more means adding translations, not rebuilding. |
| Is it solid? | Nearly 280 automated tests run on every change. |

---

## Who benefits

- **Citizens and students:** get an answer without learning dataset codes.
- **Journalists:** a correct, sourced chart in seconds, with a link to share.
- **Policy officers and analysts:** a fast first look and comparisons, then the data to download.
- **Eurostat:** more people reaching its data, fewer "where do I find…?" requests, and an example
  of AI used in a trustworthy way.

---

## A 5-minute demo (follow these steps)

1. **Type "Energy profile of Germany".** Show the one-page picture: key figures, rank in the EU,
   the 2030 goals. *Say:* "Everything here is live Eurostat data."
2. **Type "Compare with France".** Two countries side by side. Click the small switch on a chart
   to flip it between them.
3. **Type "Hungary buys gas from whom".** Show the suppliers, then **"compare with the EU"**.
   *Say:* "Look at how much more it relies on one supplier than the EU does."
4. **Type "Why are renewables important?"** A plain explanation with its sources. *Say:* "Written
   for people who are not experts, with the Eurostat page behind it."
5. **Type "Oil security in the EU".** *Say:* "This is the kind of page that matters when oil
   is in the news."
6. **Switch the language to German.** The whole page translates, including the definitions.
7. **Copy the link** and open it in a new tab, or open **History** to show past conversations.

---

## Questions you may be asked

**"Can the AI be wrong?"**
It cannot invent a number, because it never writes them. It can misunderstand an unusual question.
When it does, it says so and offers the closest pages instead of guessing.

**"Does it send our questions to an AI company?"**
No. There is no server in the middle. The optional AI helper runs inside the user's own browser.

**"How much work is it to add other topics, such as prices, environment or transport?"**
The method is the same, so it is a matter of adding datasets and a few page designs, not
starting again. Energy took the longest because it is the first.

**"What if Eurostat's service is down?"**
The page says the data service is unavailable instead of showing something wrong.

**"Is this finished?"**
It is a working prototype that already covers energy well. The next step is to see how real people
use it.

---

## Honest limits

- **Energy only** for now (about 145 datasets).
- **Unusual wording** may not be understood. The app says so and suggests pages instead of
  guessing, and we can keep teaching it from the questions that fail.
- **The optional AI helper** is a one-time download of roughly 0.6 to 1.4 GB, depending on the
  device. Everything else works without it.
- **Translations:** the interface, pages and definitions are in three languages, but only the 26
  most-used indicator descriptions are fully translated; the rest show Eurostat's English text.
- **Not yet tested with real users** from Eurostat's audience.

---

## What we are asking for

1. **A pilot of 4 to 6 weeks.** Host it internally for a small group (communication,
   dissemination, a few outside users).
2. **Measure it:** which questions people ask, which ones fail, and how long it takes to get an
   answer compared with the data browser.
3. **Then decide** whether to extend it to more topics and more EU languages.

> **One-line pitch:** *"Ask Eurostat a question in your own language and get an official, sourced
> page in seconds, with AI arranging the answer but never inventing the numbers."*
