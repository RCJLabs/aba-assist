import { z } from 'zod';

export const Slug = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a kebab-case slug');

export const IsoDate = z.iso.date();

export const Credential = z.enum(['RBT', 'BCaBA', 'BCBA', 'ABAT', 'QASP-S', 'QBA']);
export type Credential = z.infer<typeof Credential>;

/**
 * Review ladder. The build channel decides which statuses may ship:
 *   dev     -> anything
 *   pr      -> rejects `draft`
 *   release -> rejects `draft` and `in-review`
 */
export const ReviewStatus = z.enum([
	'draft',
	'in-review',
	'approved',
	'needs-update',
	'retired'
]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const Channel = z.enum(['dev', 'pr', 'release']);
export type Channel = z.infer<typeof Channel>;

/** Statuses that may appear in a build of the given channel. */
export const ALLOWED_STATUSES: Record<Channel, readonly ReviewStatus[]> = {
	dev: ['draft', 'in-review', 'approved', 'needs-update'],
	pr: ['in-review', 'approved', 'needs-update'],
	release: ['approved']
};

export const ContentLicense = z.enum([
	'CC-BY-SA-4.0',
	'CC-BY-4.0',
	'CC0-1.0',
	'proprietary-aba-help'
]);

export const Tier = z.enum(['free', 'pro']);
export type Tier = z.infer<typeof Tier>;

export const Setting = z.enum(['home', 'clinic', 'school', 'community', 'telehealth', 'any']);

export const Review = z.strictObject({
	status: ReviewStatus,
	authoredBy: Slug,
	authoredOn: IsoDate,
	reviewedBy: Slug.nullable().default(null),
	reviewedOn: IsoDate.nullable().default(null),
	nextReviewDue: IsoDate.nullable().default(null),
	changeNote: z.string().max(280).optional()
});

/**
 * How an approval was reached. Spread into the glossary schema and nowhere else.
 *
 * Reviewing every item of a large corpus to the same depth is not a plan, so the build
 * plan tiers it: situations, ethics and requirements are read one by one, and ordinary
 * definitions are carried by a sample of their batch. That is a defensible way to review
 * a glossary and an indefensible way to review an escalation card — so these two fields
 * exist only on `Term`. Every other schema is strict, which makes `reviewMethod:
 * "sampled"` on a scenario a parse error rather than a judgement call.
 *
 * The point of recording it is that afterwards anyone can tell which items a human
 * actually read and which ones a sample carried. An approval that hides its own basis is
 * worth less than one that states it.
 */
export const SampledApproval = {
	reviewMethod: z.enum(['read', 'sampled']).nullable().default(null),
	/** The draw that carried this item, e.g. "term:principles@a1b2c3:9-of-41". */
	sampledWith: z.string().max(160).nullable().default(null)
} as const;

export const Provenance = z.strictObject({
	license: ContentLicense,
	tier: Tier.default('free'),
	version: z.number().int().min(1).default(1),
	updated: IsoDate
});

/**
 * Author attestation, captured at write time rather than inferred later.
 * Both fields are `z.literal(true)` so an author cannot silently opt out:
 * omitting or negating either is a parse error.
 */
export const Attestation = z.strictObject({
	/** "I wrote this prose myself, in my own words." */
	originalProse: z.literal(true),
	/** "I did not copy or closely paraphrase any source's wording." */
	noVerbatimSource: z.literal(true),
	aiAssisted: z.boolean().default(false),
	/** What the author actually consulted. Documented independent authorship is the defence. */
	consulted: z.string().min(10).max(500)
});
