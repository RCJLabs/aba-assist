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
 * One numbered standard within a section.
 *
 * The NUMBER is a fact and a citation locator — "1.12" is how the whole profession refers
 * to the gift rule, and a reference tool that cannot say it is not much use. Everything
 * else here is ours. The code's own heading for a standard is its text too, which is why
 * `officialTitle` is null by construction and `ourLabel` is a label we wrote.
 */
const CodeStandard = z.strictObject({
	number: z.string().regex(/^\d+\.\d{2}$/, 'standard numbers look like "2.01"'),
	ourLabel: z.string().min(3).max(80),
	ourSummary: z.string().min(30).max(600),
	...OfficialTextGuard
});
export type CodeStandard = z.infer<typeof CodeStandard>;

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
	/** Empty until the code's numbering has been checked against the document itself. */
	standards: z.array(CodeStandard).default([]),
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

	/*
	 * The flag and the data have to agree, in both directions.
	 *
	 * Listing standards while `standardsVerified` is false would put numbers in front of a
	 * reader that nobody checked — the exact failure this flag exists to prevent. Claiming
	 * verification while listing none is the same lie told the other way. And once the
	 * numbering IS verified, the count has to reconcile: a section quietly missing a
	 * standard is how a reference silently stops being complete.
	 */
	const all = c.sections.flatMap((s) => s.standards);
	if (!c.standardsVerified && all.length > 0) {
		ctx.issues.push({
			code: 'custom',
			message: `${c.id}: lists standard numbers while standardsVerified is false`,
			input: c.id
		});
	}
	if (c.standardsVerified) {
		if (all.length === 0) {
			ctx.issues.push({
				code: 'custom',
				message: `${c.id}: standardsVerified is true but no standards are listed`,
				input: c.id
			});
		}
		if (c.totalStandards !== null && all.length !== c.totalStandards) {
			ctx.issues.push({
				code: 'custom',
				message: `${c.id}: lists ${all.length} standards but totalStandards is ${c.totalStandards}`,
				input: c.id
			});
		}
		const numbers = all.map((s) => s.number);
		if (new Set(numbers).size !== numbers.length) {
			ctx.issues.push({
				code: 'custom',
				message: `${c.id}: duplicate standard numbers`,
				input: c.id
			});
		}
		for (const section of c.sections) {
			for (const std of section.standards) {
				if (!std.number.startsWith(`${section.number}.`)) {
					ctx.issues.push({
						code: 'custom',
						message: `${c.id}: standard ${std.number} is listed under section ${section.number}`,
						input: c.id
					});
				}
			}
		}
	}
});
export type EthicsCode = z.infer<typeof EthicsCode>;

/** A code and the section of it a topic sits under. */
export const SectionRef = z.strictObject({
	codeId: EthicsCodeId,
	section: z.string().regex(/^\d+$/),
	/**
	 * Standard numbers this topic covers, e.g. ["2.03", "2.04"]. Only permitted once the
	 * code's `standardsVerified` is true, and then only if the code actually lists that
	 * number — so neither an unverified guess nor a typo can reach a reader looking like
	 * a citation.
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
