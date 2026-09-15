import { describe, expect, it } from 'vitest';
import {
	BACKUP_KIND,
	backupFilename,
	backupIsOverdue,
	daysSince,
	NUDGE_AFTER_DAYS,
	totalRows,
	validateBackup
} from './backup.js';

/**
 * The import is a trust boundary: the file comes from a file picker and may be anything
 * on the device. A half-valid restore is worse than a refused one — it fails later,
 * somewhere else, with the original file already deleted.
 */

const card = (id: string) => ({
	id,
	due: 1,
	stability: 2,
	difficulty: 3,
	elapsedDays: 0,
	scheduledDays: 1,
	learningSteps: 0,
	reps: 1,
	lapses: 0,
	state: 2,
	lastReview: 1,
	createdAt: 1
});

const backup = (over: Record<string, unknown> = {}) => ({
	kind: BACKUP_KIND,
	version: 3,
	exportedAt: 1_700_000_000_000,
	cards: [card('extinction')],
	reviewLog: [{ cardId: 'extinction', grade: 3, reviewedAt: 1, scheduledDays: 1, state: 2 }],
	quizAttempts: [],
	reviewDecisions: [],
	supervisees: [{ id: 's1', code: 'S-04', role: 'RBT', active: true, createdAt: 1 }],
	workplaces: [{ id: 'w1', label: 'Riverside Clinic', active: true, createdAt: 1 }],
	supervisionEntries: [
		{
			id: 'e1',
			date: '2026-09-04',
			minutes: 45,
			format: 'individual',
			modality: 'in-person',
			observed: true,
			workplaceId: 'w1',
			superviseeId: 's1',
			note: 'Ran a fidelity check'
		}
	],
	serviceMonths: [{ id: 'w1:2026-09', month: '2026-09', workplaceId: 'w1', hours: 40 }],
	cycles: [],
	developmentUnits: [],
	...over
});

describe('validateBackup', () => {
	it('accepts a backup this app wrote', () => {
		const r = validateBackup(backup(), 3);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(totalRows(r.report.counts)).toBe(6);
		expect(r.report.dropped).toEqual([]);
		expect(r.data.supervisionEntries[0]?.note).toBe('Ran a fidelity check');
	});

	it('REFUSES a file this app did not write', () => {
		// Somebody picks the wrong JSON from their downloads folder, which is the single
		// likeliest way this goes wrong.
		const r = validateBackup({ version: 3, cards: [card('x')] }, 3);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toMatch(/not exported by this app/);
	});

	it('REFUSES a backup from a newer build', () => {
		// Importing it would quietly drop whatever this build has no store for, which is
		// the kind of loss somebody discovers months later.
		const r = validateBackup(backup({ version: 9 }), 3);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toMatch(/newer version/);
	});

	it('accepts a backup from an older build', () => {
		// An older export simply has fewer stores in it. That is not a reason to refuse.
		const r = validateBackup({ kind: BACKUP_KIND, version: 1, cards: [card('x')] }, 3);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.report.counts.cards).toBe(1);
		expect(r.report.counts.supervisionEntries).toBe(0);
	});

	it('REFUSES a supervisee whose code is a name', () => {
		// The structural reason this app holds no client data is that there is nowhere to
		// put a name. That has to hold at the import boundary too, or it is only a guard
		// on the form.
		const r = validateBackup(
			backup({
				supervisees: [
					{ id: 's1', code: 'Jamie Rivera', role: 'RBT', active: true, createdAt: 1 },
					{ id: 's2', code: 'S-05', role: 'RBT', active: true, createdAt: 1 }
				]
			}),
			3
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.supervisees.map((s) => s.code)).toEqual(['S-05']);
		expect(r.report.dropped).toContainEqual({
			store: 'supervisees',
			reason: 'the code was not a code — this app does not store names',
			count: 1
		});
	});

	it('keeps the good rows when one is corrupt, and says what it lost', () => {
		// One bad flashcard must not cost somebody two years of supervision records.
		const r = validateBackup(
			backup({ cards: [card('good'), { id: 'bad' }, 'not even an object'] }),
			3
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.data.cards.map((c) => c.id)).toEqual(['good']);
		expect(r.report.dropped).toContainEqual({
			store: 'cards',
			reason: 'wrong shape',
			count: 2
		});
	});

	it('flags restored notes that look like they carry an identifier', () => {
		const r = validateBackup(
			backup({
				supervisionEntries: [
					{ ...backup().supervisionEntries[0], note: 'Talked about Jamie Rivera' }
				]
			}),
			3
		);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		// A warning, never a block — the same posture as typing one in.
		expect(r.report.notesToCheck).toBe(1);
		expect(r.data.supervisionEntries).toHaveLength(1);
	});

	it('REFUSES a file that is ours but holds nothing restorable', () => {
		const r = validateBackup({ kind: BACKUP_KIND, version: 3 }, 3);
		expect(r.ok).toBe(false);
		if (r.ok) return;
		expect(r.error).toMatch(/nothing this app can restore/);
	});

	it('REFUSES anything that is not an object', () => {
		for (const junk of [null, 42, 'a string', [1, 2, 3]]) {
			expect(validateBackup(junk, 3).ok).toBe(false);
		}
	});

	it('repairs a store that is the wrong type rather than throwing', () => {
		const r = validateBackup(backup({ quizAttempts: 'nope' }), 3);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.report.dropped).toContainEqual({
			store: 'quizAttempts',
			reason: 'not a list',
			count: 1
		});
	});
});

describe('backupFilename', () => {
	it('is dated, so a folder of them sorts', () => {
		expect(backupFilename(new Date('2026-09-15T22:13:00Z'))).toBe(
			'aba-assist-backup-2026-09-15.json'
		);
	});
});

describe('backupIsOverdue', () => {
	const DAY = 86_400_000;
	const NOW = Date.parse('2026-09-15T12:00:00Z');

	it('says nothing to somebody with nothing to lose', () => {
		// Nagging a reader who has not started is how a warning gets ignored later.
		expect(backupIsOverdue(null, false, NOW)).toBe(false);
		expect(backupIsOverdue(NOW - 999 * DAY, false, NOW)).toBe(false);
	});

	it('speaks up once there is data and no backup at all', () => {
		expect(backupIsOverdue(null, true, NOW)).toBe(true);
	});

	it('waits a month after a backup', () => {
		expect(backupIsOverdue(NOW - DAY, true, NOW)).toBe(false);
		expect(backupIsOverdue(NOW - (NUDGE_AFTER_DAYS - 1) * DAY, true, NOW)).toBe(false);
		expect(backupIsOverdue(NOW - NUDGE_AFTER_DAYS * DAY, true, NOW)).toBe(true);
	});

	it('counts whole days', () => {
		expect(daysSince(NOW, NOW)).toBe(0);
		expect(daysSince(NOW - DAY - 1000, NOW)).toBe(1);
		expect(daysSince(NOW - 45 * DAY, NOW)).toBe(45);
	});
});
