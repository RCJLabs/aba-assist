import { describe, expect, it } from 'vitest';
import type {
	FieldworkMonth,
	FieldworkPeriod,
	FieldworkSupervisorCheck
} from '$lib/db/index.js';
import { fieldworkRecord } from './fieldwork-export.js';
import type { FieldworkRequirement, FieldworkRuleset } from './fieldwork.js';

const rules: FieldworkRuleset = {
	id: 'current',
	label: 'Current requirements',
	effectiveFrom: null,
	monthlyMinHours: 20,
	monthlyMaxHours: 130,
	supervisedPercent: 5,
	concentratedPercent: 10,
	supervisedContacts: 4,
	concentratedContacts: 6,
	observationMinutes: null,
	concentratedObservationMinutes: null,
	locator: 'Overview of Fieldwork Requirements, p. 14'
};

const req: FieldworkRequirement = {
	totalHours: 2000,
	concentratedTotalHours: 1500,
	concentratedMultiplier: 1.33,
	windowYears: 5,
	rulesets: [rules],
	ratios: [
		{
			id: 'individual-supervision',
			label: 'Individual supervision',
			percent: 50,
			of: 'the supervision you received',
			scopeVerified: true,
			scope: 'month',
			locator: 'Individual Supervision, p. 20'
		},
		{
			id: 'unrestricted',
			label: 'Unrestricted activity',
			percent: 60,
			of: 'all fieldwork hours',
			scopeVerified: true,
			scope: 'total',
			locator: 'Types of Fieldwork Activity, p. 17'
		}
	],
	excluded: ['Conferences, and coursework or homework for a degree'],
	documentationLocator: 'Documentation of Fieldwork, p. 15',
	supervisor: {
		items: [
			{ id: 'good-standing', label: 'Certified and in good standing' },
			{ id: 'tenure', label: 'Certified for at least a year, or consulting' }
		],
		contractRequired: true,
		locator: 'Supervisor qualifications, p. 13'
	},
	locator: 'Hour Requirements, p. 15'
};

const period: FieldworkPeriod = {
	id: 'p1',
	startDate: '2026-01-01',
	ruleset: 'current',
	supervisorCode: 'S-01',
	finalFormSignedOn: null,
	createdAt: 0
};

const month = (over: Partial<FieldworkMonth> = {}): FieldworkMonth => ({
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
	maxGroupSize: 0,
	supervisorCode: 'S-01',
	verificationSigned: true,
	signedOn: '2026-03-01',
	note: '',
	...over
});

const build = (months: FieldworkMonth[], today = '2026-03-01') =>
	fieldworkRecord({
		period,
		supervisors: [],
		months,
		req,
		rules,
		handbookVersion: '06/2026',
		today
	});

const fileNamed = (files: { name: string; csv: string }[], part: string) =>
	files.find((f) => f.name.includes(part))!.csv;

describe('the shape of the record', () => {
	it('is five files, in reading order', () => {
		const files = build([month()]);
		expect(files.map((f) => f.name)).toEqual([
			'fieldwork-1-period.csv',
			'fieldwork-2-months.csv',
			'fieldwork-3-totals.csv',
			'fieldwork-4-requirements.csv',
			'fieldwork-5-supervisors.csv'
		]);
	});

	it('produces every file even with nothing logged', () => {
		/*
		 * Somebody exports before their first month to see what the form wants. Four files
		 * of headings and requirements is a useful answer; a crash is not.
		 */
		const files = build([]);
		expect(files).toHaveLength(5);
		for (const f of files) expect(f.csv.length).toBeGreaterThan(0);
	});
});

