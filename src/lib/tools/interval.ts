/**
 * Interval recording: the arithmetic, kept away from the clock and the UI.
 *
 * Three procedures share one timer and differ in *when* you score, which is the whole
 * reason a generic stopwatch is the wrong tool for this. Each also biases the estimate in
 * a known direction, and a technician who does not know which way is about to hand their
 * supervisor a number that means something other than what it appears to.
 */

export type Method = 'partial' | 'whole' | 'momentary';

export interface MethodInfo {
	id: Method;
	label: string;
	termId: string;
	/** What the cue means: the question to answer when it fires. */
	prompt: string;
	/** What counts as a yes. */
	scoreIf: string;
	/** Which way the resulting number is wrong, and why that matters. */
	bias: string;
}

export const METHODS: MethodInfo[] = [
	{
		id: 'partial',
		label: 'Partial interval',
		termId: 'partial-interval-recording',
		prompt: 'Did it happen at any point in that interval?',
		scoreIf: 'Score it if the behavior occurred at all, even once, even briefly.',
		bias: 'Overestimates how much of the time the behavior actually occupied, because one second scores the same as the whole interval. Useful for behavior you want to see less of.'
	},
	{
		id: 'whole',
		label: 'Whole interval',
		termId: 'whole-interval-recording',
		prompt: 'Did it happen for that entire interval?',
		scoreIf:
			'Score it only if the behavior continued for the whole interval without stopping.',
		bias: 'Underestimates, because any break in the interval scores a no. Usually paired with behavior you want to see more of, such as staying on task.'
	},
	{
		id: 'momentary',
		label: 'Momentary time sampling',
		termId: 'momentary-time-sampling',
		prompt: 'Is it happening right now, at the cue?',
		scoreIf:
			'Score what is happening at the moment the cue fires. What happened before it does not count.',
		bias: 'Closest of the three to true duration, and the least demanding to run, which is why it suits a session where you are also teaching.'
	}
];

export function methodInfo(id: Method): MethodInfo {
	return METHODS.find((m) => m.id === id) ?? METHODS[0]!;
}

/** Interval lengths people actually use, in seconds. */
export const INTERVAL_CHOICES = [5, 6, 10, 15, 20, 30, 60] as const;
/** Observation lengths, in minutes. */
export const LENGTH_CHOICES = [1, 2, 5, 10, 15, 20, 30] as const;

export interface Plan {
	intervalSeconds: number;
	totalSeconds: number;
	intervals: number;
}

export function plan(intervalSeconds: number, totalMinutes: number): Plan {
	const totalSeconds = Math.max(intervalSeconds, Math.round(totalMinutes * 60));
	return {
		intervalSeconds,
		totalSeconds,
		// Floor, not round: a trailing part-interval is not an interval, and scoring it
		// would quietly change the denominator of the percentage.
		intervals: Math.max(1, Math.floor(totalSeconds / intervalSeconds))
	};
}

/**
 * Which interval the run is in, zero-based, and how long until the next cue.
 *
 * Derived from elapsed time rather than counted up, so a throttled timer, a locked phone
 * or a backgrounded tab can none of them make the run drift. Coming back to the page
 * catches up instead of resuming where it left off.
 */
export function positionAt(
	elapsedMs: number,
	p: Plan
): { index: number; remainingMs: number; finished: boolean } {
	const elapsed = Math.max(0, elapsedMs);
	const raw = Math.floor(elapsed / (p.intervalSeconds * 1000));
	const finished = raw >= p.intervals;
	const index = finished ? p.intervals - 1 : raw;
	const nextBoundary = (index + 1) * p.intervalSeconds * 1000;
	return { index, remainingMs: finished ? 0 : Math.max(0, nextBoundary - elapsed), finished };
}

export interface Tally {
	/** Intervals with a yes or a no recorded. */
	scored: number;
	occurred: number;
	/** Percentage of SCORED intervals, rounded. Null when nothing has been scored. */
	percent: number | null;
}

/**
 * The datum these procedures produce: percentage of intervals.
 *
 * Over scored intervals rather than over all of them. An unscored interval is missing
 * data, and counting it as a no would understate the behavior — the mistake looks like
 * an improvement, which is the worst direction for it to be wrong in.
 */
export function tally(marks: (boolean | null)[]): Tally {
	const scored = marks.filter((m) => m !== null).length;
	const occurred = marks.filter((m) => m === true).length;
	return {
		scored,
		occurred,
		percent: scored === 0 ? null : Math.round((100 * occurred) / scored)
	};
}

export function clock(ms: number): string {
	const s = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
