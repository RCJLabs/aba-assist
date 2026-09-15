# ABA Assist

A free, offline-first reference and study app for people working in Applied Behavior
Analysis — behavior technicians, BCBAs and BCaBAs, paraeducators, and certification
candidates.

**Status: M0 (foundation).** The content pipeline, safety and copyright guards, app shell,
and CI are in place, with a small seed glossary. The full plan lives in the project notes;
this README covers how to work in the repo.

---

## What this app deliberately does not do

These are designed features, not omissions, and several are enforced by the build:

- **No instruction on restraint, seclusion, or physical management.** That is a certified,
  hands-on competency governed by an employer's policy and by state law. An app cannot know
  whether a reader has been trained, what a person's plan authorizes, or what a
  jurisdiction permits.
- **No individualized clinical recommendations.** Technicians implement plans under
  supervision; they do not design, modify, or interpret them.
- **No client data, ever.** There is no field anywhere in the data model capable of holding
  a person's name.
- **No verbatim text from certifying bodies or textbooks.** Domain names, task codes, and
  exam weights are facts and are used as such; all explanatory prose is written from
  scratch and cited.

Not affiliated with, endorsed by, or sponsored by any certifying body.

---

## Getting started

```bash
npm install          # also builds the workspace packages and runs svelte-kit sync
npm run dev          # dev server; content recompiles on change
npm run build        # production build — fails unless all content is `approved`
npm run preview      # serve the built site
```

### Everyday commands

| Command                        | What it does                                               |
| ------------------------------ | ---------------------------------------------------------- |
| `npm run content`              | Run the content compiler (`check` / `build`, `--channel=`) |
| `npm run content:apply-review` | Apply a reviewer's exported decisions to the content files |
| `npm run check`                | `svelte-check` type checking                               |
| `npm run lint`                 | Prettier + ESLint                                          |
| `npm test`                     | Unit tests (schemas, guards, compiler)                     |
| `npm run test:e2e`             | Playwright, including the axe accessibility sweep          |

---

## How content works

Content is authored as files in `content/`, not in a CMS. Review is therefore a pull
request: you read a diff, not a web form.

```
content/
  _registry/sources.yaml   bibliography, with per-source rights and quotation permissions
  taxonomy/*.yaml          credential domains and task codes (facts only)
  terms/<category>/*.md    glossary entries
  scenarios/<kind>/*.md    situational guidance and escalation cards
```

`packages/content-build` validates everything and compiles it to JSON plus a prebuilt
search index. It runs as a **Vite plugin**, inside `buildStart` — not as a `prebuild`
script, because a script is bypassable (`npx vite build`, an IDE task, a pipeline change)
and a bypassable gate is not a gate.

### Review channels

| Channel   | Allows                      | Used by            |
| --------- | --------------------------- | ------------------ |
| `dev`     | anything, including `draft` | local authoring    |
| `pr`      | rejects `draft`             | pull-request CI    |
| `release` | **only `approved`**         | production deploys |

`npm run build` defaults to `release`, so a production build cannot contain unreviewed
content. An item approved by its own author is rejected too — review has to be independent.

### Tiered review, because uniform review of 456 items is not a plan

Everything is born unreviewed and the release channel ships nothing that is not approved,
so the backlog is the thing standing between the app and a release. Reviewing it all to
the same depth is not realistic and would not be a good use of the depth anyway: a wrong
gloss on "count" costs a reader a moment, and a wrong line on an escalation card costs
something else.

`/review` sorts the queue into three tiers, and the tier is **derived** rather than
tagged, so it stays true as content is added:

- **Tier A, read every one.** Situations, both ethics codes and every ethics topic,
  credential requirements, practice guides — and any glossary term in the ethics or
  supervision categories, or whose prose trips the risk or clinical-decision lexicon. Add
  a definition that mentions self-injury and it promotes itself on the next build.
- **Tier B, read every one this pass.** Questions, graphs, and the exam outlines. Wrong
  answers with confident rationales are the defining failure of the apps in this market.
- **Tier C, sampled.** Ordinary definitions, carried by the validator, the citations and a
  draw from each batch.

Each tier shows how many items are left and roughly how long they will take, which is what
turns "456 unreviewed" into a number of evenings.

