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

When a pass is done, the page exports the decisions as JSON, and in the repo:

```sh
npm run review:check    # says what it would change, writes nothing
npm run review:apply    # applies it
```

Neither takes a path. The newest `aba-assist-review-*.json` is looked for where browsers
put downloads, and the file it picked and how old it is are printed before anything is
written — picking up last week's export without saying so is how somebody re-applies a
stale pass and wonders why nothing changed. `--file=` still works and still wins, because
a reviewer who knows which file they mean should not have their choice guessed at. On
success it prints the commit and push that actually ships the result, since applying
decisions changes tracked files and nothing else.

That rewrites the `review:` block of each decided item — `approved` with your reviewer id
and the date, or `needs-update` with your note — and nothing else in the file. The diff is
the record, and it is small enough to read. Three things it refuses to do: sign an
approval as the item's author, record a flag with no note saying what is wrong, or apply
half a pass (any error and nothing is written at all).

One wrinkle worth knowing about: question files share a single `review:` block across a
whole file by YAML anchor. The moment one question in that file is decided differently
from its neighbours the anchor is no longer true, so the tool writes every block in that
file out in full. That is why an approval of one question can show up as a large diff.

### Which 150 terms, and the ranking that got it wrong

The floor is a number — 150 approved terms of 259 — so something has to decide which 150,
and the obvious answer is wrong in a way that took counting to see. The first version
ranked every term by how many other entries cite it and took the top 150. Reasonable: a
term the corpus keeps pointing at is one readers arrive at.

Then the set was checked against what actually has to ship. The RBT outline's 43 tasks
name **141 distinct terms** between them, and **27 of those fell outside the top 150** —
forward chaining, backward chaining, total-task chaining, error correction, least-to-most
and most-to-least prompting, scatterplot, the three-term contingency. Core technician
vocabulary. Meanwhile 34 terms held places on the strength of BCBA question citations
alone. A citation count has no opinion about credentials, and this corpus has three, the
largest of which cites nearly every term there is.

That is not a thinner launch, it is a broken one. References into a withheld entry are
pruned rather than left dangling, so the build would have shipped the RBT outline
complete and approved with a quarter of its task links silently removed — on the outline
this app's entire claim rests on.

So the set is assembled in the order the gate cares about: first every term an escalation
card or the launch outline names (143 of them, together), then the most-cited of the rest
to reach the floor. Same cost, and nothing that ships whole has a hole in it.

The same counting settled the floor itself. Lowering it looked like the cheapest possible
way to reach a launch sooner, and it is not available: 150 is within seven of the 143 the
required-complete kinds already name, so a smaller floor buys almost nothing and starts
pruning the outline again. The number stays, on evidence rather than on taste.

`LAUNCH_OUTLINE` names the one outline a launch has to stand behind whole, and it is RBT
for a stated reason: the 3rd edition took effect on 2026-01-01 and most circulating study
material is still written against the 2nd. The other two outlines must be approved before
a release like everything else in their kind — they just do not get to drag the whole
glossary in with them. BCaBA names 214 terms and BCBA names 255, which is very nearly all
of them.

### A sitting, because two hours is not a plan either

The tiering made the total tractable — the launch set is 170 entries, of which about 80
have to be read, for something under three hours rather than a thousand items — and three
hours still did not get done, for a reason that has nothing to do with the number. It is
not a thing anybody sits down and does. Ten items is.

So `/review` offers a sitting: pick 5, 10 or 20, see roughly what it costs before
starting, get a position and a bar while you work, and get a finish line that says what
was decided and offers the next one. The sizes are deliberately small, and each is priced
from the tiers of the items actually about to be offered rather than a corpus average,
because tier A and tier C differ by four times and the question being answered is "have I
got time for this right now".

Progress is derived from the stored decisions rather than kept in a counter. A counter
would have to be incremented by every path that records a decision, and the first path
anybody forgot would report a sitting that did not happen — on this page, that means
overstating how much of the corpus a human has read, which is the one number here it
would be worst to inflate. Deriving it also means a sitting survives a reload or an
evicted tab for free, which matters because a reviewer doing this on a phone will hit
both. Terms carried by a draw are excluded: carrying a batch is what you do _instead_ of
reading it, so counting thirty carried terms would finish a sitting of ten without
anybody reading anything.

