import { browser } from '$app/environment';
import type { QuizQuestion } from '@aba/content-schema';
import { loadQuestions, outlineForCredential } from '$lib/content/load.js';
import { putAttempt } from '$lib/db/index.js';

export type QuizMode = 'practice' | 'test';
export type QuizStatus = 'setup' | 'loading' | 'question' | 'feedback' | 'done' | 'empty';

export interface SessionItem {
	q: QuizQuestion;
	/** Option ids in presentation order. Shuffled once per session, then fixed. */
	order: string[];
	selected: string[];
	correct: boolean | null;
}

export interface QuizResults {
	total: number;
	correct: number;
	perDomain: Record<string, { name: string; total: number; correct: number }>;
	missed: SessionItem[];
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j]!, a[i]!];
	}
	return a;
}

/**
 * Practice questions.
 *
 * "Test" mode withholds feedback until the end; "practice" mode shows the rationale for
 * every option after each answer, which is the pedagogically useful part and the part
 * the existing apps get wrong. Either way every option's rationale is shown eventually.
 *
 * Sampling across "all domains" follows the exam's published weights, so a mixed session
 * has roughly the shape of the real exam rather than being dominated by whichever domain
 * has the most questions written.
 */
class Quiz {
	credential = $state<string>('RBT');
	domain = $state<string>('all');
	count = $state<number>(10);
	mode = $state<QuizMode>('practice');

	status = $state<QuizStatus>('setup');
	items = $state<SessionItem[]>([]);
	index = $state(0);
	selected = $state<string[]>([]);
	startedAt = 0;
	results = $state<QuizResults | null>(null);
	available = $state(0);

	get current(): SessionItem | null {
		return this.items[this.index] ?? null;
	}

	get progress(): { n: number; total: number } {
		return { n: Math.min(this.index + 1, this.items.length), total: this.items.length };
	}

	configure(next: {
		credential?: string;
		domain?: string;
		count?: number;
		mode?: QuizMode;
	}): void {
		if (next.credential !== undefined && next.credential !== this.credential) {
			this.credential = next.credential;
			this.domain = 'all';
		}
		if (next.domain !== undefined) this.domain = next.domain;
		if (next.count !== undefined) this.count = next.count;
		if (next.mode !== undefined) this.mode = next.mode;
		void this.countAvailable();
	}

	async countAvailable(): Promise<void> {
		if (!browser) return;
		const bank = await loadQuestions(this.credential);
		this.available = this.pool(bank).length;
	}

	pool(bank: QuizQuestion[]): QuizQuestion[] {
		if (this.domain === 'all') return bank;
		return bank.filter((q) => q.taskRef.code.charAt(0) === this.domain);
	}

	async start(): Promise<void> {
		this.status = 'loading';
		const bank = await loadQuestions(this.credential);
		const pool = this.pool(bank);
		if (pool.length === 0) {
			this.status = 'empty';
			return;
		}
		const chosen = this.sample(pool, Math.min(this.count, pool.length));
		this.items = chosen.map((q) => ({
			q,
			order: shuffle(q.options.map((o) => o.id)),
			selected: [],
			correct: null
		}));
		this.index = 0;
		this.selected = [];
		this.results = null;
		this.startedAt = Date.now();
		this.status = 'question';
	}

	/** Weighted by the outline's domain weights when drawing from every domain. */
	sample(pool: QuizQuestion[], n: number): QuizQuestion[] {
		if (this.domain !== 'all') return shuffle(pool).slice(0, n);

		const outline = outlineForCredential(this.credential);
		// Plain objects rather than Maps: these are scratch values inside one call, not
		// reactive state, and the lint rule that prefers SvelteMap cannot tell the difference.
		const byDomain: Record<string, QuizQuestion[]> = {};
		for (const q of shuffle(pool)) {
			const letter = q.taskRef.code.charAt(0);
			(byDomain[letter] ??= []).push(q);
		}
		const letters = Object.keys(byDomain);
		const weight = (l: string) =>
			outline?.domains.find((d) => d.letter === l)?.examWeightPercent ?? 100 / letters.length;

		// Ideal allocation by weight, then fill any shortfall (a domain with too few
		// questions) round-robin from the domains that still have some.
		const totalWeight = letters.reduce((s, l) => s + weight(l), 0);
		const take: Record<string, number> = {};
		let allocated = 0;
		for (const l of letters) {
			const ideal = Math.floor((n * weight(l)) / totalWeight);
			const t = Math.min(ideal, byDomain[l]!.length);
			take[l] = t;
			allocated += t;
		}
		let guard = 0;
		while (allocated < n && guard++ < 1000) {
			let progressed = false;
			for (const l of letters) {
				if (allocated >= n) break;
				const t = take[l]!;
				if (t < byDomain[l]!.length) {
					take[l] = t + 1;
					allocated++;
					progressed = true;
				}
			}
			if (!progressed) break;
		}
		const out: QuizQuestion[] = [];
		for (const l of letters) out.push(...byDomain[l]!.slice(0, take[l]!));
		return shuffle(out);
	}

	toggle(optionId: string): void {
		const item = this.current;
		if (!item || this.status !== 'question') return;
		if (item.q.type === 'multi-select') {
			this.selected = this.selected.includes(optionId)
				? this.selected.filter((x) => x !== optionId)
				: [...this.selected, optionId];
		} else {
			this.selected = [optionId];
		}
	}

	submit(): void {
		const item = this.current;
		if (!item || this.selected.length === 0) return;
		const correctIds = item.q.options
			.filter((o) => o.isCorrect)
			.map((o) => o.id)
			.sort();
		const picked = [...this.selected].sort();
		const correct =
			correctIds.length === picked.length && correctIds.every((id, i) => id === picked[i]);
		this.items[this.index] = { ...item, selected: picked, correct };
		if (this.mode === 'practice') {
			this.status = 'feedback';
		} else {
			void this.next();
		}
	}

	async next(): Promise<void> {
		this.selected = [];
		if (this.index + 1 >= this.items.length) {
			await this.finish();
			return;
		}
		this.index += 1;
		this.status = 'question';
	}

	async finish(): Promise<void> {
		const outline = outlineForCredential(this.credential);
		const perDomain: QuizResults['perDomain'] = {};
		let correct = 0;
		for (const it of this.items) {
			const letter = it.q.taskRef.code.charAt(0);
			const name =
				outline?.domains.find((d) => d.letter === letter)?.name ?? `Domain ${letter}`;
			const row = perDomain[letter] ?? { name, total: 0, correct: 0 };
			row.total += 1;
			if (it.correct) {
				row.correct += 1;
				correct += 1;
			}
			perDomain[letter] = row;
		}
		this.results = {
			total: this.items.length,
			correct,
			perDomain,
			missed: this.items.filter((it) => !it.correct)
		};
		this.status = 'done';

		try {
			await putAttempt({
				id: `${this.startedAt}-${Math.random().toString(36).slice(2, 8)}`,
				credential: this.credential,
				domain: this.domain,
				startedAt: this.startedAt,
				finishedAt: Date.now(),
				total: this.items.length,
				correct,
				perDomain: Object.fromEntries(
					Object.entries(perDomain).map(([k, v]) => [
						k,
						{ total: v.total, correct: v.correct }
					])
				),
				missed: this.results.missed.map((m) => m.q.id)
			});
		} catch {
			// Storage unavailable; the results are still on screen.
		}
	}

	reset(): void {
		this.status = 'setup';
		this.items = [];
		this.index = 0;
		this.selected = [];
		this.results = null;
	}
}

export const quiz = new Quiz();
