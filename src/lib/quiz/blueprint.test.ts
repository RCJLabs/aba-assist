import { describe, expect, it } from 'vitest';
import { outlines } from '$lib/content/load.js';
import { loadQuestions } from '$lib/content/load.js';
import { examFormat, planSimulation } from './simulation.js';

/**
 * Whether the bank can run the exam the app offers to simulate.
 *
 * This is a content ratchet expressed as a test rather than a warning, because the
 * failure it guards against is silent: the simulator honestly runs a shorter paper when
 * the bank is thin, so a shortfall never shows up as an error anywhere — it just makes
 * the headline feature quietly not the thing it says it is. The technician exam is the
 * one this app is positioned for, so it is the one held to the standard.
 */

const RBT_MIN_RATIO = 1.4;

describe('the technician question bank', () => {
	it('can fill a full-length paper without repeating an item', async () => {
		const outline = Object.values(outlines).find((o) => o.credential === 'RBT')!;
		const format = examFormat(outline)!;
		const questions = await loadQuestions('RBT');

		const plan = planSimulation(format, questions.length)!;
		expect(
			plan.isFullLength,
			`bank is ${questions.length}, paper is ${format.totalItems}`
		).toBe(true);
		expect(plan.shortfall).toBe(0);
	});

	it('has enough in every area to sample one paper to blueprint, with slack', async () => {
		const outline = Object.values(outlines).find((o) => o.credential === 'RBT')!;
		const questions = await loadQuestions('RBT');

		const perDomain = new Map<string, number>();
		for (const q of questions) {
			const letter = q.taskRef.code[0]!;
			perDomain.set(letter, (perDomain.get(letter) ?? 0) + 1);
		}

		for (const d of outline.domains) {
			if (d.examItems === null) continue;
			const got = perDomain.get(d.letter) ?? 0;
			// Slack matters as much as the total: at exactly 1.0 the second simulation a
			// reader sits is the same paper, which is not practice.
			expect(got, `area ${d.letter} (${d.name})`).toBeGreaterThanOrEqual(
				Math.ceil(d.examItems * RBT_MIN_RATIO)
			);
		}
	});

	it('examines every task on the outline at least once', async () => {
		const outline = Object.values(outlines).find((o) => o.credential === 'RBT')!;
		const questions = await loadQuestions('RBT');
		const cited = new Set(questions.map((q) => q.taskRef.code));

		const missing = outline.domains
			.flatMap((d) => d.tasks.map((t) => t.code))
			.filter((code) => !cited.has(code));
		expect(missing).toEqual([]);
	});
});

/**
 * The analyst bank is held to the weaker of the two ratchets, deliberately.
 *
 * It cannot fill its paper yet — that is a hundred and eighty-five items against a bank
 * less than half the size — and the build says so on every run rather than hiding it.
 * What it can be held to now is that no task on the outline is unexaminable, which is the
 * sharper defect of the two: a thin area gives a candidate less practice, and a task with
 * no question at all gives them none, silently, in an area they may most need.
 *
 * When the bank reaches full length this should be raised to match the technician one.
 */
describe('the analyst question bank', () => {
	it('examines every task on the outline at least once', async () => {
		const outline = Object.values(outlines).find((o) => o.credential === 'BCBA')!;
		const questions = await loadQuestions('BCBA');
		const cited = new Set(questions.map((q) => q.taskRef.code));

		const missing = outline.domains
			.flatMap((d) => d.tasks.map((t) => t.code))
			.filter((code) => !cited.has(code));
		expect(missing).toEqual([]);
	});

	it('has at least one question in every area', async () => {
		const outline = Object.values(outlines).find((o) => o.credential === 'BCBA')!;
		const questions = await loadQuestions('BCBA');
		for (const d of outline.domains) {
			const count = questions.filter((q) => q.taskRef.code.startsWith(`${d.letter}.`)).length;
			expect(count, `area ${d.letter} (${d.name})`).toBeGreaterThan(0);
		}
	});
});
