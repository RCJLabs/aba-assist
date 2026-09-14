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
