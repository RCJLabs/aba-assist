/**
 * How it has actually been going, as opposed to what to do next.
 *
 * `plan.ts` already reads the same history prescriptively — where you stand by area, and
 * what to do about it. This is the descriptive half, and it exists because two questions
 * had no answer anywhere in the app. "Am I getting better?" needs the attempts read as a
 * series rather than as a pile. "Am I remembering any of this?" needs the review log,
 * which has been written on every flashcard grade since the deck was built and read by
 * nothing but the backup file.
 *
 * The posture is inherited from `plan.ts` deliberately: a rate is only stated where there
 * is enough behind it to mean something, the raw counts are always carried alongside so a
 * number can be audited rather than trusted, and nothing here is converted into a claim
 * about a real exam.
 */
import type { CardRecord, ReviewRecord } from '$lib/db/scheduler.js';
import type { DrillAttempt } from '$lib/db/index.js';

/** Enough sittings that a line between them is a trend rather than two points and hope. */
export const TREND_MINIMUM = 5;

/**
 * Enough graded reviews to state a retention rate.
 *
 * Twenty is a judgement, not a derivation, and it is worth saying so. At twenty, one
 * changed answer moves the figure five points, which is coarse but not misleading; below
 * it, a single lapse swings the number far enough that a reader would draw a conclusion
 * from noise. The fraction is shown next to the percentage at every size for exactly this
 * reason — "17 of 20" cannot be over-read the way "85%" can.
 */
export const RETENTION_MINIMUM = 20;

export interface AttemptLike {
	id: string;
	credential: string;
	domain: string;
	finishedAt: number;
	total: number;
	correct: number;
}

export interface TrendPoint {
	id: string;
	at: number;
	credential: string;
	domain: string;
	total: number;
	correct: number;
	/** 0–100. Safe to state per attempt: it is a fact about that sitting, not an estimate. */
	percent: number;
}

/**
 * Attempts as a chronological series.
 *
 * Ordered by when they finished and plotted by position rather than by date, which is a
 * choice worth naming: sittings are irregular events, and spacing them along a real time
 * axis would draw a wide empty gap for a fortnight off and invite it to be read as a
 * decline. Position says "these are your sittings, in order", which is what the reader
 * means by "am I improving".
 */
export function attemptTrend(attempts: readonly AttemptLike[]): TrendPoint[] {
	return [...attempts]
		.filter((a) => a.total > 0)
		.sort((x, y) => x.finishedAt - y.finishedAt)
		.map((a) => ({
			id: a.id,
			at: a.finishedAt,
			credential: a.credential,
			domain: a.domain,
			total: a.total,
			correct: a.correct,
			percent: Math.round((a.correct / a.total) * 100)
		}));
}

/**
 * Whether the recent run is above or below the earlier one, in points.
 *
 * Halves rather than first-versus-last: two individual sittings differ by the questions
 * they happened to draw as much as by anything the reader did, and an arrow drawn from
 * one to the other is mostly noise. Null below the trend minimum, where there is no
 * honest answer.
 */
export function trendShift(points: readonly TrendPoint[]): number | null {
	if (points.length < TREND_MINIMUM) return null;
	const half = Math.floor(points.length / 2);
	const mean = (xs: readonly TrendPoint[]) =>
		xs.reduce((sum, p) => sum + p.percent, 0) / xs.length;
	return Math.round(mean(points.slice(-half)) - mean(points.slice(0, half)));
}

export interface DayBucket {
	/** Local calendar day, `YYYY-MM-DD`. */
	day: string;
	reviews: number;
}

