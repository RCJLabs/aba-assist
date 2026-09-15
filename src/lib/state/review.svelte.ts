import { browser } from '$app/environment';
import {
	clearDecisions,
	getDecisions,
	putDecision,
	type ReviewableKind,
	type ReviewDecision
} from '$lib/db/index.js';
import { loadReviewItems, type ReviewItem } from '$lib/content/reviewable.js';
import { contentVersion } from '$lib/content/load.js';
import {
	batchFor,
	MINUTES_PER_ITEM,
	samplesFor,
	tierFor,
	type ReviewTier,
	type Sample
} from '$lib/content/tier.js';

export type ReviewStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

const REVIEWER_KEY = 'aba-assist:reviewer';

/**
 * The content-review queue.
 *
 * This is the one workflow in the app that exists for the person maintaining it rather
 * than for a reader. Everything in `content/` is born unreviewed, the release channel
 * refuses to ship anything that is not approved, and the schema refuses an approval
 * signed by the same person who authored it — so approvals have to come from a human,
 * by hand, and this is the cheapest honest way to collect them.
 *
 * Decisions live on the device until they are exported. They are not a substitute for
 * the content files: nothing changes for a reader until an export is applied in git.
 */
class Review {
	status = $state<ReviewStatus>('idle');
	items = $state<ReviewItem[]>([]);
	decisions = $state<Record<string, ReviewDecision>>({});
	kind = $state<ReviewableKind | 'all'>('all');
	tier = $state<ReviewTier | 'all'>('A');
	/**
	 * Fraction of each glossary batch drawn for reading.
	 *
	 * The reviewer sets it, deliberately: how much of a corpus one person has to read
	 * before the rest can ship on its strength is a judgement about how much they trust
	 * the author and the validator, and it is not the author's to make.
	 */
	sampleRate = $state(0.25);
	/** Skip items already decided in this pass. */
	hideDecided = $state(true);
	index = $state(0);
	reviewer = $state('');
	note = $state('');

	async load(): Promise<void> {
		if (!browser || this.status === 'loading' || this.status === 'ready') return;
		this.status = 'loading';
		try {
			const raw = localStorage.getItem(REVIEWER_KEY);
			if (raw) this.reviewer = raw;
		} catch {
			// Storage blocked; the reviewer can retype their id.
		}
		this.items = await loadReviewItems();
		try {
			const existing = await getDecisions();
			this.decisions = Object.fromEntries(existing.map((d) => [d.id, d]));
			this.status = 'ready';
		} catch {
			// Decisions cannot be stored, so the queue would silently lose work.
			this.status = 'unavailable';
		}
	}

	setReviewer(value: string): void {
		this.reviewer = value;
		try {
			localStorage.setItem(REVIEWER_KEY, value);
		} catch {
			// Storage blocked.
		}
	}

	/** A reviewer id has to be a slug, because it is written into the content files. */
	get reviewerValid(): boolean {
		return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(this.reviewer.trim());
	}

