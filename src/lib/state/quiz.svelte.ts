import { browser } from '$app/environment';
import type { QuizQuestion } from '@aba/content-schema';
import { loadQuestions, outlineForCredential } from '$lib/content/load.js';
import { putAttempt, recentAttempts } from '$lib/db/index.js';
import { study } from './study.svelte.js';
import {
	crossedWarning,
	examFormat,
	planSimulation,
	secondsLeft,
	type SimulationPlan
} from '$lib/quiz/simulation.js';
import { planRetry, RETRY_DOMAIN, type RetryPlan } from '$lib/quiz/retry.js';

/**
 * `simulation` is `test` with a clock and the exam's own shape: every domain, weighted,
 * as many questions as the bank can supply, at the real seconds per question.
 */
export type QuizMode = 'practice' | 'test' | 'simulation';

/**
 * Where a session's questions come from.
 *
 * Deliberately separate from the mode. The mode decides when the reader is told how they
 * did; this decides which questions they are asked. Folding the retry queue into the
 * domain picker was the obvious alternative and it was wrong: "Behavior Reduction" and
 * "the ones I keep getting wrong" are not two items on the same list, and a run drawn
 * from past errors has to be distinguishable afterwards from a fresh draw — see what
 * `finish` records.
 */
export type QuizSource = 'bank' | 'missed';

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
	source = $state<QuizSource>('bank');

	/**
	 * The retry queue, once storage has been read. Null until then, and on a device that
	 * has no storage at all — which the page reads as "no offer", not as "nothing missed".
	 */
	retry = $state<RetryPlan | null>(null);

	status = $state<QuizStatus>('setup');
	items = $state<SessionItem[]>([]);
	index = $state(0);
	selected = $state<string[]>([]);
	startedAt = 0;
	results = $state<QuizResults | null>(null);
	available = $state(0);

	/**
	 * Whether the finished run has reached storage.
	 *
	 * The results render without waiting for this on purpose — a reader whose storage is
	 * unavailable should still see how they did. But the results screen offers a link to
	 * the study plan, and the plan reads this run back, so something has to say when the
	 * write has settled rather than leaving it to luck.
	 */
	saved = $state<'idle' | 'pending' | 'saved' | 'unavailable'>('idle');
	/**
	 * How many terms this run made due in the flashcard deck.
	 *
	 * Reported rather than done silently: the run has changed what the reader's next
	 * study session will contain, and a queue that grew without explanation is the kind
	 * of thing people turn off.
	 */
	reinforced = $state(0);

	/** Set only in simulation mode. */
	plan = $state<SimulationPlan | null>(null);
	deadlineAt = $state(0);
	now = $state(0);
	/** True when the clock, not the reader, ended the run. */
	ranOutOfTime = $state(false);
	/** Questions the reader marked to come back to, as the real exam allows. */
	flagged = $state<Record<string, boolean>>({});
	private ticker: ReturnType<typeof setInterval> | null = null;
	private lastRemaining = Infinity;
	/** Set by the page, so a threshold can be spoken without this module importing the UI. */
	onWarning: ((secondsRemaining: number) => void) | null = null;

	get current(): SessionItem | null {
		return this.items[this.index] ?? null;
	}

	get progress(): { n: number; total: number } {
		return { n: Math.min(this.index + 1, this.items.length), total: this.items.length };
	}

	get secondsRemaining(): number {
		return this.deadlineAt === 0 ? 0 : secondsLeft(this.deadlineAt, this.now);
	}

	get answeredCount(): number {
		return this.items.filter((it) => it.correct !== null).length;
	}

	get flaggedCount(): number {
		return Object.values(this.flagged).filter(Boolean).length;
	}

	/**
	 * Right so far, and the current run of them.
	 *
	 * Only meaningful where the reader has already been told each verdict. In the modes
	 * that withhold feedback this is the answer key, so the page must not show it — see
	 * the progress bar, which has the same rule.
	 */
	get runningScore(): { correct: number; answered: number; streak: number } {
		let correct = 0;
		let answered = 0;
		let streak = 0;
		for (const it of this.items) {
			if (it.correct === null) continue;
			answered += 1;
			if (it.correct) {
				correct += 1;
				streak += 1;
			} else {
				streak = 0;
			}
		}
		return { correct, answered, streak };
	}

	/** What a simulation would look like right now, given what is in the bank. */
	async previewPlan(): Promise<SimulationPlan | null> {
		if (!browser) return null;
		const outline = outlineForCredential(this.credential);
		const format = outline ? examFormat(outline) : null;
		if (!format) return null;
		const bank = await loadQuestions(this.credential);
		return planSimulation(format, bank.length);
	}

	configure(next: {
		credential?: string;
		domain?: string;
		count?: number;
		mode?: QuizMode;
		source?: QuizSource;
	}): void {
		if (next.credential !== undefined && next.credential !== this.credential) {
			this.credential = next.credential;
			this.domain = 'all';
			// The queue is per exam and so was the offer, so both go back to the bank until
			// the new exam's history has been read.
			this.source = 'bank';
			this.retry = null;
			void this.loadRetry();
		}
		if (next.domain !== undefined) this.domain = next.domain;
		if (next.count !== undefined) this.count = next.count;
		if (next.mode !== undefined) this.mode = next.mode;
		if (next.source !== undefined) this.source = next.source;
		void this.countAvailable();
	}

	/**
	 * Read the retry queue back out of storage.
	 *
	 * Called when the setup screen opens and again after a run finishes, because a run is
	 * the only thing that changes the answer. Failure is silent and leaves the queue null:
	 * a reader whose browser has blocked storage has no history to retry from, and an
	 * error message about IndexedDB would be answering a question they did not ask.
	 */
	async loadRetry(): Promise<void> {
		if (!browser) return;
		try {
			const [history, bank] = await Promise.all([
				recentAttempts(200),
				loadQuestions(this.credential)
			]);
			this.retry = planRetry(history, this.credential, new Set(bank.map((q) => q.id)));
		} catch {
			this.retry = null;
		}
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
		this.stopClock();
		this.ranOutOfTime = false;
		this.flagged = {};

		if (this.source === 'missed') {
			await this.startRetry();
			return;
		}

		if (this.mode === 'simulation') {
			// The real paper covers every domain and does not let you pick a length, so
			// neither does this.
			this.domain = 'all';
			this.plan = await this.previewPlan();
			if (!this.plan) {
				this.status = 'empty';
				return;
			}
			this.count = this.plan.questions;
		} else {
			this.plan = null;
		}

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
		if (this.plan) this.startClock(this.plan.minutes);
	}

	/**
	 * A session drawn from the questions this reader has got wrong and not put right.
	 *
	 * No sampling and no shuffling of the set itself: the queue is already in the order
	 * that says what is worth sitting first, and re-shuffling it would throw that away for
	 * the sake of a variety this run is not for. The options inside each question are
	 * shuffled as always, because remembering that the answer was the third one is not
	 * knowing the answer.
	 *
	 * There is no clock here even if the reader had picked the simulation. A simulation is
	 * the whole paper, weighted, at the exam's pace; a run drawn from ten questions you
	 * already know you got wrong is not that, and dressing it up as one would make the
	 * number at the end mean nothing.
	 */
	private async startRetry(): Promise<void> {
		this.plan = null;
		if (this.mode === 'simulation') this.mode = 'practice';

		await this.loadRetry();
		const bank = await loadQuestions(this.credential);
		const byId = new Map(bank.map((q) => [q.id, q]));
		const chosen = (this.retry?.ids ?? [])
			.map((id) => byId.get(id))
			.filter((q): q is QuizQuestion => q !== undefined)
			.slice(0, Math.max(1, this.count));

		if (chosen.length === 0) {
			this.status = 'empty';
			return;
		}

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

	/*
	 * The clock is a deadline, not a countdown that gets decremented.
	 *
	 * Everything derives from `Date.now()` against a fixed end time, so backgrounding the
	 * tab, sleeping the phone or throttling the interval cannot buy anybody extra time —
	 * which is the property that makes this worth calling a simulation at all. The
	 * interval only exists to re-render.
	 */
	private startClock(minutes: number): void {
		this.now = Date.now();
		this.deadlineAt = this.now + minutes * 60_000;
		this.lastRemaining = minutes * 60;
		this.ticker = setInterval(() => this.tick(), 1000);
	}

	private tick(): void {
		this.now = Date.now();
		const remaining = this.secondsRemaining;
		const threshold = crossedWarning(this.lastRemaining, remaining);
		this.lastRemaining = remaining;
		if (threshold !== null) this.onWarning?.(threshold);
		if (remaining <= 0) {
			this.ranOutOfTime = true;
			void this.finish();
		}
	}

	private stopClock(): void {
		if (this.ticker !== null) clearInterval(this.ticker);
		this.ticker = null;
		this.deadlineAt = 0;
		this.lastRemaining = Infinity;
	}

	toggleFlag(): void {
		const item = this.current;
		if (!item) return;
		this.flagged = { ...this.flagged, [item.q.id]: !this.flagged[item.q.id] };
	}

	/** Jump straight to a question, for the review pass a real exam allows. */
	goTo(index: number): void {
		if (index < 0 || index >= this.items.length) return;
		this.index = index;
		this.selected = this.items[index]?.selected ?? [];
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

	/** Leave it unanswered and move on, which on the real paper is a wrong answer. */
	skip(): void {
		if (this.status !== 'question') return;
		void this.next();
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
		if (this.status === 'done') return;
		this.stopClock();
		this.saved = 'pending';
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
		const missed = this.items.filter((it) => !it.correct);
		// Strictly true, not merely "not missed": a question left unanswered has `null`
		// here, and counting it as right would clear it out of the retry queue on the
		// strength of never having been attempted.
		const right = this.items.filter((it) => it.correct === true);

		/*
		 * Started before the results are rendered, not after.
		 *
		 * Writing afterwards left a window where navigating straight off the results screen
		 * tore the document down with the transaction still open, and the run was lost
		 * entirely — the reader saw their score and the app never recorded it. Starting the
		 * write first narrows that window to as little as this code can make it, and the
		 * results still do not wait on it.
		 */
		/*
		 * What the run caught out goes into the flashcard queue.
		 *
		 * Best-effort and deliberately separate from the attempt write: a failure here
		 * must not make the run itself look unrecorded, because the run is the thing the
		 * plan reads. Storage being unavailable simply means no terms were added, and the
		 * results screen then says nothing rather than claiming something.
		 */
		const reinforcing = this.#reinforce(missed).then(
			(n) => {
				this.reinforced = n;
			},
			() => {
				this.reinforced = 0;
			}
		);

		const saving = putAttempt({
			id: `${this.startedAt}-${Math.random().toString(36).slice(2, 8)}`,
			credential: this.credential,
			// A run drawn from past errors is recorded as such, so that everything reading
			// this history back can tell it from a fresh draw.
			domain: this.source === 'missed' ? RETRY_DOMAIN : this.domain,
			startedAt: this.startedAt,
			finishedAt: Date.now(),
			total: this.items.length,
			correct,
			perDomain: Object.fromEntries(
				Object.entries(perDomain).map(([k, v]) => [k, { total: v.total, correct: v.correct }])
			),
			missed: missed.map((m) => m.q.id),
			right: right.map((r) => r.q.id),
			// What the run examined, not what it got right. Coverage is a record of
			// having looked, and a wrong answer is still a look.
			tasks: [...new Set(this.items.map((it) => it.q.taskRef.code))].sort()
		}).then(
			() => {
				this.saved = 'saved';
			},
			() => {
				// Storage unavailable; the results are still on screen.
				this.saved = 'unavailable';
			}
		);

		this.results = { total: this.items.length, correct, perDomain, missed };
		this.status = 'done';

		await Promise.all([saving, reinforcing]);
		// After the write, never before: the queue this run just changed is the one the
		// results screen offers, and reading it early would show the figure from before.
		await this.loadRetry();
	}

	/**
	 * Make the terms behind the missed questions due for review. Returns how many.
	 *
	 * The writing and the deck invalidation belong to `study`, which owns the cards; this
	 * only decides what counts as missed.
	 */
	async #reinforce(missed: { q: QuizQuestion }[]): Promise<number> {
		return study.reinforce(missed.map((m) => m.q.termRefs));
	}

	reset(): void {
		this.stopClock();
		this.status = 'setup';
		this.source = 'bank';
		this.items = [];
		this.index = 0;
		this.selected = [];
		this.results = null;
		this.saved = 'idle';
		this.reinforced = 0;
		this.plan = null;
		this.flagged = {};
		this.ranOutOfTime = false;
	}
}

export const quiz = new Quiz();
