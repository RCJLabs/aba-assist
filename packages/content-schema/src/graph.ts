import { z } from 'zod';
import { strictContent } from './guards.js';
import { Citations } from './source.js';
import { Attestation, Credential, Provenance, Review, Slug } from './primitives.js';
import { TaskRef } from './taxonomy.js';

/**
 * Graphs, as content rather than as pictures.
 *
 * Data Collection and Graphing is the second-largest domain on the technician exam and
 * the one this app taught entirely in words: eight glossary entries describing a line
 * graph to somebody who had never been shown one. A graph is the thing the domain is
 * about, so it belongs in the content pipeline with everything else — reviewed, cited,
 * and carrying a text alternative that is checked rather than hoped for.
 *
 * Two guards here are structural in the same way the copyright and PHI guards are.
 *
 * `fictional` is `z.literal(true)`. Every series in this repository is invented to show
 * one thing. A graph of a real person's behaviour is client data no matter how the axes
 * are labelled, and the way to keep it out is to make "this is real" impossible to say.
 *
 * `longDescription` is required, and the refinement below checks it names every
 * condition on the graph. A picture with no equivalent is not accessible content, and an
 * alternative that omits a phase is not an equivalent. Neither is a judgement call left
 * to whoever writes the next one.
 */

const Point = z.strictObject({
	x: z.number(),
	y: z.number()
});
export type GraphPoint = z.infer<typeof Point>;

const Axis = z.strictObject({
	label: z.string().min(3).max(60),
	from: z.number(),
	to: z.number(),
	/** Spacing of labelled ticks, in data units. */
	tickEvery: z.number().positive(),
	/** What one unit is, for the data table header and the screen reader. */
	unit: z.string().min(1).max(30)
});

/**
 * One condition, and what changed when it began.
 *
 * Phases are inclusive ranges over the horizontal axis. The renderer draws a
 * phase-change line at each boundary and — the part that matters — does not join the
 * data path across one, because a path drawn through a phase line asserts a continuity
 * the design is specifically trying to interrupt.
 */
const Phase = z.strictObject({
	id: Slug,
	/** Our own condition label. Short, because it sits above the graph. */
	label: z.string().min(2).max(40),
	from: z.number(),
	to: z.number(),
	/**
	 * The series this condition belongs to, for a design whose conditions are staggered.
	 *
	 * Null on a graph where one set of conditions applies to everything. A multiple
	 * baseline is the whole reason this exists: its tiers change at different times, and
	 * a single row of phase lines across all of them would draw the one thing the design
	 * is built to rule out.
	 */
	seriesId: Slug.nullable().default(null),
	/** What changed at the start of this condition. Null for the first. */
	changeNote: z.string().min(10).max(240).nullable().default(null)
});

/**
 * A data series.
 *
 * `marker` exists so two series never differ by colour alone — the same rule the rest of
 * the app follows for risk levels, and the one that makes a graph survive a forced-colors
 * theme, a monochrome print-out and a reader who cannot distinguish the two hues.
 */
const Series = z.strictObject({
	id: Slug,
	label: z.string().min(2).max(40),
	marker: z.enum(['circle', 'square', 'triangle', 'diamond']),
	/** Optional tier label, for a multiple-baseline design. */
	tier: z.string().min(2).max(40).nullable().default(null),
	points: z.array(Point).min(3)
});

/** What a reader should be able to see in the data, and how it is described. */
const Reading = z.strictObject({
	id: Slug,
	feature: z.enum([
		'level',
		'trend',
		'variability',
		'immediacy',
		'overlap',
		'phase-change',
		'design'
	]),
	/** The condition being described, where the reading is about one. */
	phaseId: Slug.nullable().default(null),
	text: z.string().min(30).max(600)
});

/**
 * A labelled part of the graph, for the anatomy walkthrough.
 *
 * `at` is in data coordinates rather than pixels, so a callout keeps pointing at the
 * right thing when the graph is redrawn at a phone width.
 */
const Callout = z.strictObject({
	id: Slug,
	label: z.string().min(3).max(40),
	at: Point,
	/** Where the label sits relative to its anchor, so two do not collide. */
	place: z.enum(['above', 'below', 'left', 'right']).default('above'),
	termRef: Slug.nullable().default(null),
	text: z.string().min(20).max(500)
});

