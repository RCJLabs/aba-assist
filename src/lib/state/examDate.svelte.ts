/**
 * The date the reader sits the exam, if they have told us one.
 *
 * Kept in `localStorage` rather than IndexedDB on purpose: it is one short string, the
 * home page wants it before the database has opened, and a countdown that appears a
 * moment after the rest of the page has settled is worse than one that is simply there.
 * It is also per-credential — somebody working towards the assistant exam has not told us
 * anything about the analyst one.
 *
 * Nothing is inferred from it. It drives a number of days and the sentence beside it,
 * and it is never combined with practice history into a readiness figure.
 */
const PREFIX = 'aba-assist:exam-date:';

/** A calendar day, not an instant. Same reasoning as the supervision log's dates. */
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

class ExamDates {
	/** Credential → YYYY-MM-DD. Empty until `hydrate()` has read storage. */
	private dates = $state<Record<string, string>>({});
	private hydrated = false;

	/** Safe to call more than once; the page and the layout both do. */
	hydrate(): void {
		if (this.hydrated) return;
		this.hydrated = true;
		const found: Record<string, string> = {};
		try {
			for (const credential of ['RBT', 'BCaBA', 'BCBA']) {
				const value = localStorage.getItem(PREFIX + credential);
				if (value && ISO_DAY.test(value)) found[credential] = value;
			}
		} catch {
			// Storage blocked. No date, no countdown, everything else still works.
		}
		this.dates = found;
	}

	get(credential: string): string | null {
		return this.dates[credential] ?? null;
	}

	set(credential: string, iso: string): void {
		if (!ISO_DAY.test(iso)) return;
		this.dates = { ...this.dates, [credential]: iso };
		try {
			localStorage.setItem(PREFIX + credential, iso);
		} catch {
			// Kept for this visit only.
		}
	}

	clear(credential: string): void {
		const next = { ...this.dates };
		delete next[credential];
		this.dates = next;
		try {
			localStorage.removeItem(PREFIX + credential);
		} catch {
			// Nothing was stored.
		}
	}
}

export const examDates = new ExamDates();
