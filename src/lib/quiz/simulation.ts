/**
 * Planning a full-length exam simulation.
 *
 * The valuable thing about a simulation is not the question count, it is the pace: the
 * technician exam gives you a little over a minute per question for ninety minutes, and
 * finding that out on the day is the problem this is meant to solve.
 *
 * Which matters because this app cannot yet run a real full-length paper — there are
 * fewer questions written than the exam has items. The honest response is to run the
 * longest paper the bank supports **at the real seconds per question**, and to say
 * plainly how far short of full length that is. Silently padding by repeating questions
 * would make the number on screen a lie, and inventing questions to fill the gap is how
 * the incumbent apps ended up with the wrong answers that define their reviews.
 */

export interface ExamFormat {
	/** Items on the real paper, scored and unscored. */
	totalItems: number;
	scoredItems: number;
	minutes: number;
}

export interface SimulationPlan {
	/** Questions this run will actually ask. */
	questions: number;
	/** Minutes allowed for them, at the real exam's pace. */
	minutes: number;
	secondsPerQuestion: number;
	/** The real paper, for comparison on screen. */
	fullLength: ExamFormat;
	/** How many questions short of full length this run is. Zero once the bank is big enough. */
	shortfall: number;
	isFullLength: boolean;
}

/** The exam's own format, from a content outline, or null where it is not modelled. */
export function examFormat(outline: {
	exam: { scoredItems: number | null; unscoredItems: number | null; minutes: number | null };
}): ExamFormat | null {
	const { scoredItems, unscoredItems, minutes } = outline.exam;
	if (scoredItems === null || minutes === null) return null;
	return {
		scoredItems,
		totalItems: scoredItems + (unscoredItems ?? 0),
		minutes
	};
}

/**
 * How long a run of `questions` should get, rounded up to the minute.
 *
 * Rounded up rather than down: a simulation that is a few seconds meaner than the real
 * exam is not a more useful simulation, it is just wrong in the direction that makes
 * somebody panic.
 */
export function planSimulation(format: ExamFormat, bankSize: number): SimulationPlan | null {
	if (bankSize <= 0) return null;
	const secondsPerQuestion = (format.minutes * 60) / format.totalItems;
	const questions = Math.min(bankSize, format.totalItems);
	return {
		questions,
		minutes: Math.ceil((questions * secondsPerQuestion) / 60),
		secondsPerQuestion: Math.round(secondsPerQuestion * 10) / 10,
		fullLength: format,
		shortfall: format.totalItems - questions,
		isFullLength: questions >= format.totalItems
	};
}

/** Seconds left, floored at zero. Derived from the clock so a hidden tab cannot pause it. */
export function secondsLeft(deadlineAt: number, now: number): number {
	return Math.max(0, Math.ceil((deadlineAt - now) / 1000));
}

export function formatClock(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const mm = String(m).padStart(2, '0');
	const ss = String(sec).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Thresholds worth saying out loud, in seconds remaining.
 *
 * A countdown that announces every tick is unusable with a screen reader, and one that
 * announces nothing is invisible without sight. These are the points a person actually
 * changes behaviour at.
 */
export const WARN_AT = [1800, 600, 300, 60] as const;

/**
 * The threshold crossed between two readings, or null if none was.
 *
 * Searched from the most urgent end. A backgrounded tab comes back with minutes gone and
 * several thresholds crossed at once; announcing the largest of them would tell somebody
 * with thirty seconds left that they have half an hour.
 */
export function crossedWarning(previous: number, current: number): number | null {
	for (let i = WARN_AT.length - 1; i >= 0; i--) {
		const t = WARN_AT[i]!;
		if (previous > t && current <= t) return t;
	}
	return null;
}