describe('the months', () => {
	it('gives restricted hours their own column rather than making the reader subtract', () => {
		const csv = fileNamed(
			build([month({ totalHours: 100, unrestrictedHours: 70 })]),
			'months'
		);
		const row = csv.trim().split('\r\n')[1]!;
		// month, type, supervisor, total, unrestricted, restricted, …
		expect(row.startsWith('2026-02,supervised,S-01,100,70,30,')).toBe(true);
	});

	it('says what a month failed, not just that it failed', () => {
		/*
		 * "short" with no reason sends somebody back through the handbook to work out
		 * which of six rules they missed. The failed rules are named in their own column.
		 */
		const csv = fileNamed(build([month({ contacts: 1, supervisionHours: 0.5 })]), 'months');
		expect(csv).toContain('short');
		expect(csv.toLowerCase()).toMatch(/supervision|contact/);
	});

	it('keeps what could not be judged apart from what failed', () => {
		// A rule with no denominator is unknowable, not unmet, and conflating the two
		// trains people to ignore the failures that are real.
		const csv = fileNamed(build([month()]), 'months');
		expect(csv).toContain('Could not be judged');
		expect(csv).toContain('Requirements not met');
	});

	it('orders by month whatever order they were entered in', () => {
		const csv = fileNamed(
			build([
				month({ id: 'p1:2026-04', month: '2026-04' }),
				month({ id: 'p1:2026-01', month: '2026-01' })
			]),
			'months'
		);
		const months = csv
			.trim()
			.split('\r\n')
			.slice(1)
			.map((r) => r.split(',')[0]);
		expect(months).toEqual(['2026-01', '2026-04']);
	});
});

describe('the totals', () => {
	it('derives the restricted ceiling rather than hard-coding it', () => {
		/*
		 * The number everybody quotes is 800, and it is only right for a 2000-hour record.
		 * The rule is 40%, so a record built around a literal 800 is wrong for anybody
		 * accruing concentrated hours — where the same rule comes to 600 of 1500.
		 */
		const csv = fileNamed(build([month()]), 'totals');
		expect(csv).toContain('1200 of 2000');
		expect(csv).toContain('800 of 2000');

		const smaller = fieldworkRecord({
			period,
			supervisors: [],
			months: [month()],
			req: { ...req, totalHours: 1500 },
			rules,
			handbookVersion: '06/2026',
			today: '2026-03-01'
		});
		const other = fileNamed(smaller, 'totals');
		expect(other).toContain('900 of 1500');
		expect(other).toContain('600 of 1500');
		expect(other).not.toContain('800 of');
	});

	it('states the credited total against what is required', () => {
		const csv = fileNamed(build([month()]), 'totals');
		expect(csv).toContain('Credited hours required,2000');
		expect(csv).toContain('Credited hours so far');
		expect(csv).toContain('Credited hours remaining');
	});

	it('reports a monthly rule without a cumulative verdict', () => {
		/*
		 * Individual supervision is judged month by month. A cumulative percentage with a
		 * "met" beside it would be a verdict the handbook does not support, so the record
		 * says where the verdict actually lives.
		 */
		const csv = fileNamed(build([month()]), 'totals');
		expect(csv).toContain('judged month by month; see the months file');
	});

	it('carries the handbook reference on every threshold it states', () => {
		const csv = fileNamed(build([month()]), 'totals');
		expect(csv).toContain('Types of Fieldwork Activity, p. 17');
		expect(csv).toContain('Handbook reference');
	});

	it('says when the window closes', () => {
		const csv = fileNamed(build([month()]), 'totals');
		// Five years from 2026-01-01, minus a day.
		expect(csv).toContain('2030-12-31');
	});
});

describe('the requirements file', () => {
	it('states every threshold with the page it came from', () => {
		/*
		 * The file that makes the other three auditable. A spreadsheet of hours with a
		 * "short" column and no statement of the threshold asks the reader to trust an app
		 * they have never seen.
		 */
		const csv = fileNamed(build([month()]), 'requirements');
		expect(csv).toContain('Hour Requirements, p. 15');
		expect(csv).toContain('Overview of Fieldwork Requirements, p. 14');
		expect(csv).toContain('Least hours in a countable month,20');
		expect(csv).toContain('Most hours a month may count,130');
	});

	it('spells out what an observation requirement means when it is not a duration', () => {
		const csv = fileNamed(build([month()]), 'requirements');
		expect(csv).toContain('at least one contact includes it');
	});

	it('lists what does not count as fieldwork', () => {
		const csv = fileNamed(build([month()]), 'requirements');
		expect(csv).toContain('Does not count as fieldwork');
		expect(csv).toContain('Conferences');
	});
});

describe('the period file', () => {
	it('records which handbook edition the numbers came from', () => {
		/*
		 * A record produced three years later, against figures that have since changed,
		 * has to say which figures it used.
		 */
		const csv = fileNamed(build([month()]), 'period');
		expect(csv).toContain('BCBA handbook 06/2026');
		expect(csv).toContain('S-01');
		expect(csv).toContain('2026-01-01');
	});

	it('says plainly when a period has not been set up', () => {
		const files = fieldworkRecord({
			period: null,
			supervisors: [],
			months: [],
			req,
			rules,
			handbookVersion: '06/2026',
			today: '2026-03-01'
		});
		expect(fileNamed(files, 'period')).toContain('not recorded');
	});
});

