import { describe, expect, it } from 'vitest';
import {
	DRILL_KINDS,
	isCorrect,
	makeDrill,
	parseAnswer,
	type Drill,
	type DrillKind
} from './calc.js';

/** A deterministic stand-in for Math.random, cycling through fixed values. */
function seq(values: number[]): () => number {
	let i = 0;
	return () => values[i++ % values.length];
}

/** Every value in a `given` row, as a number, for recomputing independently. */
const nums = (d: Drill): number[] =>
	d.given.flatMap((g) => (g.value.match(/-?\d+(\.\d+)?/g) ?? []).map(Number));

const ALL = DRILL_KINDS.map((k) => k.id);

describe('every drill kind', () => {
	for (const kind of ALL) {
		it(`${kind} generates sound problems across many seeds`, () => {
			for (let i = 0; i < 300; i++) {
				// A spread of seeds rather than one, so every branch of every pick is hit.
				const rng = seq([
					(i * 0.017) % 1,
					(i * 0.113) % 1,
					(i * 0.271) % 1,
					(i * 0.532) % 1,
					(i * 0.751) % 1
				]);
				const d = makeDrill(kind, rng);

				expect(d.kind).toBe(kind);
				expect(d.question.length, 'question').toBeGreaterThan(10);
				expect(d.given.length, 'given rows').toBeGreaterThan(0);
				expect(d.working.length, 'working').toBeGreaterThan(1);
				expect(Number.isFinite(d.answer), `answer for ${kind}`).toBe(true);
				expect(d.answer).toBeGreaterThan(0);
				expect(d.tolerance).toBeGreaterThan(0);

				if (d.unit === '%') {
					expect(d.answer, 'a percentage').toBeLessThanOrEqual(100);
					expect(Number.isInteger(d.answer), 'percentages are asked to the whole').toBe(true);
				}
			}
		});
	}
});

describe('the numbers are clean', () => {
	it('rate problems use a whole number of occurrences', () => {
		for (let i = 0; i < 200; i++) {
			const d = makeDrill('rate', seq([(i * 0.037) % 1, (i * 0.219) % 1, 0.3]));
			const [count, minutes] = nums(d);
			expect(Number.isInteger(count), `count ${count}`).toBe(true);
			// The stated answer is exactly the division, with no hidden rounding step.
			expect(d.answer).toBeCloseTo(count / minutes, 10);
		}
	});

	it('percentage problems use a whole number of correct responses', () => {
		for (let i = 0; i < 200; i++) {
			const d = makeDrill('percentage', seq([(i * 0.041) % 1, (i * 0.307) % 1]));
			const [correct, total] = nums(d);
			expect(Number.isInteger(correct), `correct ${correct}`).toBe(true);
			expect(d.answer).toBe(Math.round((100 * correct) / total));
		}
	});

	it('a mean divides exactly', () => {
		for (const kind of ['mean-duration', 'mean-latency'] as DrillKind[]) {
			for (let i = 0; i < 100; i++) {
				const d = makeDrill(kind, seq([(i * 0.061) % 1, (i * 0.409) % 1]));
				const [n, total] = nums(d);
				expect(total % n, `${total} / ${n}`).toBe(0);
				expect(d.answer).toBe(total / n);
			}
		}
	});
});