**Sampling is real and is recorded as such.** A batch is one glossary category. The draw is
seeded by the batch name and the content version, so it is reproducible, it does not depend
on the order the loader returned items in, and it changes when the content changes rather
than re-approving rows somebody already saw. Only the drawn items are queued — a reviewer
who reads the whole batch has not sampled, and one who reads the first few has drawn a
sample by convenience, which is the thing sampling exists to avoid. **One flagged item in a
draw stops the batch**: the sample said something, and what it said was that this batch
needs reading.

The rate is the reviewer's choice, from a tenth up to all of it. Nothing about that
decision belongs to the author.

Carried approvals say so in the file. `Term` alone carries `reviewMethod` and
`sampledWith`, and every other schema is strict — so `reviewMethod: sampled` on an
escalation card is a parse error rather than a judgement call. The build also rejects an
approved term that does not say how it was approved, a sampled approval that does not name
its draw, and a method set on anything that is not approved. Afterwards, anybody can tell
which items a human read and which a draw carried, which is the whole point: an approval
that hides its own basis is worth less than one that states it.

### Doing the review

Review is the one step in this project that cannot be automated away, so it has a tool of
its own. `/review` in the running app is a queue: one entry at a time, every field it
carries plus the author's account of what it was written from, and two buttons. Decisions
are kept in IndexedDB on the device and never sent anywhere — a decision only means
something once it is in git.

When a pass is done, the page exports the decisions as JSON, and:

```sh
npm run content:apply-review -- --file=aba-assist-review-2026-09-15.json --dry-run
npm run content:apply-review -- --file=aba-assist-review-2026-09-15.json
```

That rewrites the `review:` block of each decided item — `approved` with your reviewer id
and the date, or `needs-update` with your note — and nothing else in the file. The diff is
the record, and it is small enough to read. Three things it refuses to do: sign an
approval as the item's author, record a flag with no note saying what is wrong, or apply
half a pass (any error and nothing is written at all).

One wrinkle worth knowing about: question files share a single `review:` block across a
whole file by YAML anchor. The moment one question in that file is decided differently
from its neighbours the anchor is no longer true, so the tool writes every block in that
file out in full. That is why an approval of one question can show up as a large diff.

### The two structural guards

Both make the wrong thing impossible to express, rather than something a reviewer has to
notice:

1. **Copyright.** Every content schema spreads in `OfficialTextGuard`, where
   `officialText` and `officialTitle` are typed `z.null()`. Writing verbatim source text
   into a content file is a parse error. Schemas are strict, so a stray `officialText2:`
   fails too. Rights live on the _source_, so the same machinery covers textbooks — the
   higher-risk case — not just certifying-body documents.

2. **Safety.** Scenarios are a discriminated union whose members have different _shapes_.
   `kind: 'escalation-only'` has no `steps` field anywhere in its schema, so writing
   procedural instruction into a restraint, self-injury, or suspected-abuse scenario is a
   parse error. A risk lexicon over `guidance` prose catches the author who forgot the
   flag, and escalation completeness is checked by rule (medical emergency ⇒ 911;
   suspected abuse ⇒ protective services plus a mandated-reporter note; and so on).

`packages/*/src/*.test.ts` assert that each of these guards actually _rejects_ — a guard
never observed to fail is a comment, not a guard.

---

## The question bank has to be able to fill the paper it simulates

The simulator was built to refuse to pad a thin bank by repeating items, so a short bank
never produced a wrong number on screen — it produced a shorter paper and said so. That is
honest, and it is also not the product: the technician exam is 85 items and the bank held
65, so the headline feature quietly was not the thing it said it was.

Coverage is now checked at build time (`checkExamCoverage`) and held by a test. The build
warns per area when the bank cannot fill one full paper, and warns for any task on the
outline that no question cites. The test in `src/lib/quiz/blueprint.test.ts` is the
ratchet: it fails if the technician bank cannot run a full-length paper, if any area drops
below 1.4× the items that area contributes to one paper, or if any of the 43 tasks has no
question. Raise `RBT_MIN_RATIO` as the bank grows and the build gets harder to pass, which
is the only mechanism that reliably stops content rot.

The BCBA bank is still far short and the build says so on every run — that is a backlog
being named rather than a defect being hidden.

## The one place a safety guard had to be narrowed, and why

The scenario schema forbids procedural language inside an escalation card: physical
management is a certified hands-on competency, and an app that describes it is doing harm
whatever its intentions. That check ran over the whole card, which meant the single most
important refusal the app can make — _you have been told to restrain or seclude a learner_
— could not be written, because its title contains the word.

A card whose entire purpose is to refuse has to be able to say what it is refusing. So the
check now applies two standards to the two halves of a card, which do different jobs:

