/**
 * When a fact is due to be checked against its source again.
 *
 * The thing this app sells is being right about 2026, and the failure mode it was built
 * against is the one killing the incumbents: content keyed to an edition that has since
 * been replaced, still on sale, with nothing on the page admitting it. Every one of those
 * apps was accurate the day it shipped.
 *
 * `Review.nextReviewDue` has been in the schema from the start and was never once set by a
 * content file or read by any code — a staleness mechanism that existed only as a field
 * name, which is worse than none, because it makes the gap look handled. This is the
 * machinery behind it.
 *
 * **Only some content can go stale, and saying which is the whole design.** A definition
 * written from Michael 1982 does not rot; the paper is not going to be reissued with
 * different contents. What rots is everything restated from a document a certifying body
 * maintains and republishes — task codes, exam weights, cycle lengths, unit counts,
 * effective dates. Requiring a due date on all 259 glossary terms would bury the handful
 * of files that genuinely need one, so the requirement lands exactly on those.
 */

/**
 * Content kinds whose facts are restated from a maintained document, and therefore expire.
 *
 * Deliberately not a judgement made per file. A new credential or outline has to be
 * covered by this the moment it is added, and the way to make that automatic is to attach
 * the requirement to the kind rather than to the author remembering.
 */
export const VOLATILE_KINDS = ['credential', 'outline', 'ethics-code', 'competency'] as const;
export type VolatileKind = (typeof VOLATILE_KINDS)[number];

export function isVolatileKind(kind: string): kind is VolatileKind {
	return (VOLATILE_KINDS as readonly string[]).includes(kind);
}

/**
 * How far ahead a re-check is worth flagging before it falls due.
 *
 * Long enough to be acted on rather than merely noticed. Checking a handbook against its
 * source is not a five-minute job, and a warning that appears the day something expires
 * gives nobody a chance to do anything except ship it stale.
 */
export const DUE_SOON_DAYS = 60;

export type Staleness = 'fresh' | 'due-soon' | 'overdue' | 'unset';

const DAY = 86_400_000;

/**
 * Whole calendar days until a date, negative once it has passed.
 *
 * Both ends are floored to UTC midnight, which is not a detail. Comparing a dated
 * midnight against a timestamp carrying a time of day makes "due tomorrow" read as zero
 * days for most of today, and a figure that says "0 days" about something not yet due is
 * the kind of number a reader stops believing. Days here means the difference between two
 * dates, which is what anybody reading it means too.
 */
export function daysUntil(due: string, now: number): number {
	const at = Date.parse(`${due}T00:00:00Z`);
	if (Number.isNaN(at)) return Number.NaN;
	const today = Math.floor(now / DAY) * DAY;
	return Math.round((at - today) / DAY);
}

/**
 * Where a due date stands.
 *
 * `unset` is reported rather than treated as fresh or as overdue. A missing date is a
 * different failure from a passed one — nobody decided how long this fact was good for —
 * and the build refuses it outright rather than guessing a horizon on the author's behalf.
 */
export function stalenessOf(due: string | null, now: number): Staleness {
	if (due === null) return 'unset';
	const days = daysUntil(due, now);
	if (Number.isNaN(days)) return 'unset';
	if (days < 0) return 'overdue';
	return days <= DUE_SOON_DAYS ? 'due-soon' : 'fresh';
}

export interface DatedItem {
	id: string;
	kind: string;
	label: string;
	/** What it was checked against, e.g. a handbook version. Shown with the date. */
	against: string | null;
	nextReviewDue: string | null;
}

export interface StalenessRow extends DatedItem {
	state: Staleness;
	/** Negative once overdue. NaN where there is no usable date. */
	days: number;
}

export interface StalenessReport {
	rows: StalenessRow[];
	overdue: StalenessRow[];
	dueSoon: StalenessRow[];
	unset: StalenessRow[];
	/** The soonest date anything falls due, or null when nothing is dated. */
	nextDue: string | null;
}

/**
 * Every dated fact, soonest first.
 *
 * Ordered by when it expires rather than by kind, because the only question anybody asks
 * of this list is "what do I have to look at next".
 */
export function reviewSchedule(items: readonly DatedItem[], now: number): StalenessReport {
	const rows = items
		.map((item): StalenessRow => {
			const state = stalenessOf(item.nextReviewDue, now);
			return {
				...item,
				state,
				days: item.nextReviewDue === null ? Number.NaN : daysUntil(item.nextReviewDue, now)
			};
		})
		.sort((a, b) => {
			// Undated last: there is no date to sort it by, and it is a different problem.
			if (Number.isNaN(a.days) !== Number.isNaN(b.days)) return Number.isNaN(a.days) ? 1 : -1;
			return a.days - b.days || a.id.localeCompare(b.id);
		});

	const dated = rows.filter((r) => !Number.isNaN(r.days));
	return {
		rows,
		overdue: rows.filter((r) => r.state === 'overdue'),
		dueSoon: rows.filter((r) => r.state === 'due-soon'),
		unset: rows.filter((r) => r.state === 'unset'),
		nextDue: dated.find((r) => r.days >= 0)?.nextReviewDue ?? null
	};
}

/** A row, said the way a person would say it. */
export function describeDue(row: StalenessRow): string {
	if (row.state === 'unset') return `${row.label}: no re-check date set`;
	const n = Math.abs(row.days);
	const days = n === 1 ? '1 day' : `${n} days`;
	if (row.state === 'overdue')
		return `${row.label}: ${days} overdue (was due ${row.nextReviewDue})`;
	return `${row.label}: due in ${days} (${row.nextReviewDue})`;
}
