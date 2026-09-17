/**
 * Drawing the graph, rather than reading one.
 *
 * `/graphs` teaches reading: what a level change looks like, what a trend is, why a
 * truncated axis flatters an intervention. Plotting is a different skill on the same task
 * list, and it is the one a technician is actually asked to do — the data sheet comes back
 * and somebody has to put it on paper before the meeting.
 *
 * Three things go wrong by hand, and this scores all three:
 *
 *   The value. Reading 7 off a sheet and finding it on an axis labelled every 2 is not
 *   the same as reading 8, which is why the generated values are not all even.
 *
 *   The session nobody ran. It gets a point anyway, invented out of the two either side,
 *   because the column was there and looked empty.
 *
 *   The phase-change line. It goes *between* the last session of one condition and the
 *   first of the next, not through either of them, and the data path does not cross it.
 *
 * Every session is one decision — plot it at the right value, or correctly leave it alone
 * — plus one for the line. Scoring them uniformly is what keeps a reader who invented a
 * point from scoring the same as one who left it out.
 *
 * Generated, so nothing here is authored prose about clinical practice and it adds nothing
 * to the review queue. The data is fictional in the same way the published graphs are, and
 * the page says so.
 */

import { rngFor } from '$lib/rand.js';
import type { Phase } from '$lib/graph/scale.js';

/** One column of the data sheet. */
export interface PlotSession {
	x: number;
	/** The value recorded, or null for a session that was not run. */
	y: number | null;
	/** 0 before the change, 1 after it. */
	phase: 0 | 1;
}

export interface PlotTask {
	seed: string;
	behavior: string;
	/** What one unit on the vertical axis is, for the axis label and the table header. */
	unit: string;
	yMax: number;
	tickEvery: number;
	sessions: PlotSession[];
	phaseLabels: [string, string];
	/** Halfway between the last baseline session and the first intervention one. */
	boundary: number;
}

/** What the reader drew. A session absent from `points` is one they left blank. */
export interface PlotAnswer {
	points: Readonly<Record<number, number>>;
	boundary: number | null;
}

export const emptyAnswer = (): PlotAnswer => ({ points: {}, boundary: null });

/*
 * Targets a technician would actually be asked to graph, each with the direction the
 * intervention is supposed to move it. Named as behaviour rather than as judgement, the
 * same rule the rest of the app's generated content follows.
 */
const TARGETS = [
	{ behavior: 'Calling out', unit: 'times per session', down: true },
	{ behavior: 'Leaving the seat', unit: 'times per session', down: true },
	{ behavior: 'Hand raising', unit: 'times per session', down: false },
	{ behavior: 'Independent requests', unit: 'requests per session', down: false },
	{ behavior: 'Steps completed unprompted', unit: 'steps per session', down: false },
	{ behavior: 'Task refusals', unit: 'times per session', down: true }
];

export const SESSIONS = 8;
export const Y_MAX = 10;
export const TICK_EVERY = 2;

export function makeTask(seed: string): PlotTask {
	const rng = rngFor(seed);
	const pick = <T>(list: readonly T[]) => list[Math.floor(rng() * list.length) % list.length];
	const between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

	const target = pick(TARGETS);
	// Three or four baseline sessions: enough to show a level, short enough that the
	// intervention has somewhere to go inside eight columns.
	const baselineLength = between(3, 4);

	/*
	 * Baseline sits at one end of the axis and the intervention moves toward the other,
	 * with a session-to-session wobble. Without the wobble every point would sit on one of
	 * two heights and the exercise would be transcription rather than plotting.
	 */
	const baselineLevel = target.down ? between(7, 9) : between(1, 3);
	const treatmentLevel = target.down ? between(1, 3) : between(7, 9);

	const sessions: PlotSession[] = [];
	for (let x = 1; x <= SESSIONS; x++) {
		const inBaseline = x <= baselineLength;
		const level = inBaseline ? baselineLevel : treatmentLevel;
		const wobble = between(-1, 1);
		sessions.push({
			x,
			y: Math.max(0, Math.min(Y_MAX, level + wobble)),
			phase: inBaseline ? 0 : 1
		});
	}

	/*
	 * Some tasks drop a session, never the first or last and never either side of the
	 * change. A gap next to the phase line would make two different mistakes look the same
	 * on the result screen, and a reader could not tell which rule they had got wrong.
	 */
	if (rng() < 0.45) {
		const candidates = sessions
			.map((s) => s.x)
			.filter(
				(x) => x > 1 && x < SESSIONS && x !== baselineLength && x !== baselineLength + 1
			);
		const drop = pick(candidates);
		const hit = sessions.find((s) => s.x === drop);
		if (hit) hit.y = null;
	}

	return {
		seed,
		behavior: target.behavior,
		unit: target.unit,
		yMax: Y_MAX,
		tickEvery: TICK_EVERY,
		sessions,
		phaseLabels: ['Baseline', 'Intervention'],
		boundary: baselineLength + 0.5
	};
}

