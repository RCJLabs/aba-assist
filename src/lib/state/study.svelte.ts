import { browser } from '$app/environment';
import type { Term } from '@aba/content-schema';
import { loadTerm, termIndex } from '$lib/content/load.js';
import { getAllCards, putCards, recordReview } from '$lib/db/index.js';
import { planReinforcement, termsToReinforce } from '$lib/study/reinforce.js';
import { storage } from './storage.svelte.js';
import {
	CARD_STATE,
	gradeCard,
	isDue,
	newCard,
	previewIntervals,
	type CardGrade,
	type CardRecord
} from '$lib/db/scheduler.js';
import { filters } from './filters.svelte.js';

// Re-exported so pages never import from $lib/db directly (see the lint rule).
export { GRADES } from '$lib/db/scheduler.js';
export type { CardGrade } from '$lib/db/scheduler.js';

export type StudyStatus = 'idle' | 'loading' | 'ready' | 'session' | 'done' | 'unavailable';

const NEW_KEY = 'aba-assist:study:new-per-session';

/**
 * Flashcards.
 *
 * The deck is whatever the shared exam/domain/category filter selects, intersected with
 * the terms that opt into flashcards. There is no separate deck model to maintain: the
 * scheduler stores one card per term, and the filter decides which of those cards are in
 * play today. Scheduling state survives filter changes, so a card learned under the RBT
 * filter is still learned when the reader switches to "everything".
 *
 * Tap-first: the four grade buttons are the interface. No swipe is required anywhere.
 */
class Study {
	status = $state<StudyStatus>('idle');
	stats = $state({ due: 0, fresh: 0, learned: 0, inDeck: 0 });
	newPerSession = $state(10);

	queue = $state<string[]>([]);
	index = $state(0);
	term = $state<Term | null>(null);
	revealed = $state(false);
	session = $state({ reviewed: 0, again: 0 });
	/**
	 * The grade given to each card, in the order they were graded.
	 *
	 * The counts above answer "how much did I do"; this answers "how did it go", which is
	 * what a progress bar and a breakdown need. Kept as a list rather than four counters
	 * because the bar draws one segment per card in order, and a card regraded after an
	 * "Again" is a second entry rather than an edit to the first.
	 */
	graded = $state<CardGrade[]>([]);
	intervals = $state<Record<CardGrade, string> | null>(null);

	#cards = new Map<string, CardRecord>();
	#persistRequested = false;