describe('the agreement methods', () => {
	it('total count agreement divides the smaller total by the larger', () => {
		for (let i = 0; i < 200; i++) {
			const d = makeDrill('ioa-total-count', seq([(i * 0.053) % 1, (i * 0.331) % 1]));
			const [a, b] = nums(d);
			const lo = Math.min(a, b);
			const hi = Math.max(a, b);
			expect(d.answer).toBe(Math.round((100 * lo) / hi));
			// Never above 100: that is the error this method invites if the division flips.
			expect(d.answer).toBeLessThanOrEqual(100);
		}
	});

	it('exact and interval agreement are a share of the intervals observed', () => {
		for (const kind of ['ioa-exact-agreement', 'ioa-interval'] as DrillKind[]) {
			for (let i = 0; i < 150; i++) {
				const d = makeDrill(kind, seq([(i * 0.071) % 1, (i * 0.211) % 1]));
				const [total, agreed] = nums(d);
				expect(agreed).toBeLessThanOrEqual(total);
				expect(d.answer).toBe(Math.round((100 * agreed) / total));
			}
		}
	});

	it('the working for mean count reproduces the stated answer exactly', () => {
		/*
		 * A reader who follows the steps must land on the number on screen. Averaging
		 * rounded per-interval figures can differ from the answer by a whole percent, so
		 * the pairs are chosen to give exact whole percentages and this checks they do.
		 */
		for (let i = 0; i < 300; i++) {
			const d = makeDrill(
				'ioa-mean-count',
				seq([(i * 0.023) % 1, (i * 0.181) % 1, (i * 0.427) % 1, (i * 0.659) % 1])
			);
			const shown = d.working[1].replace('Per interval: ', '').replace(/[.%]/g, '');
			const values = shown.split(',').map((x) => Number(x.trim()));
			for (const v of values) expect(Number.isInteger(v), `${v} is whole`).toBe(true);
			expect(d.answer).toBe(Math.round(values.reduce((a, b) => a + b, 0) / values.length));
			// And the mean is bracketed, so the step does not read as a division of the
			// last term alone.
			expect(d.working[2]).toMatch(/^Mean: \(/);
		}
	});

	it('mean count per interval averages the intervals rather than the totals', () => {
		/*
		 * The distinction this drill exists to teach. With 5 and 1 against 1 and 5 the
		 * totals match exactly, so total count agreement reads 100% — and agreement worked
		 * out inside each interval reads 20%.
		 */
		const d = makeDrill('ioa-mean-count', seq([0, 0.9, 0.9, 0.9, 0.9, 0.9]));
		expect(d.given).toHaveLength(2);
		const a = d.given[0].value.split(',').map((x) => Number(x.trim()));
		const b = d.given[1].value.split(',').map((x) => Number(x.trim()));
		expect(a).toHaveLength(b.length);
		const expected = Math.round(
			a
				.map((x, i) => {
					const lo = Math.min(x, b[i]);
					const hi = Math.max(x, b[i]);
					return hi === 0 ? 100 : (100 * lo) / hi;
				})
				.reduce((s, x) => s + x, 0) / a.length
		);
		expect(d.answer).toBe(expected);
	});
});

describe('marking', () => {
	const drill = makeDrill('percentage', seq([0.2, 0.4]));

	it('accepts the exact answer and the rounding either side of it', () => {
		expect(isCorrect(drill, drill.answer)).toBe(true);
		expect(isCorrect(drill, drill.answer + 0.4)).toBe(true);
		expect(isCorrect(drill, drill.answer - 0.4)).toBe(true);
	});

	it('rejects a near miss and anything that is not a number', () => {
		expect(isCorrect(drill, drill.answer + 1)).toBe(false);
		expect(isCorrect(drill, NaN)).toBe(false);
	});
});

describe('parseAnswer', () => {
	it('takes what somebody actually types', () => {
		expect(parseAnswer(' 80 ')).toBe(80);
		expect(parseAnswer('80%')).toBe(80);
		expect(parseAnswer('2,5')).toBe(2.5);
		expect(parseAnswer('.5')).toBe(0.5);
	});

	it('returns NaN for anything that is not a number, including empty', () => {
		// The page reads NaN as "not answered yet" rather than as a wrong answer, so a
		// half-typed number must not be marked.
		for (const s of ['', '   ', 'eighty', '8.8.8', '-']) {
			expect(Number.isNaN(parseAnswer(s)), JSON.stringify(s)).toBe(true);
		}
	});
});
