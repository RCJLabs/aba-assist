import { describe, expect, it } from 'vitest';
import { isSuperviseeCode, phiWarnings } from './phi.js';

/**
 * These are the tests that matter most in the file, because the thing they guard is the
 * one that turns a safe reference tool into a HIPAA liability. A guard nobody has watched
 * fail is not a guard.
 */

describe('isSuperviseeCode', () => {
	it('accepts the shapes people actually use', () => {
		for (const code of ['S-04', 'S04', 'BT12', 'RBT_7', 'A 1', 'ABC-1234']) {
			expect(isSuperviseeCode(code), code).toBe(true);
		}
	});

	it('REFUSES anything that could be a name', () => {
		for (const nope of [
			'Jamie',
			'Jamie R',
			'J Rivera',
			'Rivera, J',
			'jamie-04',
			'S-04 Jamie',
			'ABCD1',
			'S-12345',
			''
		]) {
			expect(isSuperviseeCode(nope), nope).toBe(false);
		}
	});
});

describe('phiWarnings', () => {
	it('says nothing about an ordinary note', () => {
		expect(
			phiWarnings('Reviewed data collection for the escape condition. Practised DTT.')
		).toEqual([]);
		expect(phiWarnings('   ')).toEqual([]);
	});

	it('catches the identifiers people type without thinking', () => {
		const ids = (t: string) => phiWarnings(t).map((w) => w.id);
		expect(ids('SSN 123-45-6789')).toContain('ssn');
		expect(ids('DOB 04/12/2015')).toContain('dob');
		expect(ids('born 4.12.2015')).toContain('dob');
		expect(ids('Observed Jamie Rivera during transitions')).toContain('name');
		expect(ids('call mom at (555) 867-5309')).toContain('phone');
		expect(ids('emailed carer@example.com')).toContain('email');
		expect(ids('session at 42 Maple Street')).toContain('address');
		expect(ids('see MRN for details')).toContain('record-number');
	});

	it('warns rather than blocks, because it cannot tell a name from a programme', () => {
		// A known false positive, kept deliberately: the cost of missing a real name is
		// higher than the cost of one dismissed warning.
		expect(phiWarnings('Ran Safety Care refresher').map((w) => w.id)).toContain('name');
	});
});
