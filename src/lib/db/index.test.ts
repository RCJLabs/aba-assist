import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
	clearAll,
	countReviews,
	DB_VERSION,
	exportAll,
	getAllCards,
	getCard,
	putAttempt,
	putCard,
	recentAttempts,
	recordReview,
	resetDbHandle
} from './index.js';
import { gradeCard, newCard } from './scheduler.js';

const T0 = Date.UTC(2026, 8, 14, 9, 0, 0);

beforeEach(() => {
	// A fresh database per test: the module caches its handle, so reset both.
	(globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
	resetDbHandle();
});

describe('local database', () => {
	it('has a version equal to the length of the migration ladder', () => {
		expect(DB_VERSION).toBe(1);
	});

	it('stores and retrieves a card', async () => {
		await putCard(newCard('extinction', T0));
		const c = await getCard('extinction');
		expect(c?.id).toBe('extinction');
		expect(await getAllCards()).toHaveLength(1);
	});

	it('records a review atomically with the rescheduled card', async () => {
		const c = newCard('mand', T0);
		await putCard(c);
		const { card, review } = gradeCard(c, 3, T0);
		await recordReview(card, review);
		expect((await getCard('mand'))?.reps).toBe(1);
		expect(await countReviews()).toBe(1);
	});

	it('lists quiz attempts newest first', async () => {
		const base = {
			credential: 'RBT',
			domain: 'all',
			total: 5,
			correct: 4,
			perDomain: {},
			missed: []
		};
		await putAttempt({ ...base, id: 'a', startedAt: T0, finishedAt: T0 + 1000 });
		await putAttempt({ ...base, id: 'b', startedAt: T0, finishedAt: T0 + 5000 });
		const list = await recentAttempts();
		expect(list.map((a) => a.id)).toEqual(['b', 'a']);
	});

	it('exports everything as plain data and clears on request', async () => {
		await putCard(newCard('tact', T0));
		const dump = await exportAll();
		expect(dump.version).toBe(DB_VERSION);
		expect(dump.cards).toHaveLength(1);
		expect(() => structuredClone(dump)).not.toThrow();
		await clearAll();
		expect(await getAllCards()).toHaveLength(0);
	});
});
