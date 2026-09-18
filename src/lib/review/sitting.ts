/**
 * A review sitting: a number of items somebody said they would read now.
 *
 * The launch set is a little over two hours of reading, and the reason none of it gets
 * read is not that it is hard — it is that two hours is not a thing anybody sits down and
 * does. Ten items is. This is the shape the app already gives a reader for a study
 * session and for a drill sitting, pointed at the one person who has to do the reviewing,
 * and it is the difference between a job that waits for a free evening and one that fits
 * in four bus rides.
 *
 * Everything here is derived from the decisions that were already being stored. A counter
 * would have to be incremented by every path that records a decision, and the first path
 * anybody forgot would report a sitting that did not happen — which on this page means
 * overstating how much of the corpus a human has actually read. That is the one number in
 * this app it would be worst to inflate.
 */
import { MINUTES_PER_ITEM, type ReviewTier } from '$lib/content/tier.js';

/** Sitting sizes offered. Small on purpose: the point is that it finishes. */
export const SITTING_SIZES = [5, 10, 20] as const;

/**
 * How long a sitting can be picked up again after it was started.
 *
 * A reload or an evicted tab mid-sitting should not lose the count, and a reviewer
 * working on a phone will hit both. Yesterday's sitting resuming silently is a different
 * thing: it would report a session that never happened, so anything older than an
 * afternoon is simply over.
 */
export const SITTING_EXPIRY_MS = 6 * 60 * 60 * 1000;

export interface SittingDecision {
	decision: 'approved' | 'needs-change';
	decidedAt: number;
	/** `sampled` marks a term carried by a draw rather than read. */
	method?: string;
}

export interface Sitting {
	target: number;
	startedAt: number;
}

export interface SittingTally {
	done: number;
	approved: number;
	flagged: number;
}

/**
 * Whether a decision counts towards the sitting that began at `startedAt`.
 *
 * Carried terms are excluded, and that exclusion is the load-bearing part. Carrying a
 * batch is what a reviewer does *instead* of reading it, so counting thirty carried terms
 * as thirty items reviewed would finish a sitting of ten without anybody having read
 * anything at all.
 */
export function countsAsRead(d: SittingDecision, startedAt: number): boolean {
	return startedAt > 0 && d.decidedAt >= startedAt && d.method !== 'sampled';
}

export function tally(decisions: readonly SittingDecision[], startedAt: number): SittingTally {
	const mine = decisions.filter((d) => countsAsRead(d, startedAt));
	return {
		done: mine.length,
		approved: mine.filter((d) => d.decision === 'approved').length,
		flagged: mine.filter((d) => d.decision === 'needs-change').length
	};
}

/** A sitting is finished once its target is met. Overshooting still counts as finished. */
export function isFinished(sitting: Sitting | null, done: number): boolean {
	return sitting !== null && done >= sitting.target;
}

/** How long ago a sitting began, in whole minutes. A fact about the clock, not a rate. */
export function minutesElapsed(sitting: Sitting | null, now: number): number {
	if (!sitting || sitting.startedAt <= 0) return 0;
	return Math.max(0, Math.floor((now - sitting.startedAt) / 60_000));
}

/**
 * Roughly what the next items would cost, in minutes.
 *
 * Measured over the tiers of the actual items about to be offered rather than from a
 * corpus average, because the tiers differ by four times and a filtered queue is usually
 * one tier deep. The question it answers is "have I got time for this right now", which
 * is the question that decides whether any reviewing happens at all.
 */
export function estimateMinutes(tiers: readonly ReviewTier[]): number {
	return Math.ceil(tiers.reduce((sum, t) => sum + MINUTES_PER_ITEM[t], 0));
}

/** The stored form of a sitting. */
export function serialise(sitting: Sitting): string {
	return JSON.stringify({ target: sitting.target, startedAt: sitting.startedAt });
}

/**
 * A stored sitting, if it is still one.
 *
 * Returns null for anything unparseable, malformed, or older than the expiry — a stored
 * value is not necessarily one this app wrote, and a reviewer who left a tab open
 * overnight should come back to no sitting rather than to a stale one.
 */
export function restore(raw: string | null, now: number): Sitting | null {
	if (!raw) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) return null;
	const { target, startedAt } = parsed as { target?: unknown; startedAt?: unknown };
	if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) return null;
	if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt <= 0) {
		return null;
	}
	// A clock that moved backwards leaves a sitting in the future; treat it as over
	// rather than as one with a negative age that can never expire.
	if (startedAt > now) return null;
	if (now - startedAt > SITTING_EXPIRY_MS) return null;
	return { target, startedAt };
}
