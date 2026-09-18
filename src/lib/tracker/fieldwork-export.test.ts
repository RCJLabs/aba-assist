import { describe, expect, it } from 'vitest';
import type { FieldworkMonth, FieldworkPeriod } from '$lib/db/index.js';
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
	locator: 'Hour Requirements, p. 15'
};

const period: FieldworkPeriod = {
	id: 'p1',
	startDate: '2026-01-01',
	ruleset: 'current',
	supervisorCode: 'S-01',
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
	note: '',
	...over
});

const build = (months: FieldworkMonth[], today = '2026-03-01') =>
	fieldworkRecord({
		period,
		months,
		req,
		rules,
		handbookVersion: '06/2026',
		today
	});

const fileNamed = (files: { name: string; csv: string }[], part: string) =>
	files.find((f) => f.name.includes(part))!.csv;

describe('the shape of the record', () => {
	it('is four files, in reading order', () => {
		const files = build([month()]);
		expect(files.map((f) => f.name)).toEqual([
			'fieldwork-1-period.csv',
			'fieldwork-2-months.csv',
			'fieldwork-3-totals.csv',
			'fieldwork-4-requirements.csv'
		]);
	});

	it('produces every file even with nothing logged', () => {
		/*
		 * Somebody exports before their first month to see what the form wants. Four files
		 * of headings and requirements is a useful answer; a crash is not.
		 */
		const files = build([]);
		expect(files).toHaveLength(4);
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