- The **escalation block** is where the app speaks. Nothing in the restricted lexicon may
  appear there, with no exceptions, including the words below.
- The **title and situation** are where the card repeats back what is happening to the
  reader. There, and only there, `restraint` and `seclusion` may be named — and only when
  the matching `riskFlag` is declared, so naming a situation and classifying it cannot come
  apart.

Every other word in the lexicon (`hold them`, `prone`, `escort`, `pin`, `takedown`…) stays
forbidden everywhere. Four tests hold the shape: the card that names what it refuses is
accepted; naming a restricted procedure without the matching flag is rejected; a situation
that describes _how_ it is done is rejected; and the named word inside the escalation block
is rejected, flag or no flag. The build caught a genuine slip while this was being written
— "staff holding a current certification" in a legal note — which is the guard working
rather than a reason to loosen it further.

## Graphs are content, not pictures

Data collection and graphing is the second-largest domain on the technician exam, and
this app taught it entirely in words: eight glossary entries describing a line graph to
somebody who had never been shown one. `/graphs` is six worked graphs — the parts of a
line graph, a change in level, a baseline that was already improving, data too variable
to read, a reversal, and a multiple baseline — each one built from a reviewed YAML
document under `content/graphs/` and rendered as SVG at runtime.

Three guards are structural rather than editorial:

- **`fictional` is `z.literal(true)`.** Every series in this repository is invented to
  show one thing. A graph of one person's behaviour is that person's data however the
  axes are labelled, so "this is real" is unsayable rather than discouraged — the same
  move as the copyright and supervisee-code guards.
- **`longDescription` is required, and the build checks it names every condition on the
  graph.** A picture with no equivalent is not accessible content, and an alternative
  that omits a phase is not an equivalent. The renderer also emits the full data table,
  so the numbers are always reachable without reading pixels.
- **A truncated vertical axis has to say why.** `y.from` other than zero without a
  `yAxisNote` fails the build, and a note without a truncated axis fails too. A scale
  that starts part-way up is the commonest way an accurate graph misleads, and it is
  exactly what this domain is about.

The build also rejects a point plotted outside the axes (the renderer would clip it
silently), conditions that leave a gap or overlap, two series that would differ by colour
alone, and a multiple baseline whose tiers change at the same time — which is an AB
replicated three times wearing a multiple baseline's clothes.

One rendering rule is load-bearing enough to be unit-tested rather than eyeballed: the
data path is **split at every phase change**. A line drawn across a phase-change line
asserts that the sessions either side belong to the same condition, which is the exact
comparison the change was made to allow. A staggered design is drawn as stacked tiers for
the same reason — one frame with three sets of phase lines says that every change applied
to every behaviour.

## The tracker, and why it stores no client data

`/tools` logs supervision contacts and professional-development units against the real
requirements. It is the one place in the app where somebody types about their working day,
so it is also the one place a client's name could end up in storage — and storing none is
what keeps this app outside HIPAA entirely.

The defence is the data model, not a warning. There is no `clientName` field, no `dob`, no
`address`: a supervisee is identified by a `code` constrained to `^[A-Z]{1,3}[-_ ]?\d{1,4}$`,
which cannot spell a name, and contact formats are enums. The one free-text note runs a
client-side linter that warns on names, dates of birth, phone numbers, addresses and record
numbers. It warns rather than blocks, because it cannot tell "Jamie Rivera" from "Safety
Care" and a blocker that fires on the second teaches people to work around it.

The thresholds it checks against — 5% of monthly service hours, two contacts, 12 PDUs, 32
CEUs with 4 on ethics — are not constants in the code. They live in `content/credentials/`
beside the prose that states them, carrying the same handbook locator and going through the
same review queue, so there is one copy of each number rather than two that drift.

## Fieldwork is checked a month at a time, not as a running total

`/tools/fieldwork` is for analyst trainees, and it is deliberately not a progress bar with
hours in it. Supervised fieldwork is verified one calendar month at a time: a month below
its floor is worth **nothing**, not less, and hours above its ceiling are dropped. Somebody
who adds their hours up and watches the number climb can arrive at verification a year
later hundreds of hours short of what they thought they had, with nothing to be done about
it. So each month gets its own verdict with the reason attached, while there is still time
to fix the month — and the summary reports the hours that will not count as a figure of
its own, because that is what turns "I logged 2000 hours" into "1840 of them count".