The keys matter as much as the sitting does, because the cost of a review is the friction
between items. `a` approves, `f` starts a flag by putting the cursor in the note,
Ctrl or ⌘ with Enter submits that flag without leaving the keyboard, `s` skips, `b` goes
back and `?` lists the lot. Flagging used to be click, type, click while approving was one
key, which had it backwards: the flag is the decision that carries information. A flag
still requires a note, because a flag nobody can act on later is not a flag.

Two real defects surfaced while testing that flow, both unreachable at mouse speed:

- **Two quick approvals decided the same item twice.** `decide` awaited the write before
  the queue updated, so the second press still read the old `current`, and the item after
  it was stepped past without ever being decided. Decisions are chained now, so the second
  press waits and then reads the queue fresh.
- **Focus stayed in the note after a flag was submitted**, so the next `a` typed the
  letter a into the textarea instead of approving. Focus now moves to the new item's
  heading after every decision, which also tells a screen reader the card changed.

A third turned up in the quiz, surfaced by the same suite on a slow device rather than by
the review work itself. `countAvailable` read the exam off the state, awaited that exam's
bank and then wrote a count — so a load started for one exam could land after the reader
had moved to another. The ordinary sequence hits it: the prerendered form ships with the
technician exam selected and hydration counts against it, then the saved filter switches
to the assistant exam a moment later. Pick area I, which the technician outline does not
have, and the late technician answer filtered to zero — "0 questions available" and a dead
Start button over a bank of twenty-one. Both loads now carry a token and discard their own
result if a later call has superseded it, with a token each rather than a shared one, since
one would have each cancelling the other's perfectly current answer. The regression test
holds the technician bank back by matching a question id only that bank carries, so the
interleaving is forced rather than waited for; it fails without the guard.

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

## The home page leads with a mode

`/` opens with one choice — RBT, BCaBA, BCBA or everything — and that choice drives the
app: the glossary, search, flashcards, the quiz and the study plan all follow it, and so
does the tracker. It is the shared content filter promoted to the front rather than a new
idea, which is why it costs almost nothing and why it persists across visits.

Making it mean one thing required fixing something first. The app kept **two** credential
states: the content filter, and the tracker's own role for whose supervision and
development requirements are being checked. Choosing Analyst on the home page and then
finding `/tools` still checking a technician's requirements is exactly what makes a mode
switch feel decorative, so the mode now writes both. Choosing "everything" deliberately
leaves the tracker alone — it has to be checking somebody's requirements, and silently
resetting it would discard a choice made on purpose.

Three constraints shaped the rest of the page:

- **Search stays above the fold on a phone.** This is the app somebody opens one-handed in
  a hallway between sessions; a redesign that buries the search field costs the app its
  primary use. The mode switch is one row of four at 320px for that reason, and a test
  asserts both — that all four chips share a row, and that the field is in the viewport.
- **The page is complete with no stored data.** It is the app's main way of reaching
  people, so a first-time visitor and a search engine both get the whole thing. The
  personal strip — cards due, weakest area — loads afterwards through a dynamic import and
  renders nothing when there is nothing to say, which also keeps the database layer out of
  the entry bundle the performance budget guards.
- **Destinations group by intent** — look something up, study for the exam, on the job —
  rather than sitting in one pile of ten tiles. The urgent card stays outside the groups
  and above them.

The radio inputs are stretched over their chips rather than hidden at a pixel: the radio
is the control, so it has to be the target. A 1px control fails WCAG 2.5.8 even when the
label beside it is comfortably large, and the target-size test caught exactly that.

## The study plan refuses to give you a score

`/plan` reads what is already stored — per-area totals on every quiz attempt, the
scheduler's record of which terms have been seen — and turns it into a ranked list of
next actions. Nothing new is recorded to produce it, so it works offline and tells nobody
anything.

The arithmetic is the easy half. What the page is really for is refusing two numbers that
would be the most reassuring things on the screen and the least supported:

- **No percentage until there are enough answers**, where "enough" is as many as the real
  paper asks in that area. Derived rather than picked: "enough to say something about this
  domain" and "as many as the exam will ask you about it" are the same number, which makes
  the threshold arguable instead of arbitrary and lets it scale with the blueprint. Below
  it the page shows the count and says how many more it wants.
- **No overall figure until every area has been sampled.** An average over whichever areas
  somebody happened to practise says more about their choice of practice than about their
  knowledge.

Even once there is a number, the page says what it is: an accuracy on this app's
questions. Not a score, not a prediction, not a probability of passing. A bank written by
one author is not a calibrated instrument and has never been validated against the real
exam, and an app in this market that implies otherwise is doing the thing the reviews of
its competitors complain about.

