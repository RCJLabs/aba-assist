import { describe, expect, it } from 'vitest';
import { segments } from '$lib/graph/scale.js';
import {
	SESSIONS,
	TICK_EVERY,
	Y_MAX,
	boundaryChoices,
	emptyAnswer,
	makeTask,
	phasesFrom,
	pointsFrom,
	scorePlot,
	type PlotTask
} from './plot.js';

const many = (n = 200) => Array.from({ length: n }, (_, i) => makeTask(`plot-${i}`));

/** The answer a reader who did everything right would have drawn. */
const perfect = (task: PlotTask) => ({
	points: Object.fromEntries(
		task.sessions.filter((s) => s.y !== null).map((s) => [s.x, s.y as number])
	),
	boundary: task.boundary
});

describe('the generated task', () => {
	it('is the same data sheet every time the seed is', () => {
		expect(makeTask('abc')).toEqual(makeTask('abc'));
		expect(makeTask('abc')).not.toEqual(makeTask('abd'));
	});

	it('fits on the axis it is drawn against', () => {
		for (const task of many()) {
			expect(task.sessions).toHaveLength(SESSIONS);
			for (const s of task.sessions) {
				if (s.y === null) continue;
				expect(s.y).toBeGreaterThanOrEqual(0);
				expect(s.y).toBeLessThanOrEqual(Y_MAX);
				expect(Number.isInteger(s.y)).toBe(true);
			}
		}
	});

	it('puts values between the labelled ticks, not only on them', () => {
		/*
		 * The whole reading-off-the-axis skill. An axis labelled every 2 whose data is all
		 * even can be plotted by counting labels, which is not the thing that goes wrong on
		 * a real data sheet.
		 */
		const odd = many().flatMap((t) =>
			t.sessions.filter((s) => s.y !== null && s.y % TICK_EVERY !== 0)
		);
		expect(odd.length).toBeGreaterThan(0);
	});

	it('changes condition once, partway through', () => {
		for (const task of many()) {
			const first = task.sessions.findIndex((s) => s.phase === 1);
			expect(first).toBeGreaterThan(0);
			// Every session before it baseline, every session after it intervention.
			expect(task.sessions.slice(0, first).every((s) => s.phase === 0)).toBe(true);
			expect(task.sessions.slice(first).every((s) => s.phase === 1)).toBe(true);
			expect(task.boundary).toBe(task.sessions[first].x - 0.5);
		}
	});

	it('drops a session sometimes, but never against the edge or the change', () => {
		const tasks = many();
		const dropped = tasks.flatMap((t) => t.sessions.filter((s) => s.y === null));
		expect(dropped.length).toBeGreaterThan(0);

		for (const task of tasks) {
			for (const s of task.sessions) {
				if (s.y !== null) continue;
				expect(s.x).toBeGreaterThan(1);
				expect(s.x).toBeLessThan(SESSIONS);
				/*
				 * Never either side of the phase line. A gap there makes "you joined across a
				 * gap" and "you joined across the change" look identical on the result screen,
				 * and the reader cannot tell which rule they broke.
				 */
				expect(Math.abs(s.x - task.boundary)).toBeGreaterThan(0.5);
			}
		}
	});

	it('never drops more than one session, so there is always a graph to draw', () => {
		for (const task of many()) {
			expect(task.sessions.filter((s) => s.y === null).length).toBeLessThanOrEqual(1);
		}
	});

	it('offers a line position in each gap between columns, and nowhere else', () => {
		const task = makeTask('x');
		expect(boundaryChoices(task)).toHaveLength(SESSIONS - 1);
		expect(boundaryChoices(task)).toContain(task.boundary);
		// Never on a session, always between two.
		expect(boundaryChoices(task).every((b) => b % 1 === 0.5)).toBe(true);
	});
});

