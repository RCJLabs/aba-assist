/**
 * Taking data on a session, instead of doing arithmetic on somebody else's.
 *
 * The calculation drills hand a reader a count and a duration and ask them to work out a
 * rate. That is half of the measurement domain. The other half is the part nobody can
 * read their way into: watching a learner and catching a three-second behaviour while it
 * is happening, on the method the plan actually specifies. Data collection and graphing
 * is seventeen per cent of the technician paper and the one area where the skill is motor
 * rather than verbal, and until now the app had no surface for it at all.
 *
 * So: a behaviour stream plays out, the reader records it with the real methods, and the
 * record is scored against what actually happened.
 *
 * The teaching payoff is not the score. It is that one stream can be reported five
 * different ways, and the numbers disagree — partial interval reads high, whole interval
 * reads low, and no amount of being told that lands like watching it happen to data you
 * took yourself. Every result screen therefore reports what *every* method would have
 * said about the same two minutes, not just the one the reader chose.
 *
 * Nothing here is authored prose about clinical practice, so like the calculation drills
 * it adds nothing to the review queue.
 */

import { rngFor } from '$lib/rand.js';
import type { Rng } from './calc.js';

export type Method =
	'frequency' | 'duration' | 'partial-interval' | 'whole-interval' | 'momentary-time-sampling';

/** What a method reports, which decides how a reader's record is compared to the truth. */
export type Unit = 'count' | 'seconds' | 'percent-of-intervals';

export interface MethodInfo {
	id: Method;
	label: string;
	/** What to do while the run is going, in the imperative. */
	instruction: string;
	/** What the measure is, for somebody looking at a number they did not expect. */
	blurb: string;
	unit: Unit;
	/** Continuous methods record every occurrence; the rest sample. */
	continuous: boolean;
	taskRefs: string[];
	termId: string;
}

export const METHODS: MethodInfo[] = [
	{
		id: 'frequency',
		label: 'Frequency',
		instruction: 'Tap once each time it starts.',
		blurb: 'Every occurrence, counted. Nothing is missed and nothing is inferred.',
		unit: 'count',
		continuous: true,
		taskRefs: ['A.1', 'A.6'],
		termId: 'frequency-and-rate'
	},
	{
		id: 'duration',
		label: 'Duration',
		instruction: 'Hold the control on for exactly as long as it lasts.',
		blurb: 'How much of the session the behavior took up, timed rather than estimated.',
		unit: 'seconds',
		continuous: true,
		taskRefs: ['A.1', 'A.6'],
		termId: 'duration'
	},
	{
		id: 'partial-interval',
		label: 'Partial interval',
		instruction: 'Mark the interval if it happens at all, even once, even briefly.',
		blurb:
			'An interval counts if the behavior occurred at any point in it, so a two-second episode scores a whole interval. It reads high.',
		unit: 'percent-of-intervals',
		continuous: false,
		taskRefs: ['A.2', 'A.6'],
		termId: 'partial-interval-recording'
	},
	{
		id: 'whole-interval',
		label: 'Whole interval',
		instruction: 'Mark the interval only if it lasts the entire interval.',
		blurb:
			'An interval counts only if the behavior ran from one end of it to the other, so anything that pauses scores nothing. It reads low.',
		unit: 'percent-of-intervals',
		continuous: false,
		taskRefs: ['A.2', 'A.6'],
		termId: 'whole-interval-recording'
	},
	{
		id: 'momentary-time-sampling',
		label: 'Momentary time sampling',
		instruction: 'At the cue, mark it only if it is happening at that exact moment.',
		blurb:
			'One look per interval, at the cue. What happens between cues is not recorded at all.',
		unit: 'percent-of-intervals',
		continuous: false,
		taskRefs: ['A.2', 'A.6'],
		termId: 'momentary-time-sampling'
	}
];

export const methodInfo = (id: Method): MethodInfo =>
	METHODS.find((m) => m.id === id) ?? METHODS[0];

/** A stretch of time the behavior was occurring. Half-open: `start` counts, `end` does not. */
export interface Episode {
	start: number;
	end: number;
}

export interface Stream {
	/** The seed, kept so a reader can run the same session again on another method. */
	seed: string;
	behavior: string;
	/** Total observation length, always a whole number of intervals. */
	seconds: number;
	intervalSeconds: number;
	episodes: readonly Episode[];
}

/*
 * Ordinary classroom and clinic behaviours, named as a behaviour rather than as a
 * judgement: "leaving the seat", never "non-compliance". Shared with the calculation
 * drills in spirit but kept separate, because these have to read naturally in the present
 * tense while a run is going.
 */
const BEHAVIORS = [
	'hand raising',
	'talking out of turn',
	'leaving the seat',
	'hand flapping',
	'head down on the desk',
	'requesting with a picture card'
];

export const LENGTHS = [60, 120, 240] as const;
export const INTERVALS = [5, 10, 15] as const;

