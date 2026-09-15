import { describe, expect, it } from 'vitest';
import type { GraphDoc } from '@aba/content-schema';
import {
	boundaries,
	panels,
	phasesFor,
	segments,
	tables,
	ticks,
	xPix,
	yPix
} from './scale.js';
import { graphById, graphList } from '$lib/content/corpus.js';

const X = { label: 'Session', from: 1, to: 6, tickEvery: 1, unit: 'session' };
const Y = { label: 'Count', from: 0, to: 10, tickEvery: 2, unit: 'response' };

const PHASES = [
	{ id: 'baseline', label: 'Baseline', from: 1, to: 3, seriesId: null, changeNote: null },
	{
		id: 'teaching',
		label: 'Teaching',
		from: 4,
		to: 6,
		seriesId: null,
		changeNote: 'Teaching began.'
	}
];

const POINTS = [1, 2, 1, 6, 7, 8].map((y, i) => ({ x: i + 1, y }));

describe('axis ticks', () => {
	it('walks the axis without floating-point drift', () => {
		expect(ticks(Y)).toEqual([0, 2, 4, 6, 8, 10]);
		expect(ticks({ ...Y, from: 0, to: 1, tickEvery: 0.1 })).toEqual([
			0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1
		]);
	});

	it('always ends on the axis maximum, even when the step does not divide it', () => {
		expect(ticks({ ...Y, to: 9 }).at(-1)).toBe(9);
	});
});

describe('placing a value', () => {
	it('puts the axis ends at the ends of the plot', () => {
		expect(xPix(X, X.from)).toBeLessThan(xPix(X, X.to));
		// y grows upward on the graph and downward in SVG, which is the easiest thing here
		// to get backwards and the hardest to notice once the picture looks plausible.
		expect(yPix(Y, Y.to)).toBeLessThan(yPix(Y, Y.from));
	});

	it('is linear', () => {
		const a = xPix(X, 2) - xPix(X, 1);
		const b = xPix(X, 5) - xPix(X, 4);
		expect(a).toBeCloseTo(b, 5);
	});
});

describe('the data path', () => {
	it('never joins two points across a phase change', () => {
		const runs = segments(POINTS, PHASES);
		expect(runs).toHaveLength(2);
		expect(runs[0]!.map((p) => p.x)).toEqual([1, 2, 3]);
		expect(runs[1]!.map((p) => p.x)).toEqual([4, 5, 6]);
	});

	it('draws one path where there is one condition', () => {
		expect(segments(POINTS, [{ ...PHASES[0]!, to: 6 }])).toHaveLength(1);
	});

	it('marks the change between sessions rather than on one', () => {
		// A line drawn on session 3 would sit on top of a data point and read as data.
		expect(boundaries(PHASES)).toEqual([3.5]);
	});

	it('has one fewer boundary than it has conditions', () => {
		const four = [
			{ ...PHASES[0]!, id: 'a', from: 1, to: 2 },
			{ ...PHASES[1]!, id: 'b', from: 3, to: 4 },
			{ ...PHASES[1]!, id: 'c', from: 5, to: 5 },
			{ ...PHASES[1]!, id: 'd', from: 6, to: 6 }
		];
		expect(boundaries(four)).toHaveLength(3);
	});
});

describe('panels', () => {
	const flat = {
		id: 'g',
		title: 'A graph',
		x: X,
		y: Y,
		phases: PHASES,
		series: [{ id: 'a', label: 'A', marker: 'circle', tier: null, points: POINTS }]
	} as unknown as GraphDoc;

	it('draws one frame where the conditions apply to everything', () => {
		expect(panels(flat)).toHaveLength(1);
	});

	it('draws one frame per tier where the conditions are staggered', () => {
		const tiered = {
			...flat,
			series: [
				{ id: 'a', label: 'A', marker: 'circle', tier: 'Tier A', points: POINTS },
				{ id: 'b', label: 'B', marker: 'square', tier: 'Tier B', points: POINTS }
			],
			phases: [
				{ ...PHASES[0]!, id: 'a-b', to: 2, seriesId: 'a' },
				{ ...PHASES[1]!, id: 'a-t', from: 3, seriesId: 'a' },
				{ ...PHASES[0]!, id: 'b-b', to: 4, seriesId: 'b' },
				{ ...PHASES[1]!, id: 'b-t', from: 5, seriesId: 'b' }
			]
		} as unknown as GraphDoc;

		const frames = panels(tiered);
		expect(frames.map((f) => f.label)).toEqual(['Tier A', 'Tier B']);
		// Each tier carries only its own phase lines. One row of lines drawn across all of
		// them would assert that every change applied to every behaviour, which is the
		// reading a staggered design exists to rule out.
		expect(boundaries(frames[0]!.phases)).toEqual([2.5]);
		expect(boundaries(frames[1]!.phases)).toEqual([4.5]);
		expect(phasesFor(tiered, 'b').map((p) => p.id)).toEqual(['b-b', 'b-t']);
	});
});

describe('the data table', () => {
	it('gives every point a row, with the condition it belongs to', () => {
		const t = tables({
			id: 'g',
			title: 'A graph',
			x: X,
			y: Y,
			phases: PHASES,
			series: [{ id: 'a', label: 'Count', marker: 'circle', tier: null, points: POINTS }]
		} as unknown as GraphDoc)[0]!;

		expect(t.head).toEqual(['Session', 'Count', 'Condition']);
		expect(t.rows).toHaveLength(6);
		expect(t.rows[0]).toEqual(['1', '1', 'Baseline']);
		expect(t.rows[5]).toEqual(['6', '8', 'Teaching']);
	});
});

describe('the graphs actually shipped', () => {
	it('has at least one', () => {
		expect(graphList.length).toBeGreaterThan(0);
	});

	it('plots every point inside its axes, so nothing is silently clipped', () => {
		for (const g of graphList) {
			for (const s of g.series) {
				for (const p of s.points) {
					expect(p.x, `${g.id}/${s.id}`).toBeGreaterThanOrEqual(g.x.from);
					expect(p.x, `${g.id}/${s.id}`).toBeLessThanOrEqual(g.x.to);
					expect(p.y, `${g.id}/${s.id}`).toBeGreaterThanOrEqual(g.y.from);
					expect(p.y, `${g.id}/${s.id}`).toBeLessThanOrEqual(g.y.to);
				}
			}
		}
	});

	it('gives every point a condition, so no point is drawn outside a phase', () => {
		for (const g of graphList) {
			for (const panel of panels(g)) {
				for (const s of panel.series) {
					const runs = segments(s.points, panel.phases);
					expect(runs.flat().length, g.id).toBe(s.points.length);
				}
			}
		}
	});

	it('says every graph is invented', () => {
		for (const g of graphList) expect(g.fictional, g.id).toBe(true);
	});

	it('describes the multiple baseline as three staggered tiers', () => {
		const mb = graphById('a-multiple-baseline-across-behaviours');
		expect(mb).toBeDefined();
		const frames = panels(mb!);
		expect(frames).toHaveLength(3);
		expect(frames.map((f) => boundaries(f.phases)[0])).toEqual([4.5, 8.5, 12.5]);
	});
});
