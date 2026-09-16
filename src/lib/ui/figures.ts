/**
 * One figure, and everything needed to render it honestly.
 *
 * Shared rather than page-local because the app shows the same kinds of number in three
 * places — the home cockpit, the tools hub, and the tracker pages — and they used to
 * disagree about what a red number meant. One type, one component, one set of rules:
 *
 * - **A figure always carries the sentence that makes it mean something.** "7 of 12" is
 *   noise without "440 days left in the cycle", and "3.1%" is worse than noise without
 *   "needs 5%".
 * - **Tone is never carried by colour alone.** Anything not `neutral` also states its
 *   tone in `note`, because a red number is invisible to a good share of the people this
 *   app is for.
 * - **`unknown` is not `short`.** A figure that could not be worked out says so. Showing
 *   a failure where there is only missing input teaches people to ignore the failures
 *   that are real.
 */

export type FigureTone = 'neutral' | 'short' | 'unknown';

/**
 * Where a figure goes when it is a link.
 *
 * A closed union rather than a free string: the base path differs between an origin root
 * and a project site, so every link goes through SvelteKit's `resolve`, and `resolve`
 * needs a route id it can check at build time. Naming the destinations here keeps that
 * check rather than casting it away at the render site.
 */
export type FigureHref =
	| '/study'
	| '/plan'
	| '/tools/supervision'
	| '/tools/development'
	| '/tools/fieldwork'
	| '/competency';

export interface Figure {
	id: string;
	label: string;
	/** The threshold, the deadline, or the caveat — whatever makes the number readable. */
	detail: string;
	/** The figure itself. An em dash where there is honestly no figure. */
	value: string;
	tone: FigureTone;
	/** The tone in words, so colour is never doing the work alone. */
	note: string | null;
	/** Null where the surrounding card is already the link, as on the tools hub. */
	href: FigureHref | null;
}

/** What to print where there is no number, rather than a misleading zero. */
export const NO_FIGURE = '—';