Two ratios in the handbook — how much supervision must be one-to-one, how much of the work
must be unrestricted — are stated as requirements without the text saying whether they are
checked inside each month or across the whole experience. That difference decides whether a
light month is a lost month. So the tracker shows those two as **figures and withholds the
verdict**, saying plainly that it has not verified the scope and that the supervisor is who
to ask. It is the same posture as `standardsVerified` in the ethics content: an unverified
number is reported, never ruled on.

The numbers themselves — the floor and ceiling, the supervision percentages, the contact
counts, the 1.33 multiplier on concentrated hours, and the second ruleset that takes effect
in 2027 — live in `content/credentials/bcba.yaml` with their handbook locators, not in the
code. The schema rejects a `scopeVerified: true` ratio with no scope, a scope claimed
without verification, and a multiplier that does not reconcile with the two hour totals it
sits between.

## The interval timer records nothing

`/tools/timer` is a repeating cue for partial interval, whole interval and momentary time
sampling. It exists rather than a link to a stopwatch because the three procedures differ
in _when_ you score, and each biases the estimate a known way — partial overestimates,
whole underestimates, momentary is closest — which the setup screen says before the run
starts, because a technician who does not know that hands their supervisor a number
meaning something other than it appears to.

It shows a running percentage of intervals so the totals can be copied onto whatever data
sheet the organisation actually uses, **and then it throws them away**. A per-interval
record of one person's behaviour is client data however anonymous the row looks, and the
promise that this app holds none is worth more than the convenience of keeping it. Only
the settings persist.

Two implementation notes. Timing is a start timestamp plus arithmetic, never a counter:
browsers throttle a hidden tab's timers to roughly once a minute and phones lock, and a
drifting interval timer silently invalidates the data collected with it — so coming back
catches up to the clock instead of resuming where the last tick left off. And the app
takes a screen wake lock for the duration, because this is a tool somebody watches for ten
minutes without touching.

## Your data lives on your device, which is a risk as well as a promise

There is no account and nothing leaves the browser — which also means nobody else has a
copy. Two things make that survivable rather than just private.

**The app asks to keep its storage.** Safari and iOS clear a non-installed site's
IndexedDB after roughly a week of inactivity. For spaced repetition that is exactly
backwards: the reader who studies weekly is who the scheduling is for, and who loses it.
`navigator.storage.persist()` is requested after the first graded card or logged
supervision contact — not on arrival, because a permission prompt from a page somebody
has not used yet is the kind that gets denied for good. Settings says plainly whether the
browser agreed.

**Backup, restore and delete are in Settings.** The backup is one JSON file. Restoring
replaces everything on the device rather than merging, because merging two devices' review
histories means deciding which one is true, and getting that wrong corrupts the thing
people most want back — so the semantics are one thing the UI can state and the reader can
confirm.

The import is a trust boundary and is validated accordingly: a file this app did not
write is refused by name, a file from a newer build is refused rather than silently
losing the stores this build has no home for, rows are validated one at a time so a
single corrupt flashcard cannot cost somebody two years of supervision records, and
everything dropped is reported — a restore that lost a year of logs must not look like
one that did not. The supervisee-code rule is enforced here too: a backup carrying a name
where a code belongs has that row rejected, because the guard that keeps this app out of
HIPAA has to hold at every door, not only the form.

## Performance budgets, and what measuring first turned up

The build plan makes Lighthouse budgets a gate on every milestone and they were never
wired. Wiring them found three things, and only one of them was the app's fault.

**The test server was lying.** `serve-pages.mjs` exists because GitHub Pages resolves
extensionless URLs with a 200 where a generic server sends a 301, which breaks
service-worker precaching. It did not, however, gzip — and Pages does. The first audit
therefore blamed the app for 497 KB production never sends. It compresses now, which also
makes every Playwright run measure something closer to what a reader gets.

**The home page shipped the whole corpus to render two numbers.** It imported `scenarios`
and `graphList` for their `.length`, and importing anything at all from `load.ts` pulled
the ethics codes, every topic, the graphs, the practice guides and the credential facts,
because they all sat in the same eagerly-imported module. The counts now come from the
compiled manifest, and the corpora moved to `corpus.ts` — the split is by load shape
rather than by subject, so `load.ts` holds what every page needs and `corpus.ts` holds
what particular pages need.

**Zod was in the browser bundle.** The schema package's barrel builds every schema at
module scope, so one named import of `CATEGORY_LABELS` or `searchOptions` dragged the
whole validation library in — a hundred kilobytes of parser shipped to render a category
heading. `@aba/content-schema/runtime` is the Zod-free half: categories, the safety
lexicons, the MiniSearch options. Nothing in it may import Zod, and the script budget is
what catches it if something does.