Actions are ranked by how much the exam cares rather than by how bad the number looks: an
area worth a quarter of the paper at 70% outranks one worth a twentieth at 50%, because
that is where an hour is best spent. An unsampled area is scored as a coin flip plus a
small bonus for the value of finding out — enough to prefer measuring over practising at
equal weight, not enough to send somebody to sample a light area ahead of a heavy known
weakness.

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

The export is the artifact and the app is the convenience. Fieldwork is verified from
documentation, sometimes years later, by somebody who will not accept "it was in an app" —
so `/tools/fieldwork` exports the whole record as four CSVs rather than a dump of what was
typed in:

1. **the period** — when it started, whose rules, which handbook edition the figures came
   from;
2. **the months** — every field, plus credited hours, a standing, and the requirements
   that month failed, named rather than implied;
3. **the totals** — credited against the 2000 required, hours that will not count, and
   each ratio with its verdict;
4. **the requirements** — every threshold with the handbook page it came from.

The fourth is the one that is easy to leave out and the one that makes the other three
auditable. A spreadsheet of hours with a "short" column and no statement of the threshold
asks the reader to trust an app they have never seen.

Two details that are easy to get wrong. The restricted ceiling is **derived, not written
down**: the rule is 40%, so a record built around a literal 800 is right only for a
2000-hour run and wrong for anybody accruing concentrated hours, where the same rule comes
to 600 of 1500. And a ratio the handbook judges month by month carries no cumulative
verdict — individual supervision is reported as a figure with "judged month by month; see
the months file", because a cumulative percentage with "met" beside it would be a claim
the handbook does not support.

Four files rather than one `.xlsx` with tabs, deliberately. A real workbook needs a
spreadsheet library, and this is an offline PWA whose whole free corpus is about 1.5MB —
several hundred kilobytes of formatting code would ship to everybody who opens the
glossary. CSV is what Excel and Sheets both import natively.

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

## What you looked up is a signal, and a weak one

Every other thing this app knows about a reader comes from asking them a question: a quiz
grades an answer, a drill scores a recording, a flashcard asks for a recall. All three
cost something to produce, which means they only ever measure the people willing to be
tested. On a free reference app that people open in a hallway between sessions, that is a
minority. Opening a term costs nothing and happens anyway.

So the app records it: one row per entry, with a count and a last-seen time, on the device
and nowhere else. The glossary offers the way back to what you were reading, and
`/progress` shows what you keep returning to — in a section that sits **outside** the
"nothing to show yet" branch the rest of that page lives behind, because the reader this
is for is precisely the one who has never finished a quiz.

The wording around it is the actual feature. A repeated lookup is not a knowledge gap, and
saying it is would be a claim about somebody the app has never assessed:

- a term you look up weekly may be one you use constantly and double-check a boundary on;
- the count is confounded by the app's own cross-references — an entry six others link to
  gets opened more than an equally shaky one nothing points at;
- somebody else may have used the phone.

The page therefore says it has seen you open these more than once, names those limits in
two sentences, and leaves the diagnosis to the person it is about. Same posture as the
study plan, which refuses to produce a score for the same reason.

Three details that are load-bearing rather than incidental. A visit inside **thirty
minutes** of a counted one does not count again, tracked against its own `countedAt`
rather than the last-seen time — deduping against last-seen would let somebody re-reading
every twenty minutes all afternoon record a single lookup, because each visit would push
the window ahead of itself. The title is **stored on the row** rather than resolved at
render: looking four kinds of id up means importing the scenario, ethics and graph corpora
into every page that shows the list, which is the same 450KB the corpus split exists to
avoid. And recording is an `$effect` keyed on the id rather than `onMount`, because one
component serves every slug — a mount hook records the first entry of a session and
nothing after it, which is a bug an e2e test was checked to catch.

It is on by default and it is a reading history, so both halves of that are answered
rather than assumed. Settings carries a switch and a **separate** clear button, because "I
would rather you did not keep a list of what I read" is a different request from "delete
everything" and answering the first with the second would cost somebody years of
supervision records. It rides along in the backup and goes with the erase. It is
deliberately **not** counted by `hasStoredData`, which decides whether to warn that data
has gone: a reader who has only ever browsed has nothing they would grieve, and greeting
them with "your progress has been deleted" is the false positive that teaches people to
ignore the true warning.

## Saying so when the browser has cleared somebody's data

Settings has warned about this from the start: Safari and iOS clear a non-installed site's
storage after about a week of inactivity, which for spaced repetition is exactly backwards
— the reader who studies once a week is who the scheduling is for, and who loses it.