export interface StreamOptions {
	seconds?: number;
	intervalSeconds?: number;
}

/**
 * Build a session to observe.
 *
 * Episode lengths deliberately straddle the interval. A stream whose episodes are all
 * shorter than an interval makes partial interval look absurd and whole interval look
 * broken; one whose episodes are all longer makes the three sampling methods agree. The
 * disagreement is the lesson, so the generator has to produce both kinds.
 */
export function makeStream(seed: string, options: StreamOptions = {}): Stream {
	const seconds = options.seconds ?? 120;
	const intervalSeconds = options.intervalSeconds ?? 10;
	const rng = rngFor(seed);
	return {
		seed,
		behavior: BEHAVIORS[Math.floor(rng() * BEHAVIORS.length) % BEHAVIORS.length],
		seconds,
		intervalSeconds,
		episodes: makeEpisodes(rng, seconds, intervalSeconds)
	};
}

function makeEpisodes(rng: Rng, seconds: number, intervalSeconds: number): Episode[] {
	const episodes: Episode[] = [];
	const longest = Math.max(2, Math.round(intervalSeconds * 1.6));
	let t = 0;
	while (t < seconds) {
		/*
		 * Roughly a third of the gaps are quiet stretches longer than an interval, and they
		 * are not decoration. With every gap shorter than an interval, every interval gets
		 * touched, partial interval reads 100% on every stream ever generated, and the
		 * exercise degenerates into marking every box — while teaching, confidently, a
		 * thing that is not true about the method.
		 */
		const gap =
			rng() < 0.35
				? intervalSeconds * (1 + Math.floor(rng() * 3))
				: 1 + Math.floor(rng() * Math.max(2, intervalSeconds));
		const start = t + gap;
		if (start >= seconds) break;
		const end = Math.min(seconds, start + 1 + Math.floor(rng() * longest));
		episodes.push({ start, end });
		t = end;
	}
	return episodes;
}

/** How many intervals a stream is divided into. */
export const intervalCount = (s: Stream): number => Math.ceil(s.seconds / s.intervalSeconds);

const overlaps = (e: Episode, from: number, to: number) => e.start < to && e.end > from;
const occurringAt = (s: Stream, t: number) =>
	s.episodes.some((e) => e.start <= t && t < e.end);

/** The bounds of one interval, half-open like an episode. */
export function intervalBounds(s: Stream, i: number): [number, number] {
	const from = i * s.intervalSeconds;
	return [from, Math.min(s.seconds, from + s.intervalSeconds)];
}

/** Total time the behavior was occurring. */
export const trueSeconds = (s: Stream): number =>
	s.episodes.reduce((sum, e) => sum + (e.end - e.start), 0);

/** Occurred at any point in the interval. */
export function truePartial(s: Stream): boolean[] {
	return Array.from({ length: intervalCount(s) }, (_, i) => {
		const [from, to] = intervalBounds(s, i);
		return s.episodes.some((e) => overlaps(e, from, to));
	});
}

/**
 * Occurred throughout the interval.
 *
 * One episode has to cover the interval end to end. Two episodes that between them span
 * it do not count: the behavior stopped, which is exactly what this method is for.
 */
export function trueWhole(s: Stream): boolean[] {
	return Array.from({ length: intervalCount(s) }, (_, i) => {
		const [from, to] = intervalBounds(s, i);
		return s.episodes.some((e) => e.start <= from && e.end >= to);
	});
}

/**
 * Occurring at the moment the interval ends.
 *
 * The cue lands at the end of each interval rather than the start, which is the version
 * the app's own interval timer already cues, and the two conventions have to agree or a
 * reader who practises here will mis-score in a session.
 */
export function trueMomentary(s: Stream): boolean[] {
	return Array.from({ length: intervalCount(s) }, (_, i) =>
		occurringAt(s, intervalBounds(s, i)[1])
	);
}

const percentTrue = (marks: readonly boolean[]): number =>
	marks.length === 0 ? 0 : (marks.filter(Boolean).length / marks.length) * 100;

/** What each method reports about the same stream. The point of the whole exercise. */
export function comparison(s: Stream): { method: Method; percent: number }[] {
	return [
		{ method: 'duration', percent: (trueSeconds(s) / s.seconds) * 100 },
		{ method: 'partial-interval', percent: percentTrue(truePartial(s)) },
		{ method: 'whole-interval', percent: percentTrue(trueWhole(s)) },
		{ method: 'momentary-time-sampling', percent: percentTrue(trueMomentary(s)) }
	];
}

/** What the reader's hands produced during a run. */
export interface Record {
	method: Method;
	/** Frequency: one entry per tap. Only the count is used, but the times make a replay possible. */
	taps: readonly number[];
	/** Duration: the spans the control was held on. */
	spans: readonly Episode[];
	/** The sampling methods: one decision per interval, in order. */
	marks: readonly boolean[];
}

