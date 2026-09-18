import { z } from 'zod';
import { IsoDate, Slug } from './primitives.js';

/**
 * A correction: something this app said that was wrong, and what it says now.
 *
 * The build plan's argument for this is worth restating, because it is the whole reason
 * the file exists. The defining complaint about the incumbent apps in this field is wrong
 * answers with confident explanations and a report button that goes nowhere — one review
 * put it as "finding inconsistencies multiple times makes it hard to trust anything on the
 * app". An app that asks people to report errors and then never shows what happened to
 * any of them is making the same promise those apps made.
 *
 * So a public correction history is not a nicety here, it is the differentiator. It is
 * also the one claim a competitor cannot copy without actually doing the work.
 *
 * **A correction is written for the reader, not for the maintainer.** The internal note a
 * reviewer leaves on a flagged item stays internal; this is the public account, and it has
 * to make sense to somebody who never saw the old version. Hence `wasWrong` and `nowSays`
 * as separate required fields: "fixed a typo in negative reinforcement" tells nobody
 * whether they learned the wrong thing from it.
 */
export const Correction = z.strictObject({
	id: Slug,
	/** When the corrected content reached readers, not when it was noticed. */
	correctedOn: IsoDate,
	/**
	 * The entries this touched, so a reader can go and look at what they now say.
	 *
	 * Required and checked against the corpus by the build: a correction that names
	 * nothing is unverifiable, and one that names an id which does not exist is a dead
	 * link in the one place that exists to be trusted.
	 */
	affects: z.array(Slug).min(1),
	/** A heading somebody can scan: "Supervision percentage for assistant analysts". */
	summary: z.string().min(10).max(120),
	/** What the app said before, plainly enough that a reader can tell if they read it. */
	wasWrong: z.string().min(20).max(600),
	/** What it says now, and why that is right. */
	nowSays: z.string().min(20).max(600),
	/**
	 * How it came to light.
	 *
	 * `reader-report` is recorded separately from the rest because it is the category that
	 * proves the report button works. Nothing here names the person who reported it.
	 */
	foundBy: z.enum(['reader-report', 'review', 'source-check', 'internal']),
	/** The public issue, where there is one. Never an email or a name. */
	issueUrl: z.url().nullable().default(null),
	/**
	 * How much it mattered.
	 *
	 * `material` means somebody acting on the old version could have done the wrong
	 * thing — a requirement misstated, a procedure described backwards. `minor` is a
	 * wording or a broken link. The distinction is the reader's to care about, so it is
	 * recorded rather than left to the tone of the summary.
	 */
	severity: z.enum(['material', 'minor'])
});
export type Correction = z.infer<typeof Correction>;

export const CorrectionRegistry = z.strictObject({
	corrections: z.array(Correction).default([])
});
export type CorrectionRegistry = z.infer<typeof CorrectionRegistry>;
