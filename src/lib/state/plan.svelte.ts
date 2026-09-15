import { browser } from '$app/environment';
import { getAllCards, recentAttempts } from '$lib/db/index.js';
import { outlineForCredential, termIndex } from '$lib/content/load.js';
import {
	actions,
	coverage,
	domainStats,
	type Action,
	type Coverage,
	type DomainStat
} from '$lib/study/plan.js';
import { filters } from './filters.svelte.js';

export type PlanStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * The study plan, assembled from what is already stored.
 *
 * Nothing new is recorded for this. Quiz attempts already carry per-area totals and the
 * scheduler already knows which terms have been seen; this reads both and decides what
 * is worth doing next. That also means it works offline and says nothing to anybody.
 */
class Plan {
	status = $state<PlanStatus>('idle');
	stats = $state<DomainStat[]>([]);
	next = $state<Action[]>([]);
	summary = $state<Coverage>({ measured: 0, total: 0, answered: 0, overall: null });
	dueCards = $state(0);
	simulations = $state(0);
	attempts = $state(0);

	/** The plan is per exam, so switching the shared filter reloads it. */
	get credential(): string {
		return filters.credential === 'all' ? 'RBT' : filters.credential;
	}

	async load(): Promise<void> {
		if (!browser) return;
		this.status = 'loading';
		try {
			const [cards, history] = await Promise.all([getAllCards(), recentAttempts(200)]);
			const credential = this.credential;
			const outline = outlineForCredential(credential);
			if (!outline) {
				this.status = 'ready';
				this.stats = [];
				this.next = [];
				return;
			}

			const now = Date.now();
			this.dueCards = cards.filter((c) => c.due <= now && c.state !== 0).length;
			// A card with any scheduling history counts as studied; a card that exists only
			// because it was drawn and skipped does not.
			const studied = new Set(cards.filter((c) => c.reps > 0).map((c) => c.id));

			const mine = history.filter((a) => a.credential === credential);
			this.attempts = mine.length;
			// A simulation is the only run that covers every area at once.
			this.simulations = mine.filter((a) => a.domain === 'all' && a.total >= 50).length;

			this.stats = domainStats(
				outline.domains.map((d) => ({
					letter: d.letter,
					name: d.name,
					examWeightPercent: d.examWeightPercent,
					examItems: d.examItems
				})),
				history,
				credential,
				termIndex,
				studied
			);
			this.summary = coverage(this.stats);
			this.next = actions(this.stats, {
				dueCards: this.dueCards,
				simulationsSat: this.simulations
			});
			this.status = 'ready';
		} catch {
			// Without storage there is no history to plan from, and saying so is better
			// than rendering an empty plan that looks like "nothing to do".
			this.status = 'unavailable';
		}
	}

	/** Point the shared filter at one area, so the deck and the quiz both follow. */
	focus(letter: string | null): void {
		filters.set({
			credential: this.credential as 'RBT' | 'BCBA' | 'BCaBA',
			domain: letter ?? 'all'
		});
	}
}

export const plan = new Plan();
