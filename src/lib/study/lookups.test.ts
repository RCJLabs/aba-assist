import { describe, expect, it } from 'vitest';
import {
	lookupId,
	noteLookup,
	prunable,
	recentLookups,
	repeatedLookups,
	SITTING_GAP_MS,
	type Lookup
} from './lookups.js';

const T0 = Date.parse('2026-09-20T09:00:00Z');
const MIN = 60_000;

const row = (over: Partial<Lookup> = {}): Lookup => ({
	id: 'term:tact',
	kind: 'term',
	slug: 'tact',
	title: 'Tact',
	count: 1,
	firstAt: T0,
	countedAt: T0,
	lastAt: T0,
	...over
});

describe('recording a visit', () => {
	it('starts a row at one', () => {
		const r = noteLookup(undefined, 'term', 'tact', 'Tact', T0);
		expect(r).toEqual(row());
	});

	it('keys on kind as well as slug', () => {
		/*
		 * A term and a situation may share an id — "elopement" is plausibly both — and
		 * merging them would produce a row that links to one and counts the other.
		 */
		expect(lookupId('term', 'elopement')).not.toBe(lookupId('scenario', 'elopement'));
	});

	it('does not count a second visit inside the same sitting', () => {
		/*
		 * Reading a term, following its "commonly confused with" link and pressing back is
		 * one act of looking something up. Counting it twice would make the most
		 * cross-linked terms look like the hardest ones.
		 */
		const r = noteLookup(row(), 'term', 'tact', 'Tact', T0 + 5 * MIN);
		expect(r.count).toBe(1);
	});

	it('still moves the last-seen time for a visit that did not count', () => {
		// The recency list is about when you last had it open, not when it last counted.
		const r = noteLookup(row(), 'term', 'tact', 'Tact', T0 + 5 * MIN);
		expect(r.lastAt).toBe(T0 + 5 * MIN);
		expect(r.countedAt).toBe(T0);
	});

	it('counts again once the gap has passed', () => {
		const r = noteLookup(row(), 'term', 'tact', 'Tact', T0 + SITTING_GAP_MS);
		expect(r.count).toBe(2);
		expect(r.countedAt).toBe(T0 + SITTING_GAP_MS);
	});

	it('cannot have its window pushed forward indefinitely by re-reading', () => {
		/*
		 * The reason `countedAt` exists. Deduping against `lastAt` would mean somebody who
		 * opens a page every twenty minutes all afternoon records a single lookup, because
		 * each visit would move the window ahead of itself. Here it keeps counting.
		 *
		 * Seven rather than the eight half-hour blocks four hours contains: counting only
		 * happens when somebody actually visits, and on a twenty-minute lattice the first
		 * visit past each boundary lands forty minutes after the last counted one. That is
		 * the honest answer — nothing was observed in between.
		 */
		let r = row();
		for (let i = 1; i <= 12; i++) r = noteLookup(r, 'term', 'tact', 'Tact', T0 + i * 20 * MIN);
		expect(r.count).toBe(7);
	});

	it('keeps the first-seen time across visits', () => {
		const r = noteLookup(row(), 'term', 'tact', 'Tact', T0 + 40 * MIN);
		expect(r.firstAt).toBe(T0);
	});

	it('takes the newer heading when an entry has been renamed', () => {
		const r = noteLookup(row(), 'term', 'tact', 'Tact (verbal operant)', T0 + 40 * MIN);
		expect(r.title).toBe('Tact (verbal operant)');
	});

	it('treats a visit that appears to precede the last one as a visit, not as nothing', () => {
		/*
		 * A clock change, a restored backup from a device set to tomorrow, a timezone
		 * shift mid-session. A negative elapsed time must not silently stop the counter,
		 * and it must not rewrite a later last-seen time with an earlier one.
		 */
		const r = noteLookup(
			row({ lastAt: T0 + 60 * MIN }),
			'term',
			'tact',
			'Tact',
			T0 - 60 * MIN
		);
		expect(r.count).toBe(1);
		expect(r.lastAt).toBe(T0 + 60 * MIN);
	});
});

describe('the two views of the same rows', () => {
	const rows: Lookup[] = [
		row({ id: 'term:tact', slug: 'tact', count: 5, lastAt: T0 }),
		row({ id: 'term:mand', slug: 'mand', count: 5, lastAt: T0 + 10 * MIN }),
		row({ id: 'term:echoic', slug: 'echoic', count: 1, lastAt: T0 + 99 * MIN }),
		row({ id: 'term:dro', slug: 'dro', count: 3, lastAt: T0 - 50 * MIN })
	];

	it('orders recency by when it was last open, whatever the count', () => {
		expect(recentLookups(rows, 2).map((r) => r.slug)).toEqual(['echoic', 'mand']);
	});

	it('leaves out anything opened only once', () => {
		// "You have opened this more than once" is not yet a thing worth saying about one.
		expect(repeatedLookups(rows, 10).map((r) => r.slug)).toEqual(['mand', 'tact', 'dro']);
	});

	it('breaks a tie on recency rather than alphabetically', () => {
		// Two terms opened five times each are not equally live.
		expect(repeatedLookups(rows, 10)[0]!.slug).toBe('mand');
	});

	it('says nothing at all when nothing has been opened twice', () => {
		expect(repeatedLookups([row({ count: 1 })], 10)).toEqual([]);
	});

	it('honours the limit', () => {
		expect(recentLookups(rows, 1)).toHaveLength(1);
		expect(repeatedLookups(rows, 1)).toHaveLength(1);
	});

	it('does not reorder the array it was handed', () => {
		// These arrive as `$state.raw` and are rendered elsewhere; sorting in place would
		// reorder somebody else's list under them.
		const before = rows.map((r) => r.slug);
		recentLookups(rows, 10);
		repeatedLookups(rows, 10);
		expect(rows.map((r) => r.slug)).toEqual(before);
	});
});

describe('the retention cap', () => {
	const many = (n: number) =>
		Array.from({ length: n }, (_, i) =>
			row({ id: `term:t${i}`, slug: `t${i}`, lastAt: T0 + i * MIN })
		);

	it('drops nothing while under the cap', () => {
		expect(prunable(many(10), 20)).toEqual([]);
		expect(prunable(many(20), 20)).toEqual([]);
	});

	it('drops the least recently opened, not the least often', () => {
		/*
		 * The cap exists so an old record of somebody's reading does not persist
		 * indefinitely. Dropping by count instead would preserve exactly the oldest rows.
		 */
		const rows = [
			row({ id: 'term:old', slug: 'old', count: 40, lastAt: T0 }),
			row({ id: 'term:new', slug: 'new', count: 1, lastAt: T0 + 99 * MIN })
		];
		expect(prunable(rows, 1)).toEqual(['term:old']);
	});

	it('drops exactly the overflow', () => {
		expect(prunable(many(25), 20)).toHaveLength(5);
	});
});
