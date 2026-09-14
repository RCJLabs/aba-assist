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

export const EthicsCode = z.strictObject({
	id: EthicsCodeId,
	issuer: z.literal('BACB'),
	effectiveDate: IsoDate,
	appliesTo: z.array(Credential).min(1),
	sourceId: Slug,
	/** Required: we always send readers to the authoritative document. */
	officialUrl: z.url(),
	corePrinciples: z
		.array(
			z.strictObject({
				number: z.number().int().min(1).max(4),
				ourLabel: z.string().min(3).max(60),
				ourSummary: z.string().min(40).max(600),
				...OfficialTextGuard
			})
		)
		.default([]),
	sections: z
		.array(
			z.strictObject({
				number: z.string().regex(/^\d+$/),
				ourLabel: z.string().min(3).max(60),
				ourSummary: z.string().min(30).max(500),
				...OfficialTextGuard
			})
		)
		.min(1),
	review: Review,
	provenance: Provenance
});
export type EthicsCode = z.infer<typeof EthicsCode>;

/**
 * One ethics standard.
 *
 * The standard NUMBER is a fact — a citation locator, like a statute section. The
 * standard's TEXT and TITLE are the rights-holder's expression, so `officialText` and
 * `officialTitle` stay null (guaranteed by the guard) and we ship `ourLabel` plus
 * `ourSummary`, written from scratch, alongside a deep link to the real document.
 */
export const EthicsStandard = strictContent({
	id: Slug,
	codeId: EthicsCodeId,
	number: z.string().regex(/^\d+\.\d{2}$/, 'standard numbers look like "2.01"'),
	sectionNumber: z.string().regex(/^\d+$/),
	ourLabel: z.string().min(3).max(80),
	ourSummary: z.string().min(60).max(900),
	plainSummary: z.string().min(40).max(400),
	appliesTo: z.array(Credential).min(1),
	/** Our editorial content, not the rights-holder's. */
	whatThisLooksLike: z.array(z.string().min(15)).min(1),
	commonPitfalls: z.array(z.string().min(15)).default([]),
	relatedStandards: z.array(Slug).default([]),
	practiceScenarios: z.array(Slug).default([]),
	termRefs: z.array(Slug).default([]),
	taskRefs: z.array(TaskRef).default([]),
	citations: Citations,
	attestation: Attestation,
	review: Review,
	provenance: Provenance
}).check((ctx) => {
	const s = ctx.value;
	if (!s.number.startsWith(s.sectionNumber + '.')) {
		ctx.issues.push({
			code: 'custom',
			message: `standard ${s.number} does not belong to section ${s.sectionNumber}`,
			input: s.id
		});
	}
	if (s.officialUrl === null) {
		ctx.issues.push({
			code: 'custom',
			message: `${s.id}: ethics standards must link to the official document`,
			input: s.id
		});
	}
});
export type EthicsStandard = z.infer<typeof EthicsStandard>;
