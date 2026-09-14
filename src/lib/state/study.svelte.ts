import { browser } from '$app/environment';
import type { Term } from '@aba/content-schema';
import { loadTerm, termIndex } from '$lib/content/load.js';
import { getAllCards, recordReview } from '$lib/db/index.js';
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
		} catch {
			// Storage failed: keep the session going in memory so the reader is not
			// interrupted; the counts will simply not persist.
		}
		this.#cards.set(id, card);
		this.session = {
			reviewed: this.session.reviewed + 1,
			again: this.session.again + (g === 1 ? 1 : 0)
		};
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