What nothing did was notice _afterwards_. A reader whose deck had been cleared opened
`/study` and read "nothing to review yet", opened `/progress` and read "no finished
sittings yet" — the same words a new reader sees. The app that had just lost a year of
supervision records said nothing about it and offered no restore, which is the difference
between an app with a known limitation and an app that looks broken.

So the app now keeps a witness: a timestamp in localStorage recording the last time it saw
a database with something in it. If that witness exists and IndexedDB is empty, data was
cleared, and `/study`, `/progress` and `/settings` say so and offer the backup file.

**The limit is severe and is stated in the code rather than glossed.** WebKit's cap covers
all script-writable storage together — localStorage, IndexedDB, the Cache API and service
worker registrations go in one sweep. A witness in localStorage therefore cannot survive
the eviction it exists to witness, and the canonical Safari case is undetectable from
inside the origin by any means available to a page. That case is handled the only way it
can be: by saying in Settings, in advance, that this browser will do it.

What the witness does catch is every loss that takes IndexedDB and leaves the rest: quota
eviction under storage pressure, a clear of site data that misses localStorage, and — the
reason this earns its place regardless of browsers — a migration that completes and leaves
empty stores. The migration ladder is this app's own code, and a bug there presents to a
reader as exactly the same silence.

Three things it must never do, each with a test:

- **Never call a deliberate deletion a loss.** Pressing "delete my data" and being told
  your data has gone would be the least forgivable false positive, so erasing forgets the
  witness.
- **Never conclude anything when the database cannot be opened.** Blocked storage and a
  private window look identical to an empty database from outside, and the data may be
  sitting untouched behind a door the session cannot open. `hasStoredData` throwing is
  passed on as null, not false.
- **Never read a value it did not write as a loss.** A corrupt witness reads as absent.
  Sending somebody after a backup they never needed teaches them the app cries wolf, and
  the true warning is then ignored too.

The notice can also be dismissed, because somebody with no backup can do nothing about it
and a notice you cannot act on and cannot dismiss is a scold on every visit.

## The corrections page, and why it is currently empty

The defining complaint about the incumbent apps in this field is wrong answers with
confident explanations and a report button that goes nowhere — one review put it as
"finding inconsistencies multiple times makes it hard to trust anything on the app". This
app has had a working report button from the start, and until now it showed nothing back.
Asking people to report errors and never showing what became of any of them is the same
promise those apps made.

`/corrections` has two halves.

**What has been corrected** comes from `content/_registry/corrections.yaml`. Each entry
carries `wasWrong` and `nowSays` as separate required fields, both long enough to be an
account rather than a label: "fixed a typo in negative reinforcement" tells nobody whether
they learned the wrong thing from it. `foundBy: reader-report` is recorded separately
because it is the category that proves the button works. No entry names a person.

**What is known to be wrong now** is derived from review status rather than authored — an
entry a reviewer flagged carries `needs-update`, and that is already the fact. This is the
harder half of the promise: anybody can list their fixes, and saying "this one is wrong and
we have not got to it" is the part that has to be true to be worth reading. The reviewer's
own note is deliberately not published. It was written for whoever would do the fix, and
retroactively making internal notes public is not a decision to take on somebody's behalf.

Two build rules. A correction naming an entry that is not in the corpus is an error,
because a dead reference on the one page whose job is to be trustworthy is worse than no
page, and ids do get renamed. And a _missing_ `corrections.yaml` is an error rather than
"no corrections yet" — absence and emptiness look identical to a reader, so treating them
the same would let a deleted log silently erase the record of every mistake this app has
admitted to.

The page is empty today and says so in its own words. Nothing here has reached a reader:
the site publishes as a preview with the banner on and search engines kept out, until the
launch set has been through review. An empty log is worth more than an invented one, and
the machinery has to exist before the first correction rather than after it.

## Facts that expire now have to say when

Being right about 2026 is what this app is for, and the failure mode it was built against
is the one killing the incumbents: content keyed to an edition that has since been
replaced, still on sale, with nothing on the page admitting it. Every one of those apps
was accurate the day it shipped.

`Review.nextReviewDue` had been in the schema from the first commit. No content file ever
set it and no code ever read it — a staleness mechanism that existed as a field name,
which is worse than none, because it makes the gap look handled.