describe('what never reaches the file', () => {
	it('carries no client identifier, because there is nowhere to put one', () => {
		/*
		 * Structural rather than filtered: the month record has no name field, and the
		 * supervisor is a code. This asserts the shape has not quietly grown one.
		 */
		const csv = build([month({ note: 'ran the protocol' })])
			.map((f) => f.csv)
			.join('\n');
		expect(csv).not.toMatch(/client name|date of birth|dob/i);
	});

	it('neutralises anything a spreadsheet would treat as a formula', () => {
		// The note is the one free-text field, and this data goes straight into Excel.
		const csv = fileNamed(build([month({ note: '=SUM(A1:A9)' })]), 'months');
		expect(csv).toContain("'=SUM(A1:A9)");
	});
});

describe('who supervised, and what has been signed', () => {
	const cols = (csv: string) => csv.split('\n').map((line) => line.split(','));
	const months = (files: ReturnType<typeof build>) =>
		files.find((f) => f.name === 'fieldwork-2-months.csv')!.csv;
	const totals = (files: ReturnType<typeof build>) =>
		files.find((f) => f.name === 'fieldwork-3-totals.csv')!.csv;

	it('attributes each month to the supervisor who was there', () => {
		/*
		 * The defect this replaced. One code lived on the fieldwork period and every row of
		 * the exported record was stamped with it, so a trainee who changed supervisors
		 * produced a record attributing years of earlier months to whoever happened to be
		 * current — silently, in the one artifact that has to hold up years later. The
		 * monthly verification form is completed per supervisor, so the month is where the
		 * code belongs.
		 */
		const files = build([
			month({ id: 'p1:2026-02', month: '2026-02', supervisorCode: 'S-01' }),
			month({ id: 'p1:2026-03', month: '2026-03', supervisorCode: 'S-02' })
		]);
		const rows = cols(months(files));
		const col = rows[0]!.indexOf('Supervisor code');
		expect(col).toBeGreaterThan(-1);
		expect(rows[1]![col]).toBe('S-01');
		expect(rows[2]![col]).toBe('S-02');
		// And the period file no longer claims to answer the question for the whole run.
		const periodCsv = files.find((f) => f.name === 'fieldwork-1-period.csv')!.csv;
		expect(periodCsv).toContain('Supervisor the run started with');
	});

	it('lists every supervisor across the record', () => {
		const files = build([
			month({ id: 'p1:2026-02', month: '2026-02', supervisorCode: 'S-02' }),
			month({ id: 'p1:2026-03', month: '2026-03', supervisorCode: 'S-01' }),
			month({ id: 'p1:2026-04', month: '2026-04', supervisorCode: 'S-02' })
		]);
		const line = totals(files)
			.split('\n')
			.find((l) => l.startsWith('Supervisors across this record'))!;
		expect(line).toContain('S-01');
		expect(line).toContain('S-02');
		// Each once, however many months they signed for.
		expect(line.match(/S-02/g)).toHaveLength(1);
	});

	it('says a month has no supervisor rather than leaving the cell blank', () => {
		// A blank cell in a compliance record reads as an oversight by whoever printed it.
		const rows = cols(months(build([month({ supervisorCode: '' })])));
		const col = rows[0]!.indexOf('Supervisor code');
		expect(rows[1]![col]).toBe('not recorded');
	});

	it('names the months still waiting on a signature', () => {
		const files = build([
			month({ id: 'p1:2026-02', month: '2026-02', verificationSigned: true }),
			month({ id: 'p1:2026-03', month: '2026-03', verificationSigned: false, signedOn: null }),
			month({ id: 'p1:2026-04', month: '2026-04', verificationSigned: false, signedOn: null })
		]);
		const csv = totals(files);
		expect(csv).toContain('Months with a signed monthly form,1 of 3');
		const line = csv.split('\n').find((l) => l.startsWith('Months still to be signed'))!;
		expect(line).toContain('2026-03');
		expect(line).toContain('2026-04');
		expect(line).not.toContain('2026-02');
	});

	it('keeps an unsigned month off the hours verdict', () => {
		/*
		 * The distinction the whole feature rests on. The rules decide whether a month's
		 * hours count; a signature decides whether they can be shown to anybody. A faultless
		 * month with no form yet is not a short month, and reporting it as one would send
		 * somebody to redo work that was fine.
		 */
		const files = build([month({ verificationSigned: false, signedOn: null })]);
		const rows = cols(months(files));
		const standing = rows[0]!.indexOf('Month standing');
		const signed = rows[0]!.indexOf('Monthly form signed');
		expect(rows[1]![standing]).toBe('met');
		expect(rows[1]![signed]).toBe('no');
		expect(totals(files)).toContain('Months that did not meet the requirements,0');
	});

	it('cites the documentation page rather than the hours page for the signature rows', () => {
		// A citation that does not check out is worse in an auditable record than none.
		const line = totals(build([month()]))
			.split('\n')
			.find((l) => l.startsWith('Months with a signed monthly form'))!;
		expect(line).toContain('Documentation of Fieldwork, p. 15');
		expect(line).not.toContain('Hour Requirements');
	});
});

