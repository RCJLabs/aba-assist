/**
 * Turning a graph document into coordinates, and into a table.
 *
 * Kept apart from the component because this is the part that can be wrong in a way
 * nobody notices: a point plotted half a pixel off looks fine, a data path drawn across
 * a phase-change line looks fine too, and the second one is a false claim about the
 * data. Both are testable here and neither is testable through a rendered SVG.
 */
import type { GraphDoc } from '@aba/content-schema';

export type Axis = GraphDoc['x'];
export type Phase = GraphDoc['phases'][number];
export type Series = GraphDoc['series'][number];
export type Point = Series['points'][number];

/** The drawing box, in viewBox units. Every panel uses the same one, so tiers line up. */
export const BOX = {
	width: 640,
	height: 240,
	left: 62,
	right: 18,
	top: 26,
	bottom: 46
} as const;

export const plotWidth = BOX.width - BOX.left - BOX.right;
export const plotHeight = BOX.height - BOX.top - BOX.bottom;

export function ticks(axis: Axis): number[] {
	const out: number[] = [];
	// Counting up by index rather than accumulating avoids the drift that turns a 0.1
	// step into 0.30000000000000004 on the third tick.
	const steps = Math.floor((axis.to - axis.from) / axis.tickEvery + 1e-9);
	for (let i = 0; i <= steps; i++) out.push(round(axis.from + i * axis.tickEvery));
	if (out.at(-1) !== axis.to) out.push(axis.to);
	return out;
}

function round(n: number): number {
	return Math.round(n * 1e6) / 1e6;
}

export function xPix(axis: Axis, value: number): number {
	return round(BOX.left + ((value - axis.from) / (axis.to - axis.from)) * plotWidth);
}

export function yPix(axis: Axis, value: number): number {
	return round(
		BOX.top + plotHeight - ((value - axis.from) / (axis.to - axis.from)) * plotHeight
	);
}

/** Conditions that apply to one series: its own, or the graph's if none are staggered. */
export function phasesFor(graph: GraphDoc, seriesId: string): Phase[] {
	const own = graph.phases.filter((p) => p.seriesId === seriesId);
	const all = own.length > 0 ? own : graph.phases.filter((p) => p.seriesId === null);
	return [...all].sort((a, b) => a.from - b.from);
}

export function phaseAt(phases: Phase[], x: number): Phase | null {
	return phases.find((p) => x >= p.from && x <= p.to) ?? null;
}

/**
 * The data path, split at every phase change — and, when told the cadence, at every gap.
 *
 * This is the whole reason the module exists. Joining the last point of one condition to
 * the first of the next draws a line asserting that the two belong together, which is
 * exactly what the change was made to interrupt.
 *
 * A gap in the record is the same false claim in a smaller way: a session nobody ran is
 * not a session where the behaviour moved smoothly from one value to the next, and a line
 * drawn through it says it was. Splitting there needs to know how far apart consecutive
 * sessions are supposed to be, which the graph schema does not record — `tickEvery` is
 * how often the axis is *labelled*, not how often data was taken — so `step` is opt-in
 * and callers that omit it get exactly the phase-change behaviour they had before.
 *
 * Inferring the cadence from the smallest gap present was the obvious alternative and is
 * wrong on any record that legitimately changes cadence partway through, where it would
 * invent breaks rather than miss them.
 */
export function segments(points: Point[], phases: Phase[], step?: number): Point[][] {
	const out: Point[][] = [];
	let run: Point[] = [];
	let currentPhase: Phase | null = null;

	for (const pt of points) {
		const phase = phaseAt(phases, pt.x);
		const previous = run.at(-1);
		const gapped =
			step !== undefined && previous !== undefined && pt.x - previous.x > step + 1e-9;
		if (run.length > 0 && (phase !== currentPhase || gapped)) {
			out.push(run);
			run = [];
		}
		currentPhase = phase;
		run.push(pt);
	}
	if (run.length > 0) out.push(run);
	return out;
}

/** Where to draw each phase-change line: between the last session of one and the first of the next. */
export function boundaries(phases: Phase[]): number[] {
	return [...phases]
		.sort((a, b) => a.from - b.from)
		.slice(0, -1)
		.map((p) => p.to + 0.5);
}

export interface Panel {
	id: string;
	/** Null on a graph whose series share one set of conditions. */
	label: string | null;
	series: Series[];
	phases: Phase[];
}

/**
 * One panel, or one per tier.
 *
 * A staggered design has to be drawn as stacked tiers — a single frame with three sets of
 * phase lines across it would say that every change applied to every behaviour, which is
 * the opposite of what the design shows.
 */
export function panels(graph: GraphDoc): Panel[] {
	const tiered = graph.phases.some((p) => p.seriesId !== null);
	if (!tiered) {
		return [
			{
				id: graph.id,
				label: null,
				series: graph.series,
				phases: [...graph.phases].sort((a, b) => a.from - b.from)
			}
		];
	}
	return graph.series.map((s) => ({
		id: s.id,
		label: s.tier ?? s.label,
		series: [s],
		phases: phasesFor(graph, s.id)
	}));
}

export interface Table {
	caption: string;
	head: string[];
	rows: string[][];
}

/**
 * The text alternative that carries the numbers.
 *
 * A long description says what the graph shows; only a table says what the values were.
 * Somebody using a screen reader should be able to get to both, and somebody checking our
 * arithmetic should not have to read pixels off a picture.
 */
export function tables(graph: GraphDoc): Table[] {
	return panels(graph).map((panel) => {
		const xs = [...new Set(panel.series.flatMap((s) => s.points.map((p) => p.x)))].sort(
			(a, b) => a - b
		);
		return {
			caption: panel.label
				? `${graph.title}: ${panel.label}`
				: `${graph.title}: ${graph.y.label} by ${graph.x.label.toLowerCase()}`,
			head: [graph.x.label, ...panel.series.map((s) => s.label), 'Condition'],
			rows: xs.map((x) => [
				String(x),
				...panel.series.map((s) => {
					const pt = s.points.find((p) => p.x === x);
					return pt ? String(pt.y) : '—';
				}),
				phaseAt(panel.phases, x)?.label ?? '—'
			])
		};
	});
}
