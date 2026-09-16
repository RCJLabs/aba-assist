# Reviewing this content: where to spend your attention

Written by the author of the content, which is the first thing to know about it.

## What this document is, and is not

It is **not** a review, and it is not a list of what is wrong. If I could tell you which
of my 952 items are wrong, they would not be wrong — I would have fixed them. An author
is the least reliable judge of their own errors, which is the whole reason the build
rejects `reviewedBy == authoredBy`.

What I _can_ map reliably is **blast radius**: which items carry the most unchecked
claims, and which rest on sources this pipeline cannot demonstrate having read. That is
arithmetic, not judgement, and it is what this document contains.

---

## 1. The seven required items are not seven items

The release gate needs four kinds complete: outlines, ethics codes, credentials,
escalation cards. The queue presents the first three as **seven rows**, each tier A at a
budgeted three minutes.

They are not three-minute items:

| Item                              | Separate factual assertions                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| BCBA outline                      | 230 — 104 task summaries × 2 (technical + plain), 9 domain names and weights, exam format |
| BCaBA outline                     | 202 — 90 task summaries × 2, 9 domain names and weights, exam format                      |
| Ethics Code for Behavior Analysts | 182 — 85 standard restatements × 2, 6 section labels                                      |
| RBT outline                       | 102 — 43 task summaries × 2, 6 domain names and weights, exam format                      |
| RBT Ethics Code 2.0               | 64 — 29 standard restatements × 2, 3 section labels                                       |
| BCBA credential                   | 36 requirement facts, each with a page locator                                            |
| RBT credential                    | 36 requirement facts, each with a page locator                                            |
| **Total**                         | **852**                                                                                   |

Approving those seven rows attests to all 852. At three minutes an item the queue is
telling you this is twenty-one minutes of work. It is not.

**The tier model is wrong here and should be treated as wrong.** Budget by claim count,
not by row count, or split these into per-domain and per-section rows before reviewing.

## 2. CORRECTION — the sources were supplied, and the facts check out

An earlier version of this document said the 852 assertions rested on documents nobody
could show they had read, and that approving them would sign an unbackable attestation.
**That was wrong.** The primary documents were supplied directly: all three Test Content
Outlines, both handbooks, both ethics codes, the Initial Competency Assessment. The
`retrieved: null` in `sources.yaml` is a missing metadata field, not missing provenance.

`npm run content:verify -- --sources=<path>` now checks the machine-readable facts against
those documents. Current result: **68 facts checked, 0 disagreeing** — every task code in
all three outlines (237 of them), every domain name, every exam weight, both exam formats,
all 114 ethics standard numbers, and contiguous numbering in all nine code sections.

What is still worth a person's eye is the prose those facts hang on: our restatement of
what each task or standard _means_, which a string match cannot check.

## 3. What the terminology document can and cannot be used for

`ABA_Termonology.pdf` states on its first page: _"Definitions cited from: Cooper J.O,
Heron T.E, Heward W.L. Applied behavior analysis (2nd ed.)"_. It is a compilation of
verbatim Cooper, Heron & Heward definitions.

`sources.yaml` marks that book `quotationAllowed: false`, with the note _"NOT a drafting
source. Its glossary must never be copied, excerpted, or closely paraphrased."_ So it
cannot be used to write or to reword a definition, and no content file references it —
which is correct.

It **can** be used as a contradiction check: read it, then read ours, and ask whether they
mean the same thing. Checking you are not wrong against a reference is not copying it.

Used that way it has already found real gaps. These concepts appear in the reference and
nowhere in our glossary:

- **evocative effect** and **abative effect** — the two MO effects on behaviour
- **value-altering**, **behavior-altering** and **function-altering effect**
- **functionally equivalent** — load-bearing for functional communication training
- **contrived** vs **naturally existing contingency**

The MO effect terms are the significant ones: motivating operations are on all three
outlines, and a glossary that defines the MO without naming its effects is teaching half
of it.

## 4. The sample rate barely matters

| Rate          | Terms read | Total items | Hours |
| ------------- | ---------- | ----------- | ----- |
| 10%           | 24         | 92          | 3.6   |
| 15%           | 36         | 104         | 3.8   |
| 25% (default) | 54         | 122         | 4.0   |
| 50%           | 103        | 171         | 4.6   |
| 100%          | 200        | 268         | 5.8   |

Every rate clears the 150-term floor, because approving a drawn item carries the rest of
its category.

The fixed cost — 49 tier-A terms plus the 19 required items — is **3.3 hours whatever you
set**. The dial moves the remainder. Dropping from 25% to 10% saves 24 minutes and buys
materially weaker assurance over 200 definitions; raising it to 50% costs 36 minutes and
roughly doubles it.

**Recommendation: raise it to 50%, or leave it at 25%. Do not lower it.** The time is not
where the dial is.

## 5. Read these first, whatever order the queue offers

**The twelve escalation cards.** Roughly 36 minutes, and the items where being wrong costs
most:

- You have been told to restrain or seclude a learner
- There is a weapon in the room
- The learner says they want to die or hurt themselves
- You suspect a learner is being abused or neglected
- You think a colleague may be harming a client
- The person collecting the learner seems unsafe
- A learner is hurting themselves and there is a risk of injury
- The learner has a seizure, stops breathing normally, or collapses
- The learner runs off toward a road, a car park, or water
- The learner has hit, bitten or kicked someone and there is injury
- A learner is breaking things and someone could be hurt
- A caregiver asks you whether a medication is working

What to check on each: does it refuse to give procedure, name the right contacts, and say
what to write down? The schema makes procedural instruction in these files a parse error,
so the structural guarantee holds — what it cannot check is whether the _contacts_ and the
_wording_ are right for a real workplace.

**Then the fifteen tier-A items resting on a single citation**, notably the seizure card
and the suicidal-statement card.

## 6. What has never been read by anyone

- **603 questions**, roughly 2,400 option rationales. Tier B, and wrong answers with
  confident explanations are the defining complaint about every competing app. None of
  these are in the 122-item gate path, so the gate can open with the entire bank unread.
  That is the gate's design, and it is worth knowing.
- **60 scenarios**, of which 48 are guidance rather than escalation.
- **249 glossary terms**, of which the gate path reads 54 at the default rate.

## 7. Two workflow hazards

**The sample draw is seeded by content version.** A draw is labelled
`term:acquisition@1640942f2fb9:9-of-34`. Change any content file and the version changes
and a _different_ sample is drawn. Do not let anyone edit content between the moment you
start a review pass and the moment you apply the export.

**Decisions live in one browser's IndexedDB.** One device, and do not clear site data
before exporting.

## 8. The loop, verified

Exercised end to end on 2026-09-16 and reverted:

```
npm run content:apply-review -- --file=<export>.json --dry-run
npm run content:apply-review -- --file=<export>.json
```

- approved items get `status: approved`, `reviewedBy`, `reviewedOn`
- sampled approvals additionally record `reviewMethod: sampled` and the exact draw in
  `sampledWith`, so the basis stays visible afterwards
- flagged items get `status: needs-update` and the note in `changeNote`
- the release counter moves
- a reviewer named `claude` is refused, per item, by name