/**
 * The same session, cut short.
 *
 * A reader who stops after ninety seconds of a four-minute run has not measured the four
 * minutes, and scoring them against it would mark them down for everything they were never
 * shown. Cutting the stream instead makes every calculation downstream correct without any
 * of them knowing the run ended early.
 *
 * Rounded down to a whole interval, because a stream whose last interval is a fragment
 * makes whole interval and momentary sampling report on a period that never finished.
 */
export function clip(s: Stream, seconds: number): Stream {
	const end = Math.min(
		s.seconds,
		Math.max(s.intervalSeconds, Math.floor(seconds / s.intervalSeconds) * s.intervalSeconds)
	);
	return {
		...s,
		seconds: end,
		episodes: s.episodes
			.filter((e) => e.start < end)
			.map((e) => ({ start: e.start, end: Math.min(e.end, end) }))
	};
}

/** A reader's record cut to the same length, so nothing recorded past the end is scored. */
export function clipRecord(r: Record, clipped: Stream): Record {
	return {
		method: r.method,
		taps: r.taps.filter((t) => t < clipped.seconds),
		spans: r.spans
			.filter((e) => e.start < clipped.seconds)
			.map((e) => ({ start: e.start, end: Math.min(e.end, clipped.seconds) })),
		marks: r.marks.slice(0, intervalCount(clipped))
	};
}

export const emptyRecord = (method: Method): Record => ({
	method,
	taps: [],
	spans: [],
	marks: []
});

/**
 * Agreement between two totals: the smaller over the larger.
 *
 * Two observers who both recorded nothing agree completely, which the division does not
 * say on its own — `0/0` is `NaN`, and a rehearsal that reports NaN for a quiet session
 * teaches the reader that they broke it.
 */
export function totalAgreement(a: number, b: number): number {
	if (a === 0 && b === 0) return 100;
	return (Math.min(a, b) / Math.max(a, b)) * 100;
}

/**
 * Agreement interval by interval: the intervals scored the same way, out of all of them.
 *
 * Deliberately not a comparison of the two percentages. Two observers who each scored
 * six intervals out of twelve both report fifty per cent and may not have agreed on a
 * single interval, and reporting that as perfect agreement would be worse than reporting
 * nothing.
 */
export function intervalAgreement(a: readonly boolean[], b: readonly boolean[]): number {
	const n = Math.max(a.length, b.length);
	if (n === 0) return 100;
	let same = 0;
	for (let i = 0; i < n; i++) if ((a[i] ?? false) === (b[i] ?? false)) same += 1;
	return (same / n) * 100;
}

export interface Scored {
	method: Method;
	unit: Unit;
	/** What the reader's data says. */
	reported: number;
	/** What the method should have said about this stream. */
	truth: number;
	agreement: number;
	/** The agreement is over these many opportunities — taps, seconds, or intervals. */
	opportunities: number;
	/** Per-interval detail for the sampling methods, so a result can be read back. */
	marks: readonly boolean[];
	truthMarks: readonly boolean[];
	/** What every method makes of the same stream. */
	comparison: { method: Method; percent: number }[];
}

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;

export function truthFor(s: Stream, method: Method): boolean[] {
	switch (method) {
		case 'partial-interval':
			return truePartial(s);
		case 'whole-interval':
			return trueWhole(s);
		case 'momentary-time-sampling':
			return trueMomentary(s);
		default:
			return [];
	}
}

export function score(s: Stream, record: Record): Scored {
	const info = methodInfo(record.method);
	const base = {
		method: record.method,
		unit: info.unit,
		comparison: comparison(s)
	};

	if (record.method === 'frequency') {
		const reported = record.taps.length;
		const truth = s.episodes.length;
		return {
			...base,
			reported,
			truth,
			agreement: totalAgreement(reported, truth),
			opportunities: Math.max(reported, truth),
			marks: [],
			truthMarks: []
		};
	}

	if (record.method === 'duration') {
		/*
		 * Rounded to a tenth before it is compared. The reader's spans come from a wall
		 * clock and carry milliseconds nobody recorded on purpose; the truth is in whole
		 * seconds. Comparing raw would report 97.3% agreement for a perfect run.
		 */
		const reported = round(record.spans.reduce((sum, e) => sum + (e.end - e.start), 0));
		const truth = trueSeconds(s);
		return {
			...base,
			reported,
			truth,
			agreement: totalAgreement(reported, truth),
			opportunities: s.seconds,
			marks: [],
			truthMarks: []
		};
	}

	const truthMarks = truthFor(s, record.method);
	const marks = Array.from({ length: truthMarks.length }, (_, i) => record.marks[i] ?? false);
	return {
		...base,
		reported: round(percentTrue(marks)),
		truth: round(percentTrue(truthMarks)),
		agreement: intervalAgreement(marks, truthMarks),
		opportunities: truthMarks.length,
		marks,
		truthMarks
	};
}