**Only some content can go stale, and saying which is the design.** A definition written
from Michael 1982 does not rot; the paper is not going to be reissued with different
contents. What rots is anything restated from a document a certifying body maintains and
republishes — task codes, exam weights, cycle lengths, unit counts. So the requirement
attaches to four kinds (outlines, credentials, ethics codes, competency models) rather
than to all 259 terms, where it would be noise burying nine files that matter. It attaches
to the _kind_, so a new credential is covered the moment it is added rather than when
somebody remembers.

Two rules, deliberately of different severities:

- **`staleness/no-due-date` is an error in every channel.** It is a structural question —
  nobody decided how long this fact was good for — so it is refused without reference to
  the clock. No build can start failing because a date rolled over overnight.
- **`staleness/overdue` only stops a release.** That is the difference between a ratchet
  and a time bomb. An overdue handbook must not ship as though it were checked, and must
  also not block an unrelated fix at three in the morning. The release channel already
  downgrades to a preview, so an overdue fact does exactly what an unapproved one does: the
  app still publishes, carries its banner and stays out of the index until somebody looks.

Both were confirmed by backdating a real file and watching: on `pr` a warning and a build
that still succeeds, on `release` an error naming the date and how many days have passed.

The dates are **our** re-check horizons, not dates anybody publishes, and each one says why
in the file beside it. The technician handbook and competency model are anchored to January
2027, when the recertification change lands and those numbers are most likely to be wrong;
the analyst outlines to the same month, when the applicant cutoff makes the edition worth
confirming; the ethics codes to mid-2027, since both have been effective and unchanged
since 2022.

`/about` shows the whole schedule, because a build rule only a maintainer sees is half a
mechanism. The list the page renders and the list the rule enforces come from one function,
so they cannot drift into disagreeing about what is covered.

## What a scraper sees, which until now was nothing

Two audiences read every page before any human does, and both were being handed a bare
document: no `og:` tags anywhere in `src/`, no JSON-LD, no canonical link. Pasting a term
into a work group chat produced a naked URL, and a glossary — the one content shape
search engines have a dedicated vocabulary for — described itself as ordinary prose.

One `Seo.svelte`, used by all 34 pages that have a title, rather than defaults in the
layout that pages override. `<svelte:head>` does not deduplicate: a layout default plus a
page override gives two `og:title` tags, and which one a scraper picks is not this app's
decision to make. An e2e test counts each tag and fails at two.

**The absolute URL problem, and why it is a build-time constant.** A canonical link and a
share card both have to be absolute, and nothing at runtime can work out what the origin
is — these pages are prerendered, and during prerendering SvelteKit's own `page.url` has
the origin `http://sveltekit-prerender`. So `ABA_SITE_ORIGIN` is baked in by Vite, and the
deploy workflow resolves it **in the same step, from the same `static/CNAME` check** as
the base path. That pairing is the point: an origin that disagrees with the base path
publishes canonical links pointing at pages that are not there, which is worse for
indexing than having no canonical link at all. Both shapes are verified —
`https://rcjlabs.github.io/aba-assist/glossary/tact` today, `https://aba.rcjlabs.com/…`
once the DNS record exists.

**The structured data is deliberately thin.** `DefinedTerm` on each entry, `DefinedTermSet`
on the index, `WebSite` on the home page, and nothing else. The failure mode for this
markup is overstatement, and it is punished by having rich results withdrawn, so there is
no `author` (entries are unsigned until a human reviewer approves them), no
`datePublished` the content files could not support, and no rating of any kind. The
index does not list its 259 entries in `hasDefinedTerm` either: it is allowed, and it
would add well over a hundred kilobytes of JSON to a page whose own HTML is smaller than
that, to duplicate the list already rendered below it. Each term points back at the set
instead, which is the same graph from the other end and costs nothing. There is no
`SearchAction` because there could not honestly be one — search runs in the browser
against a downloaded index, so there is no query URL to send anybody to.

**The card** is `static/og.png`, 1200x630, rendered once by `node tools/make-og-card.mjs`
and committed. Not a build step: a PNG that changes about never does not justify a
headless browser in every build, and a share card that silently regenerates is one nobody
looks at again. An e2e test fetches the path the tags advertise and fails on anything but
a 200 — a card that 404s is worse than no card, because the client renders a broken
preview instead of falling back to a plain link.

None of this pays off while `robots.txt` still says `Disallow: /`. It is in place for the
day the launch set is approved, not before.

## Search has a floor now, and it is a measured one

Search had no measure at all. The only query-level tests in the repo were the escalation
intent routes — and those exist _because_ ranking was measured once and found unable to
answer the queries that matter. Everything since had been changed on the strength of
reading the code.

