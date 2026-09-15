import { browser } from '$app/environment';
import {
	clearDecisions,
	getDecisions,
	putDecision,
	type ReviewableKind,
	type ReviewDecision
} from '$lib/db/index.js';
import { loadReviewItems, type ReviewItem } from '$lib/content/reviewable.js';

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

	get queue(): ReviewItem[] {
		return this.items.filter(
			(i) =>
				(this.kind === 'all' || i.kind === this.kind) &&
				(!this.hideDecided || !this.decisions[i.id])
		);
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
					.map((d) => ({ id: d.id, kind: d.kind, decision: d.decision, note: d.note }))
			},
			null,
			2
		);
	}
}

export const review = new Review();
