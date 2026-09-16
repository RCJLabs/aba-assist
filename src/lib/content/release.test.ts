import { describe, expect, it } from 'vitest';
import { gateFor, gatesRelease } from './release.js';
import type { ReviewItem } from './reviewable.js';

function item(over: Partial<ReviewItem> = {}): ReviewItem {
	return {
		id: 'x',
		kind: 'term',
		title: 'A term',
		subtitle: 'principles',
		status: 'in-review',
		category: 'principles',
		gate: null,
		href: null,
		fields: [],
		citations: [],
		consulted: 'Primary sources.',
		...over
	};
}

const approved = (over: Partial<ReviewItem>) => item({ status: 'approved', ...over });

/** Enough approved terms to clear the floor, so other assertions are not masked by it. */
const floorCleared = Array.from({ length: 150 }, (_, i) =>
	approved({ id: `t${i}`, kind: 'term' })
);

describe('the release gate', () => {
	it('counts each required kind separately', () => {
		const gate = gateFor([
			item({ id: 'o1', kind: 'outline', gate: 'outline' }),
			approved({ id: 'o2', kind: 'outline', gate: 'outline' }),
			item({ id: 'c1', kind: 'ethics-code', gate: 'ethics-code' })
		]);
		const outline = gate.requirements.find((r) => r.id === 'outline')!;
		expect(outline.total).toBe(2);
		expect(outline.approved).toBe(1);
		expect(outline.remaining).toBe(1);
	});

	it('counts only escalation cards, not every scenario', () => {
		/*
		 * The distinction the gate turns on. Guidance situations are withheld
		 * individually and grow; escalation cards are required whole, because a gap in
		 * the safety surface is worse than a smaller app.
		 */
		const gate = gateFor([
			item({ id: 's1', kind: 'scenario', gate: 'escalation' }),
			item({ id: 's2', kind: 'scenario', gate: null }),
			item({ id: 's3', kind: 'scenario', gate: null })
		]);
		const escalation = gate.requirements.find((r) => r.id === 'escalation')!;
		expect(escalation.total).toBe(1);
		expect(escalation.remaining).toBe(1);
	});

	it('reports the glossary floor against the number the build enforces', () => {
		const gate = gateFor([approved({ id: 't1' }), item({ id: 't2' })]);
		expect(gate.floor.approved).toBe(1);
		expect(gate.floor.needed).toBe(150);
		expect(gate.floor.remaining).toBe(149);
	});

	it('does not let a local decision count as approved', () => {
		// A build reads the content files. Until an export is applied, nothing changed.
		const items = [item({ id: 'o1', kind: 'outline', gate: 'outline' }), ...floorCleared];
		const gate = gateFor(items, { o1: { decision: 'approved' } });
		const outline = gate.requirements.find((r) => r.id === 'outline')!;
		expect(outline.approved).toBe(0);
		expect(outline.pending).toBe(1);
		expect(outline.remaining).toBe(1);
		expect(gate.met).toBe(false);
	});

	it('says when the pending decisions would be enough, which is the number to work to', () => {
		const items = [item({ id: 'o1', kind: 'outline', gate: 'outline' }), ...floorCleared];
		expect(gateFor(items, { o1: { decision: 'approved' } }).metAfterExport).toBe(true);
		expect(gateFor(items, { o1: { decision: 'needs-change' } }).metAfterExport).toBe(false);
		expect(gateFor(items).metAfterExport).toBe(false);
	});

	it('is met only when every requirement and the floor are clear', () => {
		const required = [
			approved({ id: 'o1', kind: 'outline', gate: 'outline' }),
			approved({ id: 'c1', kind: 'ethics-code', gate: 'ethics-code' }),
			approved({ id: 'r1', kind: 'credential', gate: 'credential' }),
			approved({ id: 's1', kind: 'scenario', gate: 'escalation' })
		];
		expect(gateFor([...required, ...floorCleared]).met).toBe(true);
		// One term short of the floor, and it is not met.
		expect(gateFor([...required, ...floorCleared.slice(1)]).met).toBe(false);
	});

	it('totals what is left across the requirements and the floor', () => {
		const gate = gateFor([
			item({ id: 'o1', kind: 'outline', gate: 'outline' }),
			item({ id: 's1', kind: 'scenario', gate: 'escalation' }),
			...floorCleared.slice(2)
		]);
		// Two required entries, plus the two terms missing from the floor.
		expect(gate.remaining).toBe(4);
	});

	it('identifies the items the gate is waiting on', () => {
		expect(gatesRelease(item({ gate: 'outline' }))).toBe(true);
		expect(gatesRelease(item({ gate: null }))).toBe(false);
	});
});
