import { z } from 'zod';
import { OfficialTextGuard, strictContent } from './guards.js';
import { Citations } from './source.js';
import { Attestation, Credential, IsoDate, Provenance, Review, Slug } from './primitives.js';
import { TaskRef } from './taxonomy.js';

export const EthicsCodeId = z.enum([
	'ethics-code-for-behavior-analysts-2022',
	'rbt-ethics-code-2-0'
]);
export type EthicsCodeId = z.infer<typeof EthicsCodeId>;

/**
 * One of the principles a code is built on.
 *
 * `ourLabel` and `ourSummary` are ours. `sourceNote` records where we learned that this
 * principle belongs to this code, because for the technician code our evidence is the
 * test content outline rather than the code document itself — a difference a reader
 * deserves to be able to see.
 */
const CorePrinciple = z.strictObject({
	number: z.number().int().min(1).max(6),
	ourLabel: z.string().min(3).max(60),
	ourSummary: z.string().min(40).max(600),
	sourceNote: z.string().min(10).max(240),
	...OfficialTextGuard
});

/**
 * One numbered section of a code.
 *
 * The section NUMBER is a fact — a citation locator. The section's heading is the
 * rights-holder's text, so `officialTitle` stays null (guaranteed by the guard) and we
 * write our own label describing what the section covers.
 */
const CodeSection = z.strictObject({
	number: z.string().regex(/^\d+$/),
	ourLabel: z.string().min(3).max(80),
	ourSummary: z.string().min(30).max(600),
	...OfficialTextGuard
});

export const EthicsCode = strictContent({
	id: EthicsCodeId,
	issuer: z.literal('BACB'),
	shortName: z.string().min(3).max(60),
	effectiveDate: IsoDate,
	appliesTo: z.array(Credential).min(1),
	sourceId: Slug,
	/** Our own description of what the code is and who it binds. */
	ourOverview: z.string().min(60).max(900),
	/** Total standards in the code, where a source states it. Null when unverified. */
	totalStandards: z.number().int().positive().nullable().default(null),
	/**
	 * False until someone has checked the individual standard numbers against the code
	 * document itself. While false, no topic may claim a standard number: the app would
	 * rather say "we have not checked" than print a citation nobody verified. This is the
	 * same posture that kept the RBT task codes out of the build until the outline arrived.
	 */
	standardsVerified: z.boolean().default(false),
	corePrinciples: z.array(CorePrinciple).default([]),
	sections: z.array(CodeSection).min(1),
	review: Review,
	provenance: Provenance
}).check((ctx) => {
	const c = ctx.value;
	if (c.officialUrl === null) {
		ctx.issues.push({
			code: 'custom',
			message: `${c.id}: an ethics code must link to the official document`,
			input: c.id
		});
	}
	const nums = c.sections.map((s) => s.number);
	if (new Set(nums).size !== nums.length) {
		ctx.issues.push({
			code: 'custom',
			message: `${c.id}: duplicate section numbers`,
			input: c.id
		});
	}
	const pn = c.corePrinciples.map((p) => p.number);
	if (new Set(pn).size !== pn.length) {
		ctx.issues.push({
			code: 'custom',
			message: `${c.id}: duplicate principle numbers`,
			input: c.id
		});
	}
});
export type EthicsCode = z.infer<typeof EthicsCode>;

/** A code and the section of it a topic sits under. */
export const SectionRef = z.strictObject({
	codeId: EthicsCodeId,
	section: z.string().regex(/^\d+$/),
	/**
	 * Standard numbers this topic covers, e.g. ["2.03", "2.04"]. Only permitted once the
	 * code's `standardsVerified` is true; the build rejects them otherwise, so an
	 * unverified guess cannot reach a reader looking like a citation.
	 */
	standardNumbers: z
		.array(z.string().regex(/^\d+\.\d{2}$/, 'standard numbers look like "2.01"'))
		.default([])
});
export type SectionRef = z.infer<typeof SectionRef>;

/**
 * One topic in the ethics reference.
 *
 * Organised by obligation rather than by standard number, because that is how the
 * question actually arrives — "can I accept this gift?", not "what does 1.12 say?". Each
 * topic names the sections it belongs to, so a reader who wants the exact standard text
 * is one link from the official document.
 */
export const EthicsTopic = strictContent({
	id: Slug,
	ourLabel: z.string().min(3).max(90),
	/** One line for the index. */
	gloss: z.string().min(10).max(120),
	appliesTo: z.array(Credential).min(1),
	sectionRefs: z.array(SectionRef).min(1),
	/** What the obligation is, in our words. */
	ourSummary: z.string().min(80).max(1400),
	plainSummary: z.string().min(40).max(500),
	whatThisLooksLike: z.array(z.string().min(15)).min(2),
	commonPitfalls: z.array(z.string().min(15)).min(1),
	/** What to do when it is not obvious. Always routes to a person, never to this app. */
	ifYouAreUnsure: z.string().min(30).max(600),
	termRefs: z.array(Slug).default([]),
	scenarioRefs: z.array(Slug).default([]),
	relatedTopics: z.array(Slug).default([]),
	taskRefs: z.array(TaskRef).default([]),
	citations: Citations,
	attestation: Attestation,
	review: Review,
	provenance: Provenance
});
export type EthicsTopic = z.infer<typeof EthicsTopic>;