`src/lib/search/quality.ts` is a fixed set of 48 realistic queries with an expected answer
each, run against the index that actually ships: `MiniSearch.loadJSON` with the shared
options, which is exactly what the browser does. The suite refuses to fall below the day's
measurement — 45 of 48, mean reciprocal rank 0.839.

**The rule for adding to the set is to write the query first and take the result you get.**
A query added because it already passes measures nothing. Three of the 48 fail and are
kept:

- `giving them a break when they hit` finds negative reinforcement at rank 31.
- `they only do it when I am in the room` finds stimulus control at rank 96.
- `how do I fade prompts` finds prompt fading at rank 6, under five situations.

The first two are the hard class, and the corpus not answering a situation described
rather than named is the same finding that produced the authored intent routes. The third
is the interesting one: `prompt fading` alone is answered instantly, and four function
words bury it — there is far more situation prose than definition prose for `how do I` to
match against. Stripping function words from the query was tried before and did not
rescue it. A real fix is a ranking change, and the point of this file is that there is now
something to make one against.

Two things were learned by testing the harness itself rather than trusting it:

**A pass count is a poor ratchet on its own.** Deleting every field boost from the index
configuration — about as large a ranking regression as this app could suffer — moved it by
three queries, because most of the set is exact term names and those win on a title match
whatever the weighting does. Mean reciprocal rank moves continuously, so an answer
slipping from first to third registers even though it still passes. Both are asserted.

**Three of the prefix queries were testing something else.** `momentar` and friends are
close enough to the whole word that the fuzzy setting rescues them with prefix matching
switched off, so they were measuring fuzzy and reporting it as prefix. `reinforc`,
`generaliz` and `discrimin` stop far enough short that only prefix matching reaches them.
Checked by breaking the configuration three ways and watching both numbers fall: no boosts
42/48 and 0.802, no fuzzy 39/48 and 0.751, no prefix 42/48 and 0.805.

## There is no paid tier, and the reason is an audit rather than a principle

The build plan split this app into free and paid: free was the reference core, paid was
exam prep — a timed simulation, a large question bank, per-area readiness analytics, a
deck builder, tracker export, cross-device backup. The reasoning was that exam prep is
the commoditised thing people already pay $50 to $400 for, and on-the-job reference is
the unoccupied ground.

Audited against what actually shipped, five of those six are already here and free:

| Planned as paid                        | Where it is                                                       |
| -------------------------------------- | ----------------------------------------------------------------- |
| Timed, domain-weighted exam simulation | `/quiz`, at the exam's own pace, with a flag-and-return navigator |
| Large question bank                    | 648 items — RBT 187, BCaBA 212, BCBA 249                          |
| Per-area readiness analytics           | `/plan` and `/progress`                                           |
| Deck builder                           | `/study`, filtered by exam, area and category                     |
| Tracker export and PDF                 | Print on all four tools, JSON backup in settings                  |
| Cross-device backup                    | Not built, and the only one that needs an account and a server    |

So the plan's own logic got inverted in execution: the part that was supposed to pay for
the rest was built and given away, one milestone at a time, because each of those
features made the free app better and there was never a moment where withholding one was
the obvious call.

Given that, the paid tier was cancelled rather than retrofitted. The three ways to
un-invert it were all worse than not charging:

- **Fence off what already shipped.** The app is published, and its entire position is
  that it can be trusted in a field whose incumbent apps cannot. Taking back a working
  simulator is the single fastest way to lose that.
- **Sell new content instead.** Coherent, and it aims the paywall straight at the thing
  that is already the bottleneck. Every item has to be read by a reviewer before it
  ships, and the launch set is not through that queue yet. A paid tier made of content
  multiplies the constraint that is holding up the launch.
- **Sell sync and a supervisor view.** The one genuinely missing capability, and it costs
  the promise three pages of this app make in writing — no account, nothing leaves the
  device — plus a data-protection surface that a solo project should not take on lightly.

What that deletes is worth stating, because it is most of two milestones. No Cloudflare
Worker, no Ed25519 licence tokens, no Stripe, no Digital Goods API, no purchase outbox,
and no server-side acknowledgement — which also removes the three-day auto-refund window
that makes Play Billing a live liability from the moment it ships. The Play submission is
an Education listing with no in-app purchases at all.

None of this is a promise never to charge for anything. It is a statement that nothing
working here today is going to be moved behind a payment, and that the question gets
asked again when the content is reviewed and the site is indexed — which is to say, when
there is something to sell and somebody able to find it.

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
