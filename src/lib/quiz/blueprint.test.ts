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
 * the headline feature quietly not the thing it says it is.
 *
 * Both banks are now held to the same standard. The ratio is what makes a second sitting
 * a different paper rather than the same one again: at exactly one times the blueprint
 * every simulation draws the entire bank, so the slack is the point rather than a margin.
 */

const MIN_RATIO = 1.4;

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
				Math.ceil(d.examItems * MIN_RATIO)
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

describe('the technician bank at task level', () => {
	/*
	 * The area ratchets above can be met while an individual task carries one question,
	 * and a task with one question is a task the reader meets once and then recognises by
	 * its wording rather than by knowing the answer.
	 *
	 * The ethics floor is higher on purpose. The 3rd edition doubled this domain — F.5 to
	 * F.9 are the tasks it added — and being right about the current edition is the whole
	 * claim this app makes against material still written for the previous one. A thin
	 * ethics domain would make that claim hollow in exactly the place it is checked.
	 */
	const TASK_FLOOR = 2;
	const ETHICS_ADDED = ['F.5', 'F.6', 'F.7', 'F.8', 'F.9'];
	const ETHICS_FLOOR = 4;

	const counts = async () => {
		const questions = await loadQuestions('RBT');
		const per = new Map<string, number>();
		for (const q of questions) per.set(q.taskRef.code, (per.get(q.taskRef.code) ?? 0) + 1);
		return per;
	};

	it('asks about every task at least twice', async () => {
		const per = await counts();
		const outline = Object.values(outlines).find((o) => o.credential === 'RBT')!;
		const thin = outline.domains
			.flatMap((d) => d.tasks.map((t) => t.code))
			.filter((code) => (per.get(code) ?? 0) < TASK_FLOOR);
		expect(thin).toEqual([]);
	});

	it('covers the tasks the 3rd edition added more than twice over', async () => {
		const per = await counts();
		for (const code of ETHICS_ADDED) {
			expect(per.get(code) ?? 0, `task ${code}`).toBeGreaterThanOrEqual(ETHICS_FLOOR);
		}
	});

	it('covers the crisis task, which is the one with the worst failure mode', async () => {
		const per = await counts();
		expect(per.get('D.7') ?? 0).toBeGreaterThanOrEqual(ETHICS_FLOOR);
	});
});

describe('the analyst question bank', () => {
	it('can fill a full-length paper without repeating an item', async () => {
		const outline = Object.values(outlines).find((o) => o.credential === 'BCBA')!;
		const format = examFormat(outline)!;
		const questions = await loadQuestions('BCBA');

		const plan = planSimulation(format, questions.length)!;
		expect(
			plan.isFullLength,
			`bank is ${questions.length}, paper is ${format.totalItems}`
		).toBe(true);
		expect(plan.shortfall).toBe(0);
	});

	it('has enough in every area to sample one paper to blueprint, with slack', async () => {
		const outline = Object.values(outlines).find((o) => o.credential === 'BCBA')!;
		const questions = await loadQuestions('BCBA');
		for (const d of outline.domains) {
			if (d.examItems === null) continue;
			const count = questions.filter((q) => q.taskRef.code.startsWith(`${d.letter}.`)).length;
			expect(count, `area ${d.letter} (${d.name})`).toBeGreaterThanOrEqual(
				Math.ceil(d.examItems * MIN_RATIO)
			);
		}
	});

	it('examines every task on the outline at least once', async () => {
		const outline = Object.values(outlines).find((o) => o.credential === 'BCBA')!;
		const questions = await loadQuestions('BCBA');
		const cited = new Set(questions.map((q) => q.taskRef.code));

		const missing = outline.domains
			.flatMap((d) => d.tasks.map((t) => t.code))
			.filter((code) => !cited.has(code));
		expect(missing).toEqual([]);
	});
});

describe('the assistant-analyst question bank', () => {
	/*
	 * Held to the same ratchet as the other two, with one difference in how it is expressed.
	 *
	 * The assistant outline does not publish the exam's time limit, so `examFormat` returns
	 * null and `planSimulation` cannot be used here — deliberately, because a simulation
	 * paced against a guess is worse than none. The bank size is therefore checked against
	 * the paper the outline does describe: its scored and unscored question counts.
	 */
	const outline = () => Object.values(outlines).find((o) => o.credential === 'BCaBA')!;

	it('has enough questions for a paper the length of the real one', async () => {
		const o = outline();
		const paper = o.exam.scoredItems! + (o.exam.unscoredItems ?? 0);
		const questions = await loadQuestions('BCaBA');
		expect(
			questions.length,
			`bank is ${questions.length}, paper is ${paper}`
		).toBeGreaterThanOrEqual(paper);
	});

	it('has enough in every area to sample one paper to blueprint, with slack', async () => {
		const questions = await loadQuestions('BCaBA');
		for (const d of outline().domains) {
			if (d.examItems === null) continue;
			const count = questions.filter((q) => q.taskRef.code.startsWith(`${d.letter}.`)).length;
			expect(count, `area ${d.letter} (${d.name})`).toBeGreaterThanOrEqual(
				Math.ceil(d.examItems * MIN_RATIO)
			);
		}
	});

	it('examines every task on the outline at least once', async () => {
		const questions = await loadQuestions('BCaBA');
		const cited = new Set(questions.map((q) => q.taskRef.code));

		const missing = outline()
			.domains.flatMap((d) => d.tasks.map((t) => t.code))
			.filter((code) => !cited.has(code));
		expect(missing).toEqual([]);
	});

	it('is its own bank, not the analyst bank relabelled', async () => {
		// The two credentials number their tasks independently, so a question filed under
		// the wrong one lands on a task that exists and asks something else.
		const questions = await loadQuestions('BCaBA');
		expect(questions.every((q) => q.credential === 'BCaBA')).toBe(true);
		expect(questions.every((q) => q.taskRef.credential === 'BCaBA')).toBe(true);

		const analyst = await loadQuestions('BCBA');
		const ids = new Set(analyst.map((q) => q.id));
		expect(questions.filter((q) => ids.has(q.id))).toEqual([]);

		const stems = new Set(analyst.map((q) => q.stem));
		expect(questions.filter((q) => stems.has(q.stem))).toEqual([]);
	});
});
