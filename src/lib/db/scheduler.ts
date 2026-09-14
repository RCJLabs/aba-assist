/**
 * Spaced-repetition scheduling, wrapped.
 *
 * Plain TypeScript with no Svelte and no IndexedDB: given a card and a grade it returns
 * the next card, and nothing else. Keeping the algorithm behind one small surface means
 * the rest of the app never touches ts-fsrs types directly, so a future algorithm change
 * (or a ts-fsrs major version) is one file's problem.
 *
 * Dates cross this boundary as epoch milliseconds, never Date objects: the records are
 * stored in IndexedDB and shown in the UI, and a number is unambiguous in both places.
 */
import {
	createEmptyCard,
	fsrs,
	generatorParameters,
	Rating,
	State,
	type Card,
	type Grade
} from 'ts-fsrs';

export type CardGrade = 1 | 2 | 3 | 4;

/** The scheduling state of one flashcard, keyed by the term it drills. */
export interface CardRecord {
	id: string;
	due: number;
	stability: number;
	difficulty: number;
	elapsedDays: number;
	scheduledDays: number;
	learningSteps: number;
	reps: number;
	lapses: number;
	/** 0 new, 1 learning, 2 review, 3 relearning. */
	state: number;
	lastReview: number | null;
	createdAt: number;
}

export interface ReviewRecord {
	cardId: string;
	grade: CardGrade;
	reviewedAt: number;
	scheduledDays: number;
	state: number;
}

export const GRADES: { grade: CardGrade; label: string; key: string }[] = [
	{ grade: 1, label: 'Again', key: '1' },
	{ grade: 2, label: 'Hard', key: '2' },
	{ grade: 3, label: 'Good', key: '3' },
	{ grade: 4, label: 'Easy', key: '4' }
];

/*
 * Fuzz is on: slightly randomised intervals stop every card learned on the same day
 * from coming due on the same day forever. The maximum interval is a year — a reference
 * app for a workforce with high turnover has no use for cards scheduled into the next
 * decade.
 */
const scheduler = fsrs(generatorParameters({ enable_fuzz: true, maximum_interval: 365 }));

function toCard(r: CardRecord): Card {
	return {
		due: new Date(r.due),
		stability: r.stability,
		difficulty: r.difficulty,
		elapsed_days: r.elapsedDays,
		scheduled_days: r.scheduledDays,
		learning_steps: r.learningSteps,
		reps: r.reps,
		lapses: r.lapses,
		state: r.state as State,
		last_review: r.lastReview === null ? undefined : new Date(r.lastReview)
	};
}

function fromCard(id: string, c: Card, createdAt: number): CardRecord {
	return {
		id,
		due: c.due.getTime(),
		stability: c.stability,
		difficulty: c.difficulty,
		elapsedDays: c.elapsed_days,
		scheduledDays: c.scheduled_days,
		learningSteps: c.learning_steps,
		reps: c.reps,
		lapses: c.lapses,
		state: c.state,
		lastReview: c.last_review ? c.last_review.getTime() : null,
		createdAt
	};
}

/** A brand-new card, due now. */
export function newCard(id: string, now = Date.now()): CardRecord {
	return fromCard(id, createEmptyCard(new Date(now)), now);
}

/** Apply a grade and return the rescheduled card plus the log entry to store. */
export function gradeCard(
	record: CardRecord,
	grade: CardGrade,
	now = Date.now()
): { card: CardRecord; review: ReviewRecord } {
	const result = scheduler.next(toCard(record), new Date(now), grade as Grade);
	return {
		card: fromCard(record.id, result.card, record.createdAt),
		review: {
			cardId: record.id,
			grade,
			reviewedAt: now,
			scheduledDays: result.card.scheduled_days,
			state: result.card.state
		}
	};
}

/**
 * What each grade would schedule, for the buttons: "Again <1m · Hard 6m · Good 10m ·
 * Easy 4d". Showing the consequence of each choice is what makes four buttons
 * understandable to someone who has never used spaced repetition.
 */
export function previewIntervals(
	record: CardRecord,
	now = Date.now()
): Record<CardGrade, string> {
	const card = toCard(record);
	const at = new Date(now);
	const out = {} as Record<CardGrade, string>;
	for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const) {
		const next = scheduler.next(card, at, g);
		out[g as CardGrade] = formatInterval(next.card.due.getTime() - now);
	}
	return out;
}

export function formatInterval(ms: number): string {
	const minutes = Math.round(ms / 60_000);
	if (minutes < 1) return '<1m';
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months}mo`;
	return `${Math.round(days / 365)}y`;
}

export function isDue(record: CardRecord, now = Date.now()): boolean {
	return record.due <= now;
}

export const CARD_STATE = {
	NEW: State.New,
	LEARNING: State.Learning,
	REVIEW: State.Review,
	RELEARNING: State.Relearning
} as const;
