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

## 2. Every one of those 852 traces to a document with no retrieval record

All 69 entries in `content/_registry/sources.yaml` have `retrieved: null`. The seven
items above rest entirely on BACB publications — the three Test Content Outlines, the two
handbooks, the two ethics codes — and `bacb.com` is not reachable from the environment
this content was produced in.

The credential files additionally carry **72 page-level locators** (`Ongoing Supervision,
pp. 16-17`, `Professional Development, p. 30`, and so on) which are rendered to readers
on `/exams/[id]`, the glossary, scenarios and ethics pages.

**Do not approve these seven until that is settled.** Approving them signs an attestation
that those pages say what the app says they say. If the page numbers were produced without
the documents in hand, that signature is worth less than no signature at all, and it is
the same failure the self-review guard exists to prevent — arrived at by a different road.

They are required kinds, so the gate cannot open without them. **This question is on the
critical path, not beside it.**

## 3. The sample rate barely matters

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

## 4. Read these first, whatever order the queue offers

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

## 5. What has never been read by anyone

- **603 questions**, roughly 2,400 option rationales. Tier B, and wrong answers with
  confident explanations are the defining complaint about every competing app. None of
  these are in the 122-item gate path, so the gate can open with the entire bank unread.
  That is the gate's design, and it is worth knowing.
- **60 scenarios**, of which 48 are guidance rather than escalation.
- **249 glossary terms**, of which the gate path reads 54 at the default rate.

## 6. Two workflow hazards

**The sample draw is seeded by content version.** A draw is labelled
`term:acquisition@1640942f2fb9:9-of-34`. Change any content file and the version changes
and a _different_ sample is drawn. Do not let anyone edit content between the moment you
start a review pass and the moment you apply the export.

**Decisions live in one browser's IndexedDB.** One device, and do not clear site data
before exporting.

## 7. The loop, verified

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
