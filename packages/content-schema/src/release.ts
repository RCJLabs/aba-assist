/**
 * What stands between a preview build and a release, as plain data.
 *
 * The compiler enforces these and the review queue displays them, so they live here
 * rather than beside the schemas: a page that shows somebody how far they have to go
 * must not pull the validation library in to find out.
 */

/**
 * Kinds that have to be complete rather than growing entry by entry.
 *
 * Small fixed sets everything else is built on, where a partial one is not a smaller app
 * but a broken or an unsafe one.
 */
export const RELEASE_REQUIRED_KINDS = [
	{ id: 'outline', label: 'Task list outlines' },
	{ id: 'ethics-code', label: 'Ethics codes' },
	{ id: 'credential', label: 'Credential requirements' },
	{ id: 'escalation', label: 'Escalation cards' }
] as const;

export type ReleaseRequiredKind = (typeof RELEASE_REQUIRED_KINDS)[number]['id'];

/**
 * How much of the glossary has to be approved before a build may call itself a release.
 *
 * Argued with, and kept. It began as a judgement — a thin public glossary indexes badly
 * and first impressions of a reference are hard to retake — and the obvious way to reach
 * a launch sooner was to cut it. Counting first said otherwise: the 43 tasks of the RBT
 * outline name **141 distinct terms** between them, and the escalation cards name 14
 * more. A floor below about 143 does not ship a smaller glossary, it ships an outline
 * whose own task links have been pruned away.
 *
 * So the number stays, and what changed instead is *which* terms the launch set picks.
 * See `LAUNCH_OUTLINE`.
 */
export const RELEASE_MINIMUM_TERMS = 150;

/**
 * The outline a launch has to be able to stand behind, whole.
 *
 * All three outlines must be approved before a release, but their vocabularies are very
 * different sizes: RBT names 141 terms, BCaBA 214, BCBA 255 — which is every term there
 * is. Requiring all of them would mean the floor is the whole glossary, so the launch set
 * has to lead with one, and this names it rather than leaving it to a ranking that has no
 * opinion about credentials.
 *
 * RBT, because it is the credential this app's claim rests on: the 3rd edition took
 * effect on 2026-01-01 and most circulating material is still written against the 2nd.
 * Being right about that outline is the whole differentiator, and an RBT task that cannot
 * link to the terms it names is the one broken thing a reader would notice first.
 */
export const LAUNCH_OUTLINE = 'rbt-tco-3';
