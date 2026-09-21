import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
	clearAll,
	clearDecision,
	clearDecisions,
	countReviews,
	DB_VERSION,
	removeFieldworkPeriod,
	getAll,
	hasStoredData,
	put,
	restoreAll,
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
	resetDbHandle,
	putDrillAttempt,
	recentDrillAttempts,
	recordLookup,
	getLookups,
	clearLookups
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
		expect(DB_VERSION).toBe(11);
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

		await putDrillAttempt({
			id: 'pairs-1-15',
			kind: 'pairs',
			startedAt: T0,
			finishedAt: T0 + 60_000,
			total: 15,
			correct: 12,
			categories: [],
			missedPairs: ['dro|dra']
		});
		expect(await recentDrillAttempts()).toHaveLength(1);

		// v6, the newest rung. An install this old is the case a migration most often gets
		// wrong, because the fresh-create path works whatever the ladder does.
		await put('supervisionQuestions', {
			id: 'q1',
			superviseeId: null,
			topic: 'the-plan',
			question: 'Which step of the chain counts as independent?',
			raisedAt: T0,
			answeredAt: null
		});
		expect(await getAll('supervisionQuestions')).toHaveLength(1);

		// v7. An install this old is the case a migration most often gets
		// wrong, because the fresh-create path works whatever the ladder does.
		await recordLookup('term', 'tact', 'Tact', T0);
		expect(await getLookups()).toHaveLength(1);

		// v8, the newest rung. An install this old is the case a migration most often gets
		// wrong, because the fresh-create path works whatever the ladder does.
		await put('superviseeMonths', {
			id: 's1|w1|2026-09',
			superviseeId: 's1',
			workplaceId: 'w1',
			month: '2026-09',
			hours: 30
		});
		expect(await getAll('superviseeMonths')).toHaveLength(1);
	});

	it('gives an existing month of fieldwork its supervisor and an unsigned form', async () => {
		/*
		 * v9 is the first rung that rewrites rows rather than adding a store, so it is the
		 * first one that can quietly do nothing and still leave a database that opens.
		 *
		 * Before it, one supervisor code sat on the fieldwork period and the exported record
		 * stamped it on every month — so a trainee who changed supervisors got a record
		 * attributing years of earlier months to whoever was current. The code belongs on the
		 * month; this proves the months that already exist get it rather than being left with
		 * nothing, which would read as "not recorded" across somebody's whole history.
		 */
		const { openDB } = await import('idb');
		const v8 = await openDB('aba-assist', 8, {
			upgrade(db) {
				db.createObjectStore('fieldworkPeriods', { keyPath: 'id' });
				db.createObjectStore('fieldworkMonths', { keyPath: 'id' }).createIndex(
					'by-period',
					'periodId'
				);
			}
		});
		await v8.put('fieldworkPeriods', {
			id: 'p1',
			startDate: '2026-01-01',
			ruleset: 'current',
			supervisorCode: 'S-07',
			createdAt: T0
		});
		await v8.put('fieldworkMonths', {
			id: 'p1:2026-02',
			periodId: 'p1',
			month: '2026-02',
			type: 'supervised',
			totalHours: 100,
			unrestrictedHours: 70,
			supervisionHours: 5,
			individualSupervisionHours: 3,
			contacts: 4,
			observedWithClient: true,
			observationMinutes: 0,
			note: ''
		});
		v8.close();
		resetDbHandle();

		const months = await getAll('fieldworkMonths');
		expect(months).toHaveLength(1);
		// Backfilled from the period, which is the best available answer and, for anybody who
		// never changed supervisors, the right one.
		expect(months[0]!.supervisorCode).toBe('S-07');
		// And false rather than true: nothing in the old data says a form was signed, and
		// inventing that claim on somebody's behalf is what a compliance record must not do.
		expect(months[0]!.verificationSigned).toBe(false);
		expect(months[0]!.signedOn).toBeNull();
		// The hours are untouched — a migration that rewrites rows is also a migration that
		// can lose them.
		expect(months[0]!.totalHours).toBe(100);
		expect(months[0]!.contacts).toBe(4);

		// v10, the newest rung, reached by the same install.
		await put('fieldworkSupervisors', {
			id: 'p1:S-07',
			periodId: 'p1',
			code: 'S-07',
			confirmed: ['good-standing'],
			confirmedOn: '2026-03-01',
			contractSignedOn: '2026-01-01',
			note: ''
		});
		expect(await getAll('fieldworkSupervisors')).toHaveLength(1);

		// v11: the period gained a final-form date and the month a group size, and both
		// arrived on rows written long before either field existed.
		const periods = await getAll('fieldworkPeriods');
		expect(periods[0]!.finalFormSignedOn).toBeNull();
		expect((await getAll('fieldworkMonths'))[0]!.maxGroupSize).toBe(0);
	});

	it('takes the supervisor confirmations with the fieldwork period', async () => {
		/*
		 * A record of who was checked, outliving the fieldwork it was checked for, is the
		 * shape of orphan row this data model exists to make impossible — and the one the
		 * supervisee hours rung had to be fixed for.
		 */
		await put('fieldworkPeriods', {
			id: 'p9',
			startDate: '2026-01-01',
			ruleset: 'current',
			supervisorCode: 'S-01',
			finalFormSignedOn: null,
			createdAt: T0
		});
		await put('fieldworkSupervisors', {
			id: 'p9:S-01',
			periodId: 'p9',
			code: 'S-01',
			confirmed: ['good-standing'],
			confirmedOn: '2026-03-01',
			contractSignedOn: null,
			note: ''
		});
		expect(await getAll('fieldworkSupervisors')).toHaveLength(1);

		await removeFieldworkPeriod('p9');
		expect(await getAll('fieldworkSupervisors')).toHaveLength(0);
	});

	it('a repeat visit in the same sitting updates the row rather than adding one', async () => {
		await recordLookup('term', 'tact', 'Tact', T0);
		await recordLookup('term', 'tact', 'Tact', T0 + 60_000);
		const rows = await getLookups();
		expect(rows).toHaveLength(1);
		expect(rows[0]!.count).toBe(1);
		expect(rows[0]!.lastAt).toBe(T0 + 60_000);
	});

	it('keeps a term and a situation with the same slug apart', async () => {
		await recordLookup('term', 'elopement', 'Elopement', T0);
		await recordLookup('scenario', 'elopement', 'A learner leaves the area', T0);
		expect(await getLookups()).toHaveLength(2);
	});

	it('forgets the reading history without touching anything else', async () => {
		/*
		 * The whole reason `clearLookups` exists separately. "I would rather you did not
		 * keep a list of what I read" must not cost somebody their supervision records.
		 */
		await recordLookup('term', 'tact', 'Tact', T0);
		await put('supervisionQuestions', {
			id: 'q1',
			superviseeId: null,
			topic: 'the-plan',
			question: 'Which step counts as independent?',
			raisedAt: T0,
			answeredAt: null
		});

		await clearLookups();

		expect(await getLookups()).toHaveLength(0);
		expect(await getAll('supervisionQuestions')).toHaveLength(1);
	});

	it('does not let a reading history alone count as data worth warning about', async () => {
		/*
		 * `hasStoredData` decides whether to tell somebody their data has gone. A reader
		 * who has only ever browsed the glossary has nothing they would grieve, and
		 * greeting them with "your progress has been deleted" after a cleared cache is
		 * the false positive that teaches people to ignore the true warning.
		 */
		await recordLookup('term', 'tact', 'Tact', T0);
		expect(await hasStoredData()).toBe(false);

		await putCard(newCard('tact', T0));
		expect(await hasStoredData()).toBe(true);
	});

	it('carries the reading history through a backup and erases it with everything else', async () => {
		await recordLookup('term', 'tact', 'Tact', T0);
		const dump = await exportAll();
		expect(dump.lookups).toHaveLength(1);
		expect(dump.lookups[0]!.title).toBe('Tact');

		await clearAll();
		expect(await getLookups()).toHaveLength(0);
	});

	it('deleting a supervisee takes their recorded hours with them', async () => {
		/*
		 * An hours row outliving the person it belongs to is a figure about somebody the
		 * log no longer names — the shape of orphan record this data model exists to make
		 * impossible.
		 */
		await put('supervisees', {
			id: 's1',
			code: 'S-04',
			role: 'RBT',
			active: true,
			createdAt: T0
		});
		await put('superviseeMonths', {
			id: 's1|w1|2026-09',
			superviseeId: 's1',
			workplaceId: 'w1',
			month: '2026-09',
			hours: 30
		});
		await put('superviseeMonths', {
			id: 's2|w1|2026-09',
			superviseeId: 's2',
			workplaceId: 'w1',
			month: '2026-09',
			hours: 12
		});

		await removeSupervisee('s1');

		const left = await getAll('superviseeMonths');
		expect(left.map((m) => m.superviseeId)).toEqual(['s2']);
	});

	it('deleting a supervisee takes their parked questions with them', async () => {
		/*
		 * A question left behind would sit on the agenda under a supervisee who no longer
		 * exists — a line of free text about somebody, outliving the record it was filed
		 * under, which is worse than the dangling reference it looks like.
		 */
		await put('supervisees', {
			id: 's1',
			code: 'S-04',
			role: 'RBT',
			active: true,
			createdAt: T0
		});
		await put('supervisionQuestions', {
			id: 'theirs',
			superviseeId: 's1',
			topic: 'a-procedure',
			question: 'Do we still run the token board on Fridays?',
			raisedAt: T0,
			answeredAt: null
		});
		await put('supervisionQuestions', {
			id: 'mine',
			superviseeId: null,
			topic: 'scope-and-role',
			question: 'Am I allowed to write the goal myself?',
			raisedAt: T0,
			answeredAt: null
		});

		await removeSupervisee('s1');

		const left = await getAll('supervisionQuestions');
		expect(left.map((q) => q.id)).toEqual(['mine']);
	});

	it('keeps drill sittings newest first', async () => {
		for (const [id, at] of [
			['old', T0],
			['new', T0 + 86_400_000],
			['middle', T0 + 3_600_000]
		] as const) {
			await putDrillAttempt({
				id,
				kind: 'pairs',
				startedAt: at,
				finishedAt: at,
				total: 15,
				correct: 10,
				categories: [],
				missedPairs: []
			});
		}
		expect((await recentDrillAttempts()).map((a) => a.id)).toEqual(['new', 'middle', 'old']);
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

	it('restores a backup by replacing what is there, in one transaction', async () => {
		await putCard(newCard('extinction', T0));
		await put('workplaces', { id: 'old', label: 'Old job', active: true, createdAt: T0 });

		await restoreAll({
			cards: [newCard('shaping', T0)],
			reviewLog: [{ cardId: 'shaping', grade: 3, reviewedAt: T0, scheduledDays: 1, state: 2 }],
			quizAttempts: [],
			drillAttempts: [],
			reviewDecisions: [],
			supervisees: [{ id: 's1', code: 'S-04', role: 'RBT', active: true, createdAt: T0 }],
			workplaces: [{ id: 'new', label: 'New job', active: true, createdAt: T0 }],
			supervisionEntries: [],
			serviceMonths: [],
			cycles: [],
			developmentUnits: [],
			fieldworkPeriods: [],
			fieldworkMonths: [],
			supervisionQuestions: [],
			lookups: [],
			superviseeMonths: []
		});

		// Replace, not merge: merging two devices' review histories means deciding which
		// one is true, and getting that wrong corrupts the thing people most want back.
		const cards = await getAllCards();
		expect(cards.map((c) => c.id)).toEqual(['shaping']);
		expect((await getAll('workplaces')).map((w) => w.id)).toEqual(['new']);
		expect(await getAll('supervisees')).toHaveLength(1);
		// The log has an auto-incrementing key the export strips, so it is added, not put.
		expect(await countReviews()).toBe(1);
	});

	it('reports whether there is anything worth backing up', async () => {
		expect(await hasStoredData()).toBe(false);
		await putCard(newCard('extinction', T0));
		expect(await hasStoredData()).toBe(true);
	});

	it('stamps an export so an unrelated file can be told apart on the way back in', async () => {
		await putCard(newCard('extinction', T0));
		const dump = await exportAll();
		expect(dump.kind).toBe('aba-assist-backup');
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
