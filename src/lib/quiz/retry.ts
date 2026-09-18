/**
 * What is still outstanding: the questions this reader has got wrong and not since put
 * right.
 *
 * Every finished run has recorded the ids it caught the reader out on since the quiz was
 * built, and nothing has ever read them back. What the app did instead was schedule the
 * *terms* behind a missed question into the flashcard deck — useful, and not the same
 * thing. Knowing what a discriminative stimulus is does not mean you would now pick the
 * right option out of four, because most of what a multiple-choice question tests is
 * telling one plausible answer from another. The only way to find out is to sit the
 * question again.
 *
 * Two decisions carry this module.
 *
 * **The most recent encounter is the one that stands.** A question missed in March and
 * answered correctly in April is not outstanding, and one answered correctly in April and
 * missed again in June is outstanding again. Anything else turns the queue into a list
 * that only grows, and a queue that never shrinks stops being opened.
 *
 * **The count of misses is cumulative, and deliberately not reset by a correct answer.**
 * A question that has caught somebody out three times is a weak spot even if they have
 * also got it right twice, and it is worth putting in front of them before one they have
 * missed once. The ordering says "this keeps catching you out", which is a different
 * claim from "you got this wrong most recently", and it is the more useful one.
 */

/**
 * The domain a run drawn from past errors records itself under.
 *
 * Lives here rather than with the quiz state because three modules need it and only one
 * of them may import the other two: the study plan and the progress page both have to
 * recognise such a run to keep it out of an estimate it would bias, and both are pure.
 */
export const RETRY_DOMAIN = 'missed';

export interface AttemptLike {
	credential: string;
	finishedAt: number;
	/** Question ids answered incorrectly, or not answered at all. */
	missed: readonly string[];
	/**
	 * Question ids answered correctly.
	 *
	 * Absent on runs recorded before the field existed. Those runs can only ever put a
	 * question into the queue, never take one out — which is the honest reading of a run
	 * that did not record what it got right.
	 */
	right?: readonly string[];
}

export interface OutstandingQuestion {
	id: string;
	/** How many times this question has ever been missed, across every sitting. */
	misses: number;
	/** When it was first missed, which is how long it has been an open question. */
	firstMissedAt: number;
	lastMissedAt: number;
}

/**
 * Questions still outstanding for one exam, strongest candidate first.
 *
 * Ordering: most-missed first, then longest outstanding, then by id so two questions with
 * the same history come out in the same order on every render and the count a reader was
 * shown matches the session they get.
 */
export function outstanding(
	attempts: readonly AttemptLike[],
	credential: string
): OutstandingQuestion[] {
	/*
	 * Oldest first, because the walk is chronological and the caller hands these over
	 * newest-first. Ties on the finish time break on nothing in particular — two runs
	 * cannot finish in the same millisecond in practice, and if they did, either order is
	 * as defensible as the other.
	 */
	const inOrder = attempts
		.filter((a) => a.credential === credential)
		.slice()
		.sort((a, b) => a.finishedAt - b.finishedAt);

	const seen = new Map<string, OutstandingQuestion & { open: boolean }>();
	for (const attempt of inOrder) {
		for (const id of attempt.missed) {
			const row = seen.get(id);
			if (row) {
				row.misses += 1;
				row.lastMissedAt = attempt.finishedAt;
				row.open = true;
			} else {
				seen.set(id, {
					id,
					misses: 1,
					firstMissedAt: attempt.finishedAt,
					lastMissedAt: attempt.finishedAt,
					open: true
				});
			}
		}
		for (const id of attempt.right ?? []) {
			const row = seen.get(id);
			// A question never missed needs no record: it has nothing to clear.
			if (row) row.open = false;
		}
	}

	return [...seen.values()]
		.filter((row) => row.open)
		.map(({ id, misses, firstMissedAt, lastMissedAt }) => ({
			id,
			misses,
			firstMissedAt,
			lastMissedAt
		}))
		.sort(
			(a, b) =>
				b.misses - a.misses || a.firstMissedAt - b.firstMissedAt || a.id.localeCompare(b.id)
		);
}

export interface RetryPlan {
	/** Ids to sit again, strongest candidate first, all present in this build. */
	ids: string[];
	/** Outstanding questions in total, before anything was dropped. */
	total: number;
	/**
	 * Outstanding questions this build no longer has.
	 *
	 * Questions are rebuilt from source on every build and the release channel withholds
	 * the ones that have not been reviewed, so an id recorded months ago can simply stop
	 * existing. Counted rather than ignored: a reader who was told they had nine to retry
	 * and got seven deserves the sentence that explains the other two, and the alternative
	 * — silently showing a smaller number — is how an app teaches people not to trust its
	 * figures.
	 */
	gone: number;
}

/**
 * The retry queue for one exam, against the questions this build actually has.
 *
 * `bankIds` is the set of question ids available now. Nothing is invented to fill a gap
 * and nothing is repeated to pad the length: a short queue is a short queue.
 */
export function planRetry(
	attempts: readonly AttemptLike[],
	credential: string,
	bankIds: ReadonlySet<string>
): RetryPlan {
	const open = outstanding(attempts, credential);
	const ids = open.filter((q) => bankIds.has(q.id)).map((q) => q.id);
	return { ids, total: open.length, gone: open.length - ids.length };
}
