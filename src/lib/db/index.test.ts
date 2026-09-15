import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
	clearAll,
	clearDecision,
	clearDecisions,
	countReviews,
	DB_VERSION,
	getAll,
	put,
	removeCycle,
	removeSupervisee,
	exportAll,
	getAllCards,
	getCard,
	getDecisions,
	putAttempt,
	putCard,
	putDecision,
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
		expect(DB_VERSION).toBe(3);
	});

	it('records, lists and clears review decisions', async () => {
		await putDecision({
			id: 'extinction',
			kind: 'term',
			decision: 'approved',
			note: '',
			decidedAt: T0
		});
		await putDecision({
			id: 'mand',
			kind: 'term',
			decision: 'needs-change',
			note: 'The non-example is really an example.',
			decidedAt: T0 + 1
		});
		expect(await getDecisions()).toHaveLength(2);

		// A second verdict on the same item replaces the first rather than adding one.
		await putDecision({
			id: 'mand',
			kind: 'term',
			decision: 'approved',
			note: '',
			decidedAt: T0 + 2
		});
		const all = await getDecisions();
		expect(all).toHaveLength(2);
		expect(all.find((d) => d.id === 'mand')?.decision).toBe('approved');

		await clearDecision('mand');
		expect(await getDecisions()).toHaveLength(1);
		await clearDecisions();
		expect(await getDecisions()).toHaveLength(0);
	});

	it('an install created before v2 gains the later stores', async () => {
		// Exercises the migration ladder rather than a fresh create: open at v1 first.
		const { openDB } = await import('idb');
		const v1 = await openDB('aba-assist', 1, {
			upgrade(db) {
				db.createObjectStore('cards', { keyPath: 'id' }).createIndex('by-due', 'due');
				db.createObjectStore('reviewLog', { keyPath: 'id', autoIncrement: true });
				db.createObjectStore('quizAttempts', { keyPath: 'id' });
			}
		});
		v1.close();
		resetDbHandle();

		await putDecision({
			id: 'tact',
			kind: 'term',
			decision: 'approved',
			note: '',
			decidedAt: T0
		});
		expect(await getDecisions()).toHaveLength(1);

		// And every step after it, in order — the point of an append-only ladder is that a
		// v1 install walks all of them rather than jumping to the current schema.
		await put('workplaces', { id: 'w1', label: 'Clinic', active: true, createdAt: T0 });
		expect(await getAll('workplaces')).toHaveLength(1);
	});

	it('deletes a supervisee together with the contacts logged against them', async () => {
		await put('supervisees', {
			id: 's1',
			code: 'S-04',
			role: 'RBT',
			active: true,
			createdAt: T0
		});
		await put('supervisees', {
			id: 's2',
			code: 'S-05',
			role: 'RBT',
			active: true,
			createdAt: T0
		});
		for (const [id, superviseeId] of [
			['e1', 's1'],
			['e2', 's1'],
			['e3', 's2']
		] as const) {
			await put('supervisionEntries', {
				id,
				date: '2026-09-01',
				minutes: 30,
				format: 'individual',
				modality: 'in-person',
				observed: true,
				workplaceId: 'w1',
				superviseeId,
				note: ''
			});
		}

		await removeSupervisee('s1');
		expect(await getAll('supervisees')).toHaveLength(1);
		// Orphaned contacts would quietly shrink a compliance total rather than erroring.
		expect(await getAll('supervisionEntries')).toHaveLength(1);
		expect((await getAll('supervisionEntries'))[0]?.superviseeId).toBe('s2');
	});

	it('deletes a cycle together with the units earned inside it', async () => {
		await put('cycles', {
			id: 'c1',
			credential: 'RBT',
			startDate: '2027-01-01',
			endDate: '2028-12-31',
			supervisedOthers: false
		});
		await put('developmentUnits', {
			id: 'u1',
			cycleId: 'c1',
			date: '2027-03-02',
			units: 2,
			kind: 'learning',
			topic: 'general',
			title: 'Discrete trial refresher',
			provider: 'Authorized provider'
		});

		await removeCycle('c1');
		expect(await getAll('cycles')).toHaveLength(0);
		expect(await getAll('developmentUnits')).toHaveLength(0);
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
		await putDecision({
			id: 'tact',
			kind: 'term',
			decision: 'approved',
			note: '',
			decidedAt: T0
		});
		const dump = await exportAll();
		expect(dump.version).toBe(DB_VERSION);
		expect(dump.cards).toHaveLength(1);
		expect(dump.reviewDecisions).toHaveLength(1);
		expect(() => structuredClone(dump)).not.toThrow();
		await clearAll();
		expect(await getAllCards()).toHaveLength(0);
	});
});
