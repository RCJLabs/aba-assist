import { describe, expect, it } from 'vitest';
import { developmentCsv, fieldworkCsv, supervisionCsv, toCsv } from './csv.js';

describe('toCsv', () => {
	it('quotes only what needs quoting', () => {
		expect(toCsv(['a', 'b'], [['plain', 'has,comma']])).toBe('a,b\r\nplain,"has,comma"\r\n');
		expect(toCsv(['a'], [['say "hi"']])).toBe('a\r\n"say ""hi"""\r\n');
		expect(toCsv(['a'], [['two\nlines']])).toBe('a\r\n"two\nlines"\r\n');
	});

	it('defuses a value a spreadsheet would run as a formula', () => {
		// Nothing in this app should produce one, which is exactly why it must not execute.
		expect(toCsv(['a'], [['=SUM(A1:A9)']])).toContain("'=SUM(A1:A9)");
		expect(toCsv(['a'], [['+1']])).toContain("'+1");
		expect(toCsv(['a'], [['-lookup']])).toContain("'-lookup");
		expect(toCsv(['a'], [['@here']])).toContain("'@here");
	});

	it('writes empty cells for missing values', () => {
		expect(toCsv(['a', 'b'], [[null, 0]])).toBe('a,b\r\n,0\r\n');
	});
});

describe('supervisionCsv', () => {
	it('resolves labels and codes, and carries the month denominator on each row', () => {
		const csv = supervisionCsv(
			[
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
			[{ id: 'w1', label: 'Riverside Clinic', active: true, createdAt: 0 }],
			[{ id: 's1', code: 'S-04', role: 'RBT', active: true, createdAt: 0 }],
			[{ id: 'w1:2026-09', month: '2026-09', workplaceId: 'w1', hours: 40 }]
		);
		const [header, row] = csv.trim().split('\r\n');
		expect(header).toContain('supervisee code');
		expect(row).toBe(
			'2026-09-04,Riverside Clinic,S-04,45,individual,in-person,yes,40,Ran a fidelity check'
		);
	});

	it('never emits a name, because there is nowhere for one to have been stored', () => {
		const csv = supervisionCsv(
			[
				{
					id: 'e1',
					date: '2026-09-04',
					minutes: 30,
					format: 'small-group',
					modality: 'live-video',
					observed: false,
					workplaceId: 'w1',
					superviseeId: null,
					note: ''
				}
			],
			[],
			[],
			[]
		);
		expect(csv.trim().split('\r\n')[1]).toBe('2026-09-04,w1,,30,small-group,live-video,no,,');
	});
});

describe('developmentCsv', () => {
	it('sorts by date and names the cycle by its dates', () => {
		const cycles = [
			{
				id: 'c1',
				credential: 'RBT' as const,
				startDate: '2027-01-01',
				endDate: '2028-12-31',
				supervisedOthers: false
			}
		];
		const unit = (id: string, date: string) => ({
			id,
			cycleId: 'c1',
			date,
			units: 1.5,
			kind: 'learning' as const,
			topic: 'ethics' as const,
			title: 'Ethics refresher',
			provider: 'A provider'
		});
		const csv = developmentCsv([unit('u2', '2027-06-01'), unit('u1', '2027-02-01')], cycles);
		const rows = csv.trim().split('\r\n').slice(1);
		expect(rows[0]).toBe(
			'2027-02-01,2027-01-01 to 2028-12-31,1.5,learning,ethics,Ethics refresher,A provider'
		);
		expect(rows[1]!.startsWith('2027-06-01')).toBe(true);
	});
});

describe('fieldworkCsv', () => {
	it('writes the monthly record the verification form asks for', () => {
		const csv = fieldworkCsv(
			[
				{
					id: 'p1:2026-09',
					periodId: 'p1',
					month: '2026-09',
					type: 'concentrated',
					totalHours: 100,
					unrestrictedHours: 65,
					supervisionHours: 10,
					individualSupervisionHours: 6,
					contacts: 6,
					observedWithClient: true,
					observationMinutes: 95,
					maxGroupSize: 0,
					supervisorCode: 'S-01',
					verificationSigned: false,
					signedOn: null,
					note: 'Two sites this month'
				}
			],
			{
				id: 'p1',
				startDate: '2026-01-01',
				ruleset: 'current',
				supervisorCode: 'S-01',
				finalFormSignedOn: null,
				createdAt: 0
			}
		);
		const [header, row] = csv.trim().split('\r\n');
		expect(header).toContain('individual supervision hours');
		// Restricted hours are derived rather than stored, because two numbers that must
		// add up are two numbers that can disagree.
		expect(row).toBe('2026-09,concentrated,S-01,100,65,35,10,6,6,yes,95,Two sites this month');
	});

	it('still writes a row when no period is on record', () => {
		const csv = fieldworkCsv(
			[
				{
					id: 'x',
					periodId: 'p1',
					month: '2026-09',
					type: 'supervised',
					totalHours: 20,
					unrestrictedHours: 12,
					supervisionHours: 1,
					individualSupervisionHours: 1,
					contacts: 4,
					observedWithClient: false,
					observationMinutes: 0,
					maxGroupSize: 0,
					supervisorCode: 'S-01',
					verificationSigned: false,
					signedOn: null,
					note: ''
				}
			],
			null
		);
		expect(csv.trim().split('\r\n')[1]).toBe('2026-09,supervised,,20,12,8,1,1,4,no,0,');
	});
});
