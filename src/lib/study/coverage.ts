/**
 * How much of the outline has actually been looked at, and how long there is left.
 *
 * This is the arithmetic behind the dial on the home page. It reports **coverage, not
 * prediction**: how many of the exam's tasks this reader has answered a question on, area
 * by area, weighted by how much of the paper each area is worth. It deliberately does not
 * produce a readiness score, a pass probability, or a single percentage — a bank written
 * by one author is not a calibrated instrument, and every other surface in this app has
 * already refused to pretend otherwise.
 *
 * A task counts as examined when a run asked about it. Not when it was answered
 * correctly: coverage is a record of having looked, and getting it wrong is still a look
 * — arguably a more useful one. Accuracy is `plan.ts`'s job and it is reported separately.
 */
import type { AttemptLike } from './plan.js';

export interface CoverageDomain {
	letter: string;
	name: string;
	/** Share of the paper, or null where the outline does not publish one. */
	weight: number | null;
	/** Tasks in this area that the reader has answered a question on. */
	seen: number;
	/** Tasks in this area, from the outline. */
	total: number;
}

export interface OutlineLike {
	letter: string;
	name: string;
	examWeightPercent: number | null;
	tasks: { code: string }[];
}

/** Every task code any of these runs examined. */
export function tasksExamined(
	attempts: (AttemptLike & { tasks?: string[] })[],
	credential: string
): Set<string> {
	const out = new Set<string>();
	for (const a of attempts) {
		if (a.credential !== credential) continue;
		for (const code of a.tasks ?? []) out.add(code);
	}
	return out;
}

export function domainCoverage(
	domains: OutlineLike[],
	examined: ReadonlySet<string>
): CoverageDomain[] {
	return domains.map((d) => ({
		letter: d.letter,
		name: d.name,
		weight: d.examWeightPercent,
		seen: d.tasks.filter((t) => examined.has(t.code)).length,
		total: d.tasks.length
	}));
}

export interface CoverageTotal {
	seen: number;
	total: number;
}

export function totalCoverage(domains: CoverageDomain[]): CoverageTotal {
	return {
		seen: domains.reduce((n, d) => n + d.seen, 0),
		total: domains.reduce((n, d) => n + d.total, 0)
	};
}

/**
 * Whole days from now until a calendar date.
 *
 * Both sides are floored to a local calendar day before subtracting, so "tomorrow" is 1
 * from any time today rather than 0 at breakfast and 1 at midnight. Returns null for
 * anything that is not a date, and a negative number for a date already gone — the
 * caller decides what to say about that, because "your exam was yesterday" and "you have
 * 40 days" are different sentences.
 */
export function daysUntil(iso: string, now: number): number | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!m) return null;
	const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	if (Number.isNaN(target.getTime())) return null;
	// Round-trip check: 2026-02-31 parses, but not to the day it spells.
	if (target.getMonth() !== Number(m[2]) - 1 || target.getDate() !== Number(m[3])) return null;
	const d = new Date(now);
	const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export interface DialSegment {
	letter: string;
	name: string;
	/** Length of this area's arc along the ring, in user units. */
	length: number;
	/** How far round the ring the arc starts, in degrees, with 0 at twelve o'clock. */
	rotation: number;
	/** Length of the filled part of the arc. Zero when nothing here has been examined. */
	filled: number;
	seen: number;
	total: number;
	weight: number | null;
}

export interface DialGeometry {
	radius: number;
	circumference: number;
	segments: DialSegment[];
}

/**
 * The ring.
 *
 * Each area gets an arc sized by what it is worth on the paper — so Behavior Acquisition,
 * a quarter of the RBT exam, is a quarter of the ring — and filled by the fraction of its
 * tasks that have been examined. That is the whole idea: the shape of the ring is the
 * shape of the exam, and the filled part is what you have been through.
 *
 * Areas with no published weight share the ring equally, which is the only defensible
 * thing to do with a missing number and keeps the ring closed.
 */
export function dialSegments(
	domains: CoverageDomain[],
	opts: { radius: number; gap: number }
): DialGeometry {
	const circumference = 2 * Math.PI * opts.radius;
	const weighted = domains.filter((d) => d.weight !== null);
	const fallback = 100 / Math.max(domains.length, 1);
	const share = (d: CoverageDomain) =>
		weighted.length > 0 ? (d.weight ?? fallback) : fallback;
	const totalShare = domains.reduce((n, d) => n + share(d), 0) || 1;

	let rotation = -90;
	const segments = domains.map((d) => {
		const span = (share(d) / totalShare) * circumference;
		// The gap is taken out of the arc, not added between arcs, so the segments still
		// sum to one closed ring however many areas there are.
		const length = Math.max(span - opts.gap, 1);
		const fraction = d.total > 0 ? d.seen / d.total : 0;
		const seg: DialSegment = {
			letter: d.letter,
			name: d.name,
			length,
			rotation,
			filled: length * fraction,
			seen: d.seen,
			total: d.total,
			weight: d.weight
		};
		rotation += (span / circumference) * 360;
		return seg;
	});

	return { radius: opts.radius, circumference, segments };
}

export interface DialLabel {
	letter: string;
	x: number;
	y: number;
}

/**
 * Where each area's letter sits: outside the ring, level with the middle of its own arc.
 *
 * Kept here rather than in the component so the one thing that can go wrong with it — a
 * letter falling outside the viewBox and being clipped, which is exactly what happened
 * at three and nine o'clock the first time — is something a test can catch.
 */
export function dialLabels(
	geometry: DialGeometry,
	opts: { centre: number; gap: number; offset: number }
): DialLabel[] {
	const radius = geometry.radius + opts.offset;
	return geometry.segments.map((s) => {
		const midDeg = s.rotation + ((s.length + opts.gap) / 2 / geometry.circumference) * 360;
		const rad = (midDeg * Math.PI) / 180;
		return {
			letter: s.letter,
			x: opts.centre + radius * Math.cos(rad),
			// Nudged down by roughly half a cap height, so the letter is centred on the
			// arc rather than sitting on it.
			y: opts.centre + radius * Math.sin(rad) + 4
		};
	});
}

/**
 * What the dial says to somebody who cannot see it.
 *
 * Written as content rather than as a label: a ring of six arcs is not describable as
 * "coverage chart", and summarising it as one number would hand a screen-reader user the
 * single figure the sighted design specifically refuses to show. So it lists the areas,
 * in the order they appear, with the same two numbers each arc carries.
 */
export function dialAltText(
	domains: CoverageDomain[],
	total: CoverageTotal,
	credential: string,
	days: number | null = null
): string {
	const areas = domains
		.map((d) => {
			const weight = d.weight === null ? '' : `, ${d.weight}% of the paper`;
			return `${d.name}${weight}: ${d.seen} of ${d.total} tasks`;
		})
		.join('. ');
	const countdown =
		days === null
			? ''
			: days > 0
				? `${days} ${days === 1 ? 'day' : 'days'} to the ${credential} exam. `
				: days === 0
					? `The ${credential} exam is today. `
					: `The ${credential} exam date given was ${-days} ${days === -1 ? 'day' : 'days'} ago. `;
	return `${countdown}${credential} exam outline coverage: ${total.seen} of ${total.total} tasks examined. ${areas}.`;
}
