import { z } from 'zod';
import { IsoDate, Slug } from './primitives.js';

export const RightsProfile = z.enum([
	'public-domain',
	'cc-by',
	'cc-by-sa',
	'cc-by-nc',
	'all-rights-reserved',
	'unknown'
]);

/**
 * A bibliography entry.
 *
 * The rights model lives on the SOURCE, not the publisher, so the same machinery covers
 * the BACB's documents, Cooper/Heron/Heward, and any journal article. In practice the
 * textbook is the higher-risk source: glossary definitions are short works where copying
 * a single sentence copies a large proportion, and close paraphrase still infringes.
 */
export const Source = z.strictObject({
	id: Slug,
	kind: z.enum([
		'book',
		'journal-article',
		'standard',
		'organization-publication',
		'website',
		'statute',
		'regulation'
	]),
	title: z.string().min(3),
	authors: z.array(z.string()).default([]),
	organization: z.string().optional(),
	publisher: z.string().optional(),
	year: z.number().int().min(1900).max(2100).optional(),
	edition: z.string().optional(),
	doi: z.string().optional(),
	isbn: z.string().optional(),
	url: z.url().optional(),
	accessed: IsoDate.optional(),
	rights: RightsProfile,
	/** Hard switch. BACB documents and the textbooks are `false`. */
	quotationAllowed: z.boolean(),
	attributionRequired: z.boolean().default(true),
	notes: z.string().optional()
});
export type Source = z.infer<typeof Source>;

export const SourceRegistry = z
	.strictObject({ sources: z.array(Source).min(1) })
	.check((ctx) => {
		const seen = new Set<string>();
		for (const s of ctx.value.sources) {
			if (seen.has(s.id)) {
				ctx.issues.push({
					code: 'custom',
					message: `duplicate source id "${s.id}"`,
					input: s.id
				});
			}
			seen.add(s.id);
			if (s.rights === 'all-rights-reserved' && s.quotationAllowed) {
				ctx.issues.push({
					code: 'custom',
					message: `source "${s.id}": all-rights-reserved cannot set quotationAllowed: true`,
					input: s.id
				});
			}
		}
	});

/**
 * A citation is a POINTER, not a copy. `locator` names where a fact came from
 * ("RBT TCO 3rd ed., Domain C") — it never carries the source's wording.
 */
export const Citation = z
	.strictObject({
		sourceId: Slug,
		locator: z.string().max(160).optional(),
		useType: z.enum(['fact-reference', 'original-synthesis', 'quotation']),
		/** Non-null ONLY for `quotation` from a source where quotation is permitted. */
		quotedText: z.string().min(1).max(400).nullable().default(null)
	})
	.check((ctx) => {
		const c = ctx.value;
		if (c.useType === 'quotation' && c.quotedText === null) {
			ctx.issues.push({
				code: 'custom',
				message: 'useType "quotation" requires quotedText',
				input: c
			});
		}
		if (c.useType !== 'quotation' && c.quotedText !== null) {
			ctx.issues.push({
				code: 'custom',
				message: 'quotedText is only allowed with useType "quotation"',
				input: c
			});
		}
	});
export type Citation = z.infer<typeof Citation>;

export const Citations = z
	.array(Citation)
	.min(1, 'every content item needs at least one source');

/** A quotation longer than this fails the build even from a permitted source. */
export const MAX_QUOTED_WORDS = 25;