	hydrate(): void {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(NEW_KEY);
			const n = raw ? Number(raw) : NaN;
			if ([5, 10, 20, 40].includes(n)) this.newPerSession = n;
		} catch {
			// Defaults are fine.
		}
	}

	setNewPerSession(n: number): void {
		this.newPerSession = n;
		try {
			localStorage.setItem(NEW_KEY, String(n));
		} catch {
			// Storage unavailable.
		}
		void this.refresh();
	}

	/**
	 * Drop the card cache so the next refresh re-reads storage.
	 *
	 * The cache is loaded once and kept, because `refresh()` runs on every filter change.
	 * Anything that writes cards from outside this class — a quiz run making what it
	 * caught out due — has to say so, or the deck goes on showing the counts it had
	 * before.
	 */
	invalidateCards(): void {
		this.#cards.clear();
	}

	/**
	 * Make the terms behind a set of misses due again. Returns how many moved.
	 *
	 * Lives here rather than in each caller because the deck is this class's to own, and
	 * because two callers that each write cards and then remember to invalidate are one
	 * caller away from a deck showing stale counts. `groups` is one entry per missed
	 * item — the quiz passes a question's term refs, the pair drill passes both sides of
	 * the confusion — and a term missed twice is ranked ahead of one missed once.
	 */
	async reinforce(groups: string[][]): Promise<number> {
		if (!browser || groups.length === 0) return 0;
		const flashcardTerms = new Set(termIndex.filter((t) => t.f).map((t) => t.i));
		const ids = termsToReinforce(
			groups.map((termRefs) => ({ termRefs })),
			flashcardTerms
		);
		if (ids.length === 0) return 0;

		const cards = new Map((await getAllCards()).map((c) => [c.id, c]));
		const plan = planReinforcement(ids, cards, Date.now());
		await putCards(plan.writes);
		this.invalidateCards();
		return plan.created + plan.pulled;
	}

	/** The term ids the current filter puts in play. */
	get deck(): string[] {
		return termIndex.filter((t) => t.f && filters.matches(t)).map((t) => t.i);
	}

	/** Recompute the counts for the current filter. Cheap; called whenever the filter changes. */
	async refresh(): Promise<void> {
		if (!browser) return;
		if (this.status === 'idle') this.status = 'loading';
		try {
			if (this.#cards.size === 0) {
				for (const c of await getAllCards()) this.#cards.set(c.id, c);
			}
		} catch {
			this.status = 'unavailable';
			return;
		}
		const now = Date.now();
		const deck = this.deck;
		let due = 0;
		let fresh = 0;
		let learned = 0;
		for (const id of deck) {
			const c = this.#cards.get(id);
			if (!c) fresh++;
			else {
				if (isDue(c, now)) due++;
				if (c.state === CARD_STATE.REVIEW) learned++;
			}
		}
		this.stats = {
			due,
			fresh: Math.min(fresh, this.newPerSession),
			learned,
			inDeck: deck.length
		};
		if (this.status !== 'session' && this.status !== 'done') this.status = 'ready';
	}

	async start(): Promise<void> {
		await this.refresh();
		const now = Date.now();
		const deck = this.deck;
		const due = deck
			.filter((id) => {
				const c = this.#cards.get(id);
				return c && isDue(c, now);
			})
			.sort((a, b) => this.#cards.get(a)!.due - this.#cards.get(b)!.due);
		const fresh = deck.filter((id) => !this.#cards.has(id)).slice(0, this.newPerSession);
		this.queue = [...due, ...fresh];
		this.index = 0;
		this.session = { reviewed: 0, again: 0 };
		this.graded = [];
		if (this.queue.length === 0) {
			this.status = 'ready';
			return;
		}
		this.status = 'session';
		await this.#loadCurrent();
	}

	get currentId(): string | null {
		return this.queue[this.index] ?? null;
	}

	get progress(): { done: number; total: number } {
		return { done: Math.min(this.index, this.queue.length), total: this.queue.length };
	}

	async #loadCurrent(): Promise<void> {
		const id = this.currentId;
		this.revealed = false;
		this.intervals = null;
		if (!id) {
			this.term = null;
			this.status = 'done';
			await this.refresh();
			return;
		}
		this.term = (await loadTerm(id)) ?? null;
		const card = this.#cards.get(id) ?? newCard(id);
		this.intervals = previewIntervals(card);
	}

	reveal(): void {
		this.revealed = true;
	}

	async grade(g: CardGrade): Promise<void> {
		const id = this.currentId;
		if (!id || !this.revealed) return;
		const before = this.#cards.get(id) ?? newCard(id);
		const { card, review } = gradeCard(before, g);
		try {
			await recordReview(card, review);
			/*
			 * Ask to keep this data, now that there is some.
			 *
			 * Here rather than on arrival: some browsers prompt, and a permission request
			 * from a page somebody has not used yet is the kind that gets denied for good.
			 * A first graded card is the earliest moment there is anything to lose — and
			 * the reader who studies once a week is exactly who iOS evicts.
			 */
			storage.hasData = true;
			void storage.requestPersist();
		} catch {
			// Storage failed: keep the session going in memory so the reader is not
			// interrupted; the counts will simply not persist.
		}
		this.#cards.set(id, card);
		this.session = {
			reviewed: this.session.reviewed + 1,
			again: this.session.again + (g === 1 ? 1 : 0)
		};
		this.graded = [...this.graded, g];
		// "Again" puts the card back at the end of this session so it is seen once more
		// before the reader stops, which is what makes a short session actually teach.
		if (g === 1) this.queue = [...this.queue, id];
		this.index += 1;
		this.#requestPersistence();
		await this.#loadCurrent();
	}

	end(): void {
		this.status = 'done';
		void this.refresh();
	}

	reset(): void {
		this.status = 'ready';
		this.queue = [];
		this.index = 0;
		this.term = null;
		this.revealed = false;
		void this.refresh();
	}

	/**
	 * Ask the browser not to evict the database. Safari evicts storage for sites that go
	 * unused for a week, which for a spaced-repetition app means exactly the person who
	 * studies weekly loses everything. Asked once, after the first real review.
	 */
	#requestPersistence(): void {
		if (this.#persistRequested || !browser) return;
		this.#persistRequested = true;
		void navigator.storage?.persist?.().catch(() => undefined);
	}
}

export const study = new Study();
