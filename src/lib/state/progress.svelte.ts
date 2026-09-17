import { browser } from '$app/environment';
import {
	getAllCards,
	getReviewLog,
	recentAttempts,
	recentDrillAttempts
} from '$lib/db/index.js';
import {
	attemptTrend,
	deckState,
	retention,
	confusions,
	drillSummary,
	reviewsPerDay,
	streak,
	trendShift,
	type Confusion,
	type DayBucket,
	type DeckState,
	type DrillSummary,
	type Retention,
	type Streak,
	type TrendPoint
} from '$lib/study/progress.js';

export type ProgressStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/** How far back the day chart looks. A month is the shortest window a habit shows up in. */
export const WINDOW_DAYS = 30;

/**
 * Everything the progress page states, read once from what is already stored.
 *
 * Like the study plan, this records nothing new to produce itself — the quiz attempts and
 * the review log have both been written all along. Also like the plan, it computes on load
 * rather than reactively: these are summaries of a fixed history, and recomputing them on
 * every keystroke elsewhere in the app would be work nobody asked for.
 */
class Progress {
	status = $state<ProgressStatus>('idle');

	/*
	 * `$state.raw` rather than `$state`: these are read-only arrays handed straight to
	 * rendering, and the deep proxy Svelte would otherwise wrap them in costs real time on
	 * a low-end phone for reactivity nothing here uses.
	 */
	trend = $state.raw<TrendPoint[]>([]);
	days = $state.raw<DayBucket[]>([]);
	shift = $state<number | null>(null);
	recall = $state<Retention>({ tested: 0, kept: 0, percent: null, needed: 20 });
	run = $state<Streak>({ current: 0, longest: 0, activeDays: 0 });
	deck = $state<DeckState>({ fresh: 0, learning: 0, review: 0, total: 0 });
	drills = $state<DrillSummary>({
		sittings: 0,
		answered: 0,
		correct: 0,
		percent: null,
		lastAt: null
	});
	confused = $state.raw<Confusion[]>([]);

	/** Whether anything has been done at all, which decides between a page and an invitation. */
	get empty(): boolean {
		return (
			this.trend.length === 0 &&
			this.deck.total === 0 &&
			this.recall.tested === 0 &&
			this.drills.sittings === 0
		);
	}

	async load(now = Date.now()): Promise<void> {
		if (!browser) return;
		this.status = 'loading';
		try {
			/*
			 * The whole log, not the last thirty days: the streak and the retention rate are
			 * both about the entire history, and a window would quietly cap a run at thirty
			 * and report a retention figure that changed meaning as the month rolled.
			 */
			const [cards, attempts, log, drills] = await Promise.all([
				getAllCards(),
				recentAttempts(200),
				getReviewLog(),
				recentDrillAttempts(200)
			]);

			this.trend = attemptTrend(attempts);
			this.shift = trendShift(this.trend);
			this.days = reviewsPerDay(log, now, WINDOW_DAYS);
			this.recall = retention(log);
			this.run = streak(log, now);
			this.deck = deckState(cards);
			this.drills = drillSummary(drills);
			this.confused = confusions(drills);
			this.status = 'ready';
		} catch {
			// Blocked storage or a private window. The page says so rather than showing zeros,
			// which would read as "you have done nothing" to somebody who has done plenty.
			this.status = 'unavailable';
		}
	}
}

export const progress = new Progress();