/** Local midnight for a timestamp — the day boundary a reader actually experiences. */
const dayKey = (at: number): string => {
	const d = new Date(at);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Reviews per day, one bucket per calendar day, including the empty ones.
 *
 * The gaps are the point. A spaced-repetition deck only works if it is opened; a chart
 * that silently omitted the days with nothing in them would draw an unbroken run of
 * activity for somebody who studied four times in a month.
 */
export function reviewsPerDay(
	log: readonly ReviewRecord[],
	now: number,
	days = 30
): DayBucket[] {
	const counts = new Map<string, number>();
	for (const r of log) {
		const key = dayKey(r.reviewedAt);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	const out: DayBucket[] = [];
	const cursor = new Date(now);
	cursor.setHours(0, 0, 0, 0);
	cursor.setDate(cursor.getDate() - (days - 1));
	for (let i = 0; i < days; i++) {
		const day = dayKey(cursor.getTime());
		out.push({ day, reviews: counts.get(day) ?? 0 });
		cursor.setDate(cursor.getDate() + 1);
	}
	return out;
}

export interface Retention {
	/** Reviews of cards that were already in the review state — the only ones that test recall. */
	tested: number;
	/** Of those, the ones not answered "Again". */
	kept: number;
	/** 0–100, or null below `RETENTION_MINIMUM`. */
	percent: number | null;
	/** How many more graded reviews before a rate will be stated. */
	needed: number;
}

/**
 * How much is actually being remembered.
 *
 * Only reviews taken in the review state count. A card being learned for the first time is
 * not a test of recall — grading it "Again" three times on the way in is the algorithm
 * working, and folding those into the figure would make a diligent new reader look like a
 * failing one. "Hard" counts as remembered: the reader produced the answer.
 */
export function retention(log: readonly ReviewRecord[]): Retention {
	const tested = log.filter((r) => r.state === 2);
	const kept = tested.filter((r) => r.grade >= 2).length;
	return {
		tested: tested.length,
		kept,
		percent:
			tested.length >= RETENTION_MINIMUM ? Math.round((kept / tested.length) * 100) : null,
		needed: Math.max(0, RETENTION_MINIMUM - tested.length)
	};
}

export interface Streak {
	/** Consecutive days up to and including today — or yesterday, if today is untouched. */
	current: number;
	longest: number;
	/** Days in the window with at least one review. */
	activeDays: number;
}

/**
 * Consecutive days with at least one review.
 *
 * Today not being studied yet does not break the streak — it is not over until a whole day
 * has passed with nothing in it, and a counter that reset at midnight would punish
 * somebody for looking at the app before breakfast.
 */
export function streak(log: readonly ReviewRecord[], now: number): Streak {
	const days = new Set(log.map((r) => dayKey(r.reviewedAt)));
	if (days.size === 0) return { current: 0, longest: 0, activeDays: 0 };

	const sorted = [...days].sort();
	let longest = 1;
	let run = 1;
	for (let i = 1; i < sorted.length; i++) {
		const prev = new Date(`${sorted[i - 1]}T00:00:00`);
		prev.setDate(prev.getDate() + 1);
		run = dayKey(prev.getTime()) === sorted[i] ? run + 1 : 1;
		if (run > longest) longest = run;
	}

	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	let current = 0;
	/*
	 * Walk back from today; one untouched day at the very start is tolerated, not more.
	 * Bounded by the number of days that have anything in them at all, so a logic error
	 * here can only ever be wrong — never a page that never finishes painting.
	 */
	for (let i = 0; i <= days.size; i++) {
		const probe = new Date(today);
		probe.setDate(probe.getDate() - i);
		if (days.has(dayKey(probe.getTime()))) current += 1;
		else if (i > 0 || current > 0) break;
	}

	return { current, longest, activeDays: days.size };
}

export interface DeckState {
	fresh: number;
	learning: number;
	review: number;
	total: number;
}

/** Where the deck sits: untouched, being learned, or on a real interval. */
export function deckState(cards: readonly CardRecord[]): DeckState {
	const fresh = cards.filter((c) => c.state === 0).length;
	// 1 learning and 3 relearning are the same thing to a reader: not on an interval yet.
	const learning = cards.filter((c) => c.state === 1 || c.state === 3).length;
	const review = cards.filter((c) => c.state === 2).length;
	return { fresh, learning, review, total: cards.length };
}

/**
 * Enough sightings of one pair to call it a pattern rather than a bad morning.
 *
 * Two, and low on purpose. Unlike an accuracy rate, this is not an estimate of anything —
 * it is a count of times the reader picked the wrong one of two names, and the page does
 * not convert it into a percentage. Getting the same pair wrong twice is a fact worth
 * putting in front of somebody; it just must not be dressed up as a measurement.
 */
export const CONFUSION_MINIMUM = 2;

export interface DrillSummary {
	sittings: number;
	answered: number;
	correct: number;
	/** 0–100, or null with nothing answered. */
	percent: number | null;
	lastAt: number | null;
}

export function drillSummary(attempts: readonly DrillAttempt[]): DrillSummary {
	const answered = attempts.reduce((n, a) => n + a.total, 0);
	const correct = attempts.reduce((n, a) => n + a.correct, 0);
	return {
		sittings: attempts.length,
		answered,
		correct,
		percent: answered > 0 ? Math.round((correct / answered) * 100) : null,
		lastAt: attempts.reduce<number | null>(
			(latest, a) => (latest === null || a.finishedAt > latest ? a.finishedAt : latest),
			null
		)
	};
}

export interface Confusion {
	/** The two term ids, sorted — the same order the stored key uses. */
	pair: [string, string];
	times: number;
}

/**
 * The pairs that keep catching the reader out, most-missed first.
 *
 * This is the reason the drill store exists. A drill score says how a sitting went and is
 * forgotten by the next one; "you have mixed these two up four times" names something the
 * reader can go and fix, and the two glossary entries are one tap away.
 *
 * Ties are broken alphabetically so the list is stable between renders — a list that
 * reshuffles on every visit reads as noise even when the numbers have not moved.
 */
export function confusions(
	attempts: readonly DrillAttempt[],
	minimum = CONFUSION_MINIMUM
): Confusion[] {
	const counts = new Map<string, number>();
	for (const a of attempts) {
		for (const key of a.missedPairs) counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return [...counts.entries()]
		.filter(([, times]) => times >= minimum)
		.map(([key, times]) => {
			const [a, b] = key.split('|');
			return { pair: [a!, b!] as [string, string], times };
		})
		.sort((x, y) => y.times - x.times || x.pair[0].localeCompare(y.pair[0]));
}