describe('scoring a drawn graph', () => {
	const task = makeTask('score-me');

	it('gives a graph drawn correctly every mark there is', () => {
		const out = scorePlot(task, perfect(task));
		expect(out.score).toBe(out.opportunities);
		expect(out.percent).toBe(100);
		expect(out.wrong).toEqual([]);
		expect(out.missing).toEqual([]);
		expect(out.invented).toEqual([]);
	});

	it('scores an empty graph as nothing, not as a blank session got right', () => {
		// Every column left alone is not the same as correctly leaving one alone.
		const out = scorePlot(task, emptyAnswer());
		const blanks = task.sessions.filter((s) => s.y === null).length;
		expect(out.score).toBe(blanks);
		expect(out.missing).toHaveLength(task.sessions.length - blanks);
	});

	it('names the value that was wrong and what it should have been', () => {
		const answer = perfect(task);
		const first = task.sessions.find((s) => s.y !== null)!;
		const out = scorePlot(task, {
			...answer,
			points: { ...answer.points, [first.x]: (first.y as number) + 2 }
		});
		expect(out.wrong).toEqual([
			{ x: first.x, placed: (first.y as number) + 2, truth: first.y }
		]);
	});

	it('counts a phase line in the wrong gap as wrong, not nearly right', () => {
		const answer = perfect(task);
		const out = scorePlot(task, { ...answer, boundary: task.boundary + 1 });
		expect(out.boundaryCorrect).toBe(false);
		expect(out.score).toBe(out.opportunities - 1);
	});

	it('charges for inventing a session that was never run', () => {
		/*
		 * The mistake this drill exists for as much as any other: the column was there, the
		 * two either side had points, so something went in the middle. On a real graph that
		 * is a fabricated data point in a client record.
		 */
		const gapped = many().find((t) => t.sessions.some((s) => s.y === null))!;
		const missed = gapped.sessions.find((s) => s.y === null)!;
		const out = scorePlot(gapped, {
			...perfect(gapped),
			points: { ...perfect(gapped).points, [missed.x]: 5 }
		});
		expect(out.invented).toEqual([missed.x]);
		expect(out.score).toBe(out.opportunities - 1);
	});

	it('counts every session and the line, so the marks add up', () => {
		for (const t of many(60)) {
			const out = scorePlot(t, perfect(t));
			expect(out.opportunities).toBe(t.sessions.length + 1);
			expect(out.correct + out.wrong.length + out.missing.length + out.invented.length).toBe(
				t.sessions.length
			);
		}
	});
});

describe('the graph the reader actually drew', () => {
	it('breaks the path where they put the line, not where it belonged', () => {
		/*
		 * The result screen draws their points under their boundary, so a line in the wrong
		 * gap joins two conditions or splits one — visibly, in the shape of the graph. That
		 * is a better argument than a cross beside the word "boundary".
		 */
		const task = makeTask('draw');
		const answer = { ...perfect(task), boundary: task.boundary + 1 };
		const runs = segments(pointsFrom(answer), phasesFrom(task, answer.boundary), 1);
		const firstRun = runs[0];
		expect(firstRun.at(-1)?.x).toBe(task.boundary + 0.5);
	});

	it('leaves a single unbroken path when nothing has been decided yet', () => {
		const task = makeTask('draw');
		const runs = segments(pointsFrom(perfect(task)), phasesFrom(task, null), 1);
		const gapped = task.sessions.some((s) => s.y === null);
		// One run, unless the sheet has a gap — which breaks it for the other reason.
		expect(runs).toHaveLength(gapped ? 2 : 1);
	});

	it('never joins across a session that was left blank', () => {
		const task = many().find((t) => t.sessions.some((s) => s.y === null))!;
		const missed = task.sessions.find((s) => s.y === null)!;
		const runs = segments(pointsFrom(perfect(task)), phasesFrom(task, task.boundary), 1);
		for (const run of runs) {
			for (let i = 1; i < run.length; i++) {
				expect(run[i].x - run[i - 1].x).toBe(1);
			}
		}
		expect(runs.flat().some((p) => p.x === missed.x)).toBe(false);
	});
});
