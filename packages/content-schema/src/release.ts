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
 * A judgement rather than a consequence: a thin public glossary indexes badly and first
 * impressions of a reference are hard to retake. Argue with the number, and change it on
 * purpose.
 */
export const RELEASE_MINIMUM_TERMS = 150;