export const GraphDoc = strictContent({
	id: Slug,
	title: z.string().min(5).max(90),
	gloss: z.string().min(10).max(160),
	audience: z.array(Credential).min(1),
	/**
	 * THE FABRICATION GUARD. Always true, never optional.
	 *
	 * A graph of one person's behaviour is that person's data. Every series here is made
	 * up to show one thing, the page says so, and the type makes the alternative
	 * unsayable rather than discouraged.
	 */
	fictional: z.literal(true),
	design: z.enum([
		'single-phase',
		'ab',
		'abab',
		'multiple-baseline',
		'changing-criterion',
		'alternating-treatments'
	]),
	x: Axis,
	y: Axis,
	/**
	 * Required wherever the vertical axis does not start at zero.
	 *
	 * A truncated ordinate makes a small change look enormous, which is the commonest way
	 * a technically accurate graph misleads. There are legitimate reasons for one; there
	 * is no legitimate reason not to say what it is, so the refinement below demands it.
	 */
	yAxisNote: z.string().min(20).max(300).nullable().default(null),
	phases: z.array(Phase).min(1),
	series: z.array(Series).min(1),
	readings: z.array(Reading).default([]),
	callouts: z.array(Callout).default([]),
	/**
	 * THE TEXT ALTERNATIVE. Required, and checked against the phases below.
	 *
	 * The renderer also emits the full data table, so the exact numbers are always
	 * reachable. This is the part a table cannot carry: what the graph shows.
	 */
	longDescription: z.string().min(120).max(1600),
	teaching: z.string().min(80).max(1600),
	plainSummary: z.string().min(40).max(600),
	termRefs: z.array(Slug).default([]),
	taskRefs: z.array(TaskRef).default([]),
	citations: Citations,
	attestation: Attestation,
	review: Review,
	provenance: Provenance
}).check((ctx) => {
	const g = ctx.value;
	const fail = (message: string) =>
		ctx.issues.push({ code: 'custom', message: `${g.id}: ${message}`, input: g.id });

	for (const [name, axis] of [
		['x', g.x],
		['y', g.y]
	] as const) {
		if (axis.to <= axis.from) fail(`${name} axis runs from ${axis.from} to ${axis.to}`);
	}

	// A vertical axis that skips zero without saying why is the classic misleading graph.
	if (g.y.from !== 0 && g.yAxisNote === null) {
		fail(
			`the vertical axis starts at ${g.y.from} rather than 0 and yAxisNote does not say why`
		);
	}
	if (g.y.from === 0 && g.yAxisNote !== null) {
		fail('yAxisNote explains a truncated vertical axis, but the axis starts at 0');
	}

	const phaseIds = new Set<string>();
	for (const p of g.phases) {
		if (phaseIds.has(p.id)) fail(`duplicate phase id "${p.id}"`);
		phaseIds.add(p.id);
		if (p.to < p.from) fail(`phase "${p.id}" runs backwards`);
	}

	/*
	 * Conditions are either graph-wide or per-tier, never a mixture.
	 *
	 * A half-staggered graph is always an authoring mistake, and it renders as a phase
	 * line drawn across tiers it does not apply to — which is precisely the misreading a
	 * multiple baseline exists to prevent.
	 */
	const tiered = g.phases.some((p) => p.seriesId !== null);
	if (tiered && g.phases.some((p) => p.seriesId === null)) {
		fail('some conditions name a series and others do not');
	}
	for (const p of g.phases) {
		if (p.seriesId !== null && !g.series.some((s) => s.id === p.seriesId)) {
			fail(`condition "${p.id}" names series "${p.seriesId}", which does not exist`);
		}
	}

	/*
	 * Within each group, phases must tile the horizontal axis exactly: no gap, no overlap,
	 * nothing outside. A gap leaves points belonging to no condition, and a reader cannot
	 * tell whether that means "nothing was recorded" or "the author forgot a phase".
	 */
	const groups = tiered
		? g.series.map((s) => ({
				name: s.id,
				phases: g.phases.filter((p) => p.seriesId === s.id)
			}))
		: [{ name: 'the graph', phases: g.phases }];

	for (const group of groups) {
		if (group.phases.length === 0) {
			fail(`series "${group.name}" has no conditions`);
			continue;
		}
		const ordered = [...group.phases].sort((a, b) => a.from - b.from);
		const first = ordered[0]!;
		const last = ordered.at(-1)!;
		if (first.from !== g.x.from) {
			fail(
				`in ${group.name}, the first condition starts at ${first.from}, not the axis start ${g.x.from}`
			);
		}
		if (last.to !== g.x.to) {
			fail(
				`in ${group.name}, the last condition ends at ${last.to}, not the axis end ${g.x.to}`
			);
		}
		for (let i = 1; i < ordered.length; i++) {
			const prev = ordered[i - 1]!;
			const here = ordered[i]!;
			if (here.from !== prev.to + 1) {
				fail(
					`conditions "${prev.id}" and "${here.id}" leave a gap or overlap between ${prev.to} and ${here.from}`
				);
			}
		}
		// The first condition has nothing before it, so nothing changed to begin it.
		if (first.changeNote !== null) {
			fail(`the first condition "${first.id}" has a changeNote, but nothing preceded it`);
		}
		for (const p of ordered.slice(1)) {
			if (p.changeNote === null) fail(`condition "${p.id}" does not say what changed`);
		}
	}

	const seriesIds = new Set<string>();
	for (const s of g.series) {
		if (seriesIds.has(s.id)) fail(`duplicate series id "${s.id}"`);
		seriesIds.add(s.id);

		const xs = s.points.map((p) => p.x);
		if (xs.some((x, i) => i > 0 && x <= xs[i - 1]!)) {
			fail(`series "${s.id}" has points that are not in ascending order on the x axis`);
		}
		for (const pt of s.points) {
			// A point outside the frame is silently clipped by the renderer, which is the
			// one failure mode a reader has no way to notice.
			if (pt.x < g.x.from || pt.x > g.x.to || pt.y < g.y.from || pt.y > g.y.to) {
				fail(`series "${s.id}" has a point at (${pt.x}, ${pt.y}) outside the axes`);
			}
		}
	}

	// Two series that differ only by colour are unreadable in forced colours or in print.
	const markers = g.series.map((s) => s.marker);
	if (new Set(markers).size !== markers.length) {
		fail('two series share a marker shape, so they would differ by colour alone');
	}

	for (const r of g.readings) {
		if (r.phaseId !== null && !phaseIds.has(r.phaseId)) {
			fail(`reading "${r.id}" names condition "${r.phaseId}", which does not exist`);
		}
	}

	/*
	 * The text alternative has to be an alternative.
	 *
	 * Naming every condition is a low bar, deliberately: it is mechanically checkable, and
	 * a description that omits a phase is missing the part of the graph the phase exists
	 * to show. Whether the rest of the description is any good is a review question.
	 */
	const described = g.longDescription.toLowerCase();
	for (const p of g.phases) {
		if (!described.includes(p.label.toLowerCase())) {
			fail(`longDescription never mentions the "${p.label}" condition`);
		}
	}

	if (g.design === 'multiple-baseline' && g.series.length < 2) {
		fail('a multiple-baseline design needs more than one series');
	}
	if (g.design === 'abab' && g.phases.length !== 4) {
		fail(`an ABAB design has four conditions, not ${g.phases.length}`);
	}
	if (g.design === 'multiple-baseline' && !tiered) {
		fail('a multiple-baseline design needs its conditions staggered across tiers');
	}
	/*
	 * A staggered design is only a design if the tiers actually change at different times.
	 * Introducing treatment everywhere at once is an AB replicated three times, which
	 * demonstrates far less, and on the page the two look almost identical.
	 */
	if (tiered) {
		const onsets = groups.map(
			(group) => [...group.phases].sort((a, b) => a.from - b.from)[1]?.from ?? null
		);
		if (new Set(onsets).size !== onsets.length) {
			fail('two tiers change condition at the same point, so the baselines are not staggered');
		}
	}
});
export type GraphDoc = z.infer<typeof GraphDoc>;