/** Every boundary the reader is allowed to choose: the gaps between columns. */
export const boundaryChoices = (task: PlotTask): number[] =>
	task.sessions.slice(0, -1).map((s) => s.x + 0.5);

/**
 * The conditions implied by a phase line, for rendering.
 *
 * Built from whatever boundary is passed rather than from the task, so the result screen
 * can draw the reader's own graph under their own line. A phase line in the wrong place
 * then joins two conditions or splits one, visibly, which is a better argument than a
 * cross beside the word "boundary".
 */
export function phasesFrom(task: PlotTask, boundary: number | null): Phase[] {
	const first = task.sessions[0]?.x ?? 1;
	const last = task.sessions.at(-1)?.x ?? SESSIONS;
	if (boundary === null) {
		return [{ id: 'all', label: '', from: first, to: last, seriesId: null, changeNote: null }];
	}
	return [
		{
			id: 'before',
			label: task.phaseLabels[0],
			from: first,
			to: Math.floor(boundary),
			seriesId: null,
			changeNote: null
		},
		{
			id: 'after',
			label: task.phaseLabels[1],
			from: Math.ceil(boundary),
			to: last,
			seriesId: null,
			changeNote: null
		}
	];
}

/** The points as drawn, in session order, skipping anything left blank. */
export const pointsFrom = (answer: PlotAnswer): { x: number; y: number }[] =>
	Object.entries(answer.points)
		.map(([x, y]) => ({ x: Number(x), y }))
		.sort((a, b) => a.x - b.x);

export interface WrongPoint {
	x: number;
	placed: number;
	truth: number;
}

export interface PlotScore {
	/** Sessions with data, plotted at the right value. */
	correct: number;
	/** Sessions with data, plotted at the wrong value. */
	wrong: WrongPoint[];
	/** Sessions with data, left blank. */
	missing: number[];
	/** Sessions with no data, plotted anyway. */
	invented: number[];
	boundaryCorrect: boolean;
	/** Every session, plus the phase line. */
	opportunities: number;
	score: number;
	percent: number;
}

export function scorePlot(task: PlotTask, answer: PlotAnswer): PlotScore {
	const wrong: WrongPoint[] = [];
	const missing: number[] = [];
	const invented: number[] = [];
	let correct = 0;

	for (const session of task.sessions) {
		const placed = answer.points[session.x];
		if (session.y === null) {
			/*
			 * A session nobody ran. Leaving it blank is a decision, and the right one — it
			 * scores exactly as much as plotting a real point correctly, because on a real
			 * data sheet it is exactly as easy to get wrong.
			 */
			if (placed === undefined) correct += 1;
			else invented.push(session.x);
			continue;
		}
		if (placed === undefined) missing.push(session.x);
		else if (placed === session.y) correct += 1;
		else wrong.push({ x: session.x, placed, truth: session.y });
	}

	const boundaryCorrect = answer.boundary === task.boundary;
	const opportunities = task.sessions.length + 1;
	const score = correct + (boundaryCorrect ? 1 : 0);
	return {
		correct,
		wrong,
		missing,
		invented,
		boundaryCorrect,
		opportunities,
		score,
		percent: Math.round((score / opportunities) * 100)
	};
}
