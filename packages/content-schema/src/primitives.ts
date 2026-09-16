import { z } from 'zod';
import { SETTING_VALUES } from './settings.js';

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

/**
 * Channels that withhold an entry rather than refuse to build.
 *
 * The guarantee is the same either way: nothing unreviewed reaches a reader. The
 * difference is what an unreviewed entry costs. Refusing made launch all-or-nothing —
 * every entry approved, or nothing public at all — which turns a review backlog into a
 * wall rather than a queue. Withholding lets the approved core ship and grow, and the
 * entry is still parsed, validated and rights-checked on the way to being left out.
 *
 * `pr` deliberately keeps refusing: a draft in a pull request is the author's problem to
 * fix before proposing it, not something to quietly drop.
 */
export const WITHHOLDING_CHANNELS: ReadonlySet<Channel> = new Set<Channel>(['release']);

/**
 * Kinds that have to be complete before a release build, rather than growing entry by
 * entry.
 *
 * These are small fixed sets that everything else is built on, and a partial one is not a
 * smaller app but a broken or unsafe one. A missing task outline silently empties the exam
 * filters and the quiz blueprint; a missing renewal rule makes the tracker compute against
 * nothing; and an escalation card withheld while its neighbours ship means somebody
 * looking up the worst thing that can happen in a session finds a gap. Together they come
 * to a couple of dozen entries, so requiring them is a small, concrete first target.
 */
export const RELEASE_REQUIRES_COMPLETE = [
	'outline',
	'ethics-code',
	'escalation scenario',
	'credential'
] as const;

/**
 * Re-exported from the Zod-free half, which is where the review queue reads it from.
 * One definition, so the number the build enforces and the number the page shows cannot
 * drift apart.
 */
export { RELEASE_MINIMUM_TERMS } from './release.js';

export const ContentLicense = z.enum([
	'CC-BY-SA-4.0',
	'CC-BY-4.0',
	'CC0-1.0',
	'proprietary-aba-help'
]);

export const Tier = z.enum(['free', 'pro']);
export type Tier = z.infer<typeof Tier>;

// Built from the shared list, so the enum and the labels the app renders cannot drift.
export const Setting = z.enum(SETTING_VALUES);

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