	/** Tier and batch, computed once per load rather than per render. */
	#meta = $derived(
		new Map(this.items.map((i) => [i.id, { ...tierFor(i), batch: batchFor(i) }] as const))
	);

	metaFor(item: ReviewItem) {
		return this.#meta.get(item.id) ?? { tier: 'C' as ReviewTier, reason: '', batch: null };
	}

	get queue(): ReviewItem[] {
		const inSample = this.samples;
		return this.items.filter((i) => {
			const meta = this.metaFor(i);
			if (this.tier !== 'all' && meta.tier !== this.tier) return false;
			if (this.kind !== 'all' && i.kind !== this.kind) return false;
			if (this.hideDecided && this.decisions[i.id]) return false;
			/*
			 * In tier C only the drawn items are queued. Queueing all of them would make
			 * the sample decorative: a reviewer who reads everything anyway has not
			 * sampled, and one who reads the first few has drawn a sample by convenience
			 * rather than at random, which is the thing sampling exists to avoid.
			 */
			if (meta.tier === 'C' && meta.batch) {
				return inSample.get(meta.batch)?.drawn.includes(i.id) ?? false;
			}
			return true;
		});
	}

	/** One draw per glossary batch, stable for a given build and sample rate. */
	get samples(): Map<string, Sample> {
		return samplesFor(
			this.items.map((i) => ({ id: i.id, batch: this.metaFor(i).batch })),
			this.sampleRate,
			contentVersion.contentVersion
		);
	}

	/**
	 * Whether a batch's whole sample has been read and approved.
	 *
	 * One flagged item in the draw stops the batch: the sample said something and what it
	 * said was that this batch needs reading. Carrying the rest anyway would make the
	 * draw a formality.
	 */
	batchState(batch: string): 'incomplete' | 'flagged' | 'ready' | 'carried' {
		const sample = this.samples.get(batch);
		if (!sample) return 'incomplete';
		const decided = sample.drawn.map((id) => this.decisions[id]);
		if (decided.some((d) => d?.decision === 'needs-change')) return 'flagged';
		if (decided.some((d) => !d)) return 'incomplete';
		return sample.carried.every((id) => this.decisions[id]) ? 'carried' : 'ready';
	}

	/** Record the untested remainder of a batch as approved, on the strength of the draw. */
	async carryBatch(batch: string): Promise<void> {
		if (this.batchState(batch) !== 'ready') return;
		const sample = this.samples.get(batch);
		if (!sample) return;
		for (const id of sample.carried) {
			if (this.decisions[id]) continue;
			const record: ReviewDecision = {
				id,
				kind: 'term',
				decision: 'approved',
				note: '',
				method: 'sampled',
				sampledWith: sample.label,
				decidedAt: Date.now()
			};
			try {
				await putDecision(record);
			} catch {
				this.status = 'unavailable';
				return;
			}
			this.decisions = { ...this.decisions, [id]: record };
		}
	}

	/** Items left in a tier, and a rough number of minutes to get through them. */
	tierLoad(tier: ReviewTier): { total: number; left: number; minutes: number } {
		let total = 0;
		let left = 0;
		const samples = this.samples;
		for (const i of this.items) {
			const meta = this.metaFor(i);
			if (meta.tier !== tier) continue;
			// A sampled batch costs only its draw; the rest is carried without reading.
			const toRead =
				meta.tier === 'C' && meta.batch
					? (samples.get(meta.batch)?.drawn.includes(i.id) ?? false)
					: true;
			total++;
			if (toRead && !this.decisions[i.id]) left++;
		}
		return { total, left, minutes: Math.ceil(left * MINUTES_PER_ITEM[tier]) };
	}

	setTier(tier: ReviewTier | 'all'): void {
		this.tier = tier;
		this.index = 0;
		this.note = '';
	}

	get current(): ReviewItem | null {
		const q = this.queue;
		if (q.length === 0) return null;
		return q[Math.min(this.index, q.length - 1)] ?? null;
	}

	get counts(): { total: number; decided: number; approved: number; flagged: number } {
		const values = Object.values(this.decisions);
		return {
			total: this.items.length,
			decided: values.length,
			approved: values.filter((d) => d.decision === 'approved').length,
			flagged: values.filter((d) => d.decision === 'needs-change').length
		};
	}

	countsFor(kind: ReviewableKind): { total: number; decided: number } {
		const all = this.items.filter((i) => i.kind === kind);
		return {
			total: all.length,
			decided: all.filter((i) => this.decisions[i.id]).length
		};
	}

	setKind(kind: ReviewableKind | 'all'): void {
		this.kind = kind;
		this.index = 0;
		this.note = '';
	}

	async decide(decision: 'approved' | 'needs-change'): Promise<void> {
		const item = this.current;
		if (!item) return;
		if (decision === 'needs-change' && this.note.trim().length === 0) return;
		const record: ReviewDecision = {
			id: item.id,
			kind: item.kind,
			decision,
			note: decision === 'needs-change' ? this.note.trim() : '',
			// Only the glossary records a method, and a decision made here was read.
			...(item.kind === 'term' && decision === 'approved' ? { method: 'read' as const } : {}),
			decidedAt: Date.now()
		};
		try {
			await putDecision(record);
		} catch {
			this.status = 'unavailable';
			return;
		}
		// Reassign rather than mutate: `$state` tracks the object identity here.
		this.decisions = { ...this.decisions, [item.id]: record };
		this.note = '';
		// With decided items hidden the queue shrinks under us, so the same index is
		// already the next item. Otherwise step forward.
		if (!this.hideDecided) this.index = Math.min(this.index + 1, this.queue.length - 1);
	}

	skip(): void {
		this.note = '';
		this.index = Math.min(this.index + 1, Math.max(this.queue.length - 1, 0));
	}

	back(): void {
		this.note = '';
		this.index = Math.max(this.index - 1, 0);
	}

	async reset(): Promise<void> {
		await clearDecisions();
		this.decisions = {};
		this.index = 0;
		this.note = '';
	}

	/** The payload `apply-review` consumes. */
	exportPayload(): string {
		return JSON.stringify(
			{
				reviewer: this.reviewer.trim(),
				exportedAt: new Date().toISOString(),
				decisions: Object.values(this.decisions)
					.slice()
					.sort((a, b) => a.id.localeCompare(b.id))
					.map((d) => ({
						id: d.id,
						kind: d.kind,
						decision: d.decision,
						note: d.note,
						...(d.method ? { method: d.method } : {}),
						...(d.sampledWith ? { sampledWith: d.sampledWith } : {})
					}))
			},
			null,
			2
		);
	}
}

export const review = new Review();