describe('the supervisors file', () => {
	const file = (months: FieldworkMonth[], checks: FieldworkSupervisorCheck[] = []) =>
		fieldworkRecord({
			period,
			months,
			supervisors: checks,
			req,
			rules,
			handbookVersion: '2026',
			today: '2026-05-01'
		}).find((f) => f.name === 'fieldwork-5-supervisors.csv')!.csv;

	it('says plainly that nobody has checked, rather than leaving it out', () => {
		/*
		 * The whole point. Hours supervised by somebody who did not meet the requirements
		 * are worth nothing, and a record that simply does not mention the question reads as
		 * though it were settled.
		 */
		const csv = file([month({ supervisorCode: 'S-01' })]);
		expect(csv).toContain('S-01');
		expect(csv).toContain('not checked');
		expect(csv).toContain('Supervisor qualifications, p. 13');
	});

	it('calls a confirmation a confirmation, never a verification', () => {
		const csv = file(
			[month({ supervisorCode: 'S-01' })],
			[
				{
					id: 'p1:S-01',
					periodId: 'p1',
					code: 'S-01',
					confirmed: ['good-standing', 'tenure'],
					confirmedOn: '2026-02-01',
					contractSignedOn: '2026-01-01',
					note: ''
				}
			]
		);
		expect(csv).toContain('confirmed by the trainee');
		expect(csv).toContain('2026-02-01');
	});

	it('names what is still outstanding', () => {
		const csv = file(
			[month({ supervisorCode: 'S-01' })],
			[
				{
					id: 'p1:S-01',
					periodId: 'p1',
					code: 'S-01',
					confirmed: ['good-standing'],
					confirmedOn: '2026-02-01',
					contractSignedOn: '2026-01-01',
					note: ''
				}
			]
		);
		expect(csv).toContain('something outstanding');
		expect(csv).toContain('Certified for at least a year');
	});

	it('flags months logged before the supervision contract was signed', () => {
		// The one part of this that is arithmetic rather than somebody's say-so.
		const csv = file(
			[month({ id: 'p1:2026-02', month: '2026-02', supervisorCode: 'S-01' })],
			[
				{
					id: 'p1:S-01',
					periodId: 'p1',
					code: 'S-01',
					confirmed: ['good-standing', 'tenure'],
					confirmedOn: '2026-04-01',
					contractSignedOn: '2026-03-01',
					note: ''
				}
			]
		);
		expect(csv).toContain('2026-02');
	});

	it('has a row per supervisor across the whole record', () => {
		const csv = file([
			month({ id: 'p1:2026-02', month: '2026-02', supervisorCode: 'S-01' }),
			month({ id: 'p1:2026-03', month: '2026-03', supervisorCode: 'S-02' })
		]);
		const rows = csv.trim().split('\n');
		// Header plus two.
		expect(rows).toHaveLength(3);
	});

	it('leaves the hours alone', () => {
		/*
		 * Zeroing somebody's hours because they have not filled in a checklist would be the
		 * app inventing a finding. The record says loudly what is unconfirmed and the
		 * arithmetic above it is untouched.
		 */
		const files = fieldworkRecord({
			period,
			months: [month({ supervisorCode: 'S-01' })],
			supervisors: [],
			req,
			rules,
			handbookVersion: '2026',
			today: '2026-05-01'
		});
		const totals = files.find((f) => f.name === 'fieldwork-3-totals.csv')!.csv;
		expect(totals).toContain('Credited hours so far,100');
	});
});