Together: the home page went from 669 KB of script to 77 KB, first contentful paint from
5.0 s to 1.7 s on the emulated mid-tier phone, and Performance from 0.68 to 0.98.

`npm run test:perf` runs it locally; CI runs it on every push. The budgets are in
`lighthouse-budgets.json` and the assertions in `lighthouserc.json`, both set from
measured margins rather than aspiration — roughly 40% headroom on the worst route, which
is enough that ordinary noise does not fail a build and small enough to notice a
regression.

Two audits are deliberately off. `is-crawlable` fails because a preview build's
`robots.txt` disallows everything, which is correct and flips on its own once review
completes. `unused-javascript` fires on route-split code that another route needs.

**Installability moved out of Lighthouse.** Lighthouse 12 removed the PWA category and
every manifest and service-worker audit with it, so the plan's "PWA installable" gate had
nothing left to assert against. It now lives in `e2e/installable.spec.ts`, checking
Chrome's actual criteria: a named manifest, a display mode that opens outside the browser,
icons at 192 and 512 with a maskable one, every icon actually fetchable, a start URL
inside the scope, and a service worker that takes control rather than merely installing. A
gate that silently stopped being checked is worse than one nobody wrote down.

## Accessibility

Target is WCAG 2.2 AA, and the axe sweep runs over every route in light, dark, 320px, and
forced-colors, with zero tolerance and no baseline file. Automated checks catch perhaps a
third of real problems, so each milestone also gets a manual screen-reader pass.

Notable choices:

- **App-shell layout** — `main` is the scroll container, so the header and bottom nav never
  overlay content. A sticky bar over a scrolling document permanently covers whatever is
  beneath it, which makes those links genuinely un-tappable.
- **Bottom navigation** — primary controls in the thumb zone, because this is used standing
  up, mid-session, often one-handed.
- **Plain-language gloss on every term**, with a readability gate in the build.
- **Taps before gestures** — any swipe affordance must have a single-pointer equivalent.

---

## Deployment

Static output to GitHub Pages. Two things to know:

- **The site must be served from an origin root** (a custom domain, or a user/org Pages
  site). Android verifies a Trusted Web Activity through
  `https://<origin>/.well-known/assetlinks.json`, which a _project_ Pages site
  (`user.github.io/aba-assist/`) cannot serve. `static/.nojekyll` is required too, or Jekyll
  silently hides the dot-directory and the file 404s.
- Pages from a **private** repo requires a paid GitHub plan.

### The base path is one decision, kept in one file

`static/CNAME` decides everything downstream. The deploy workflow reads it and sets
`ABA_BASE_PATH` from it: present means the app owns an origin and the prefix is empty;
absent means a project site served from `/<repo>/`. The prefix in turn determines the
service-worker scope, the PWA scope, and every precached URL — so the two must never
disagree, and the only way to keep that true is to derive one from the other.

**Changing it invalidates every cached URL for existing installs.** Settle it before the
service worker reaches anyone who matters.

### Moving to `aba.rcjlabs.com`

The root domain serves something else, and a subdomain is its own origin — which is all
Android's asset-links check needs. In order:

1. **In Squarespace DNS**, add a CNAME record: host `aba`, value `rcjlabs.github.io.`
   (trailing dot). Not an A record, and not a forwarding rule — a redirect is a different
   origin and breaks TWA verification.
2. Wait until `dig +short aba.rcjlabs.com` returns the `github.io` name.
3. Commit `static/CNAME` containing `aba.rcjlabs.com`, then set the same domain under
   **Settings → Pages → Custom domain** and tick **Enforce HTTPS** once the certificate
   is issued (usually minutes; occasionally an hour).

Do those in that order. Committing `CNAME` before DNS resolves takes the live site down:
Pages starts redirecting `rcjlabs.github.io/aba-assist/` to a hostname that does not yet
answer.

Once it is live, `/.well-known/assetlinks.json` is served from the origin root. It ships
as an empty array until there is an app signing key; fill it with the SHA-256 fingerprint
of the key that actually signs the AAB before the TWA ships, or the app installs with the
browser URL bar visible. The deploy workflow warns while it is still empty.

## License

Code is MIT (see `LICENSE`). Content carries its own per-item license field; entries
authored here are CC-BY-SA-4.0 unless marked otherwise.
