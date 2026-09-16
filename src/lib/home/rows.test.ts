import { describe, expect, it } from 'vitest';
import { cockpitRows, daysLeftInMonth, MAX_ROWS, type RowInputs } from './rows.js';
import type { Check, MonthSummary } from '$lib/tracker/rules.js';

const SUPERVISION = {
	monthlyPercent: 5,
	contactsPerMonth: 4,
	observedContactsPerMonth: 2,
	individualContactsPerMonth: 4,
	groupMax: 10,
	locator: 'handbook'
};

const DEVELOPMENT = {
	unitLabel: 'development unit',
	cycleYears: 2,
	unitsPerCycle: 12,
	ethicsUnits: 3,
	supervisionUnits: null,
	supervisionUnitsOnlyIfSupervising: false,
	carryOver: false,
	effectiveFrom: null,
	locator: 'handbook'
};

const check = (id: string, met: boolean | null, label: string): Check => ({
	id,
	label,
	met,
	detail: ''
});

const month = (over: Partial<MonthSummary> = {}): MonthSummary => ({
	month: '2026-09',
	workplaceId: 'w1',
	serviceHours: 100,
	requiredHours: 5,
	supervisedHours: 6,
	contacts: 4,
	observedContacts: 2,
	individualContacts: 4,
	oversizedGroups: 0,
	checks: [
		check('percent', true, '5% of service hours'),
		check('contacts', true, '4 real-time contacts'),
		check('observed', true, '2 with client observation'),
		check('individual', true, '4 one-to-one')
	],
	standing: 'met',
	...over
});

const base: RowInputs = {
	dueCards: 0,
	weakest: null,
	weakestWeight: null,
	months: [],
	workplaceLabels: { w1: 'Clinic', w2: 'School' },
	supervision: SUPERVISION,
	cycle: null,
	development: null,
	competency: null,
	today: '2026-09-16'
};

const row = (inputs: Partial<RowInputs>, id: string) =>
	cockpitRows({ ...base, ...inputs }).find((r) => r.id === id);

describe('the supervision figure', () => {
	it('reports the percentage when the month is in good standing', () => {
		const r = row({ months: [month()] }, 'supervision')!;
		expect(r.value).toBe('6%');
		expect(r.tone).toBe('neutral');
		expect(r.note).toBeNull();
	});

	/*
	 * The mockup coloured this figure red and said nothing else. A third of the people
	 * this app is for could not read that, and the app has refused colour-alone
	 * everywhere else.
	 */
	it('never carries a tone without also saying it in words', () => {
		const inputs: Partial<RowInputs>[] = [
			{ months: [month({ standing: 'met' })] },
			{
				months: [
					month({ standing: 'short', checks: [check('individual', false, '4 one-to-one')] })
				]
			},
			{
				months: [
					month({
						standing: 'unknown',
						serviceHours: null,
						checks: [check('percent', null, '5%')]
					})
				]
			},
			{ months: [] }
		];
		for (const i of inputs) {
			const r = row(i, 'supervision')!;
			if (r.tone !== 'neutral') expect(r.note, JSON.stringify(r)).not.toBeNull();
		}
	});

	/*
	 * `standing` goes short when any of four monthly rules fails, not only the
	 * percentage — so a month can sit well above 5% and still be short. Colouring the
	 * percentage red would point at the wrong number.
	 */
	it('names what is actually short rather than implying it is the percentage', () => {
		const r = row(
			{
				months: [
					month({
						standing: 'short',
						supervisedHours: 9,
						checks: [
							check('percent', true, '5% of service hours'),
							check('individual', false, '4 one-to-one')
						]
					})
				]
			},
			'supervision'
		)!;
		expect(r.value).toBe('9%');
		expect(r.note).toBe('short');
		expect(r.detail).toContain('Not met yet: 4 one-to-one');
		expect(r.detail).not.toContain('5% of service hours');
	});

	/*
	 * A month with no service hours entered has no percentage. Reporting that as a
	 * failure would train people to ignore the failures that are real — the same rule
	 * the tracker itself follows.
	 */
	it('says not checked, not short, when the denominator is missing', () => {
		const r = row(
			{
				months: [
					month({
						standing: 'unknown',
						serviceHours: null,
						requiredHours: null,
						checks: [check('percent', null, '5% of service hours')]
					})
				]
			},
			'supervision'
		)!;
		expect(r.value).toBe('—');
		expect(r.tone).toBe('unknown');
		expect(r.note).toBe('not checked');
	});

	it('leads with the worst workplace, and names it when there is more than one', () => {
		const r = row(
			{
				months: [
					month({ workplaceId: 'w1', standing: 'met' }),
					month({
						workplaceId: 'w2',
						standing: 'short',
						checks: [check('contacts', false, '4 real-time contacts')]
					})
				]
			},
			'supervision'
		)!;
		expect(r.note).toBe('short');
		expect(r.detail).toContain('School');
	});

	it('does not name a single workplace, because there is nothing to distinguish', () => {
		expect(row({ months: [month()] }, 'supervision')!.detail).not.toContain('Clinic');
	});

	it('only reports this calendar month', () => {
		const r = row(
			{ months: [month({ month: '2026-08', standing: 'short' })] },
			'supervision'
		)!;
		expect(r.note).toBe('not started');
	});

	/*
	 * Where a handbook has not been read into content there is no requirement, and the
	 * home page must not quote another credential's number at somebody.
	 */
	it('disappears entirely when the credential has no modelled requirement', () => {
		expect(row({ supervision: null, months: [month()] }, 'supervision')).toBeUndefined();
	});
});

describe('the development figure', () => {
	const cycle = {
		cycleId: 'c1',
		unitLabel: 'development unit',
		earned: 7,
		required: 12,
		byTopic: {} as never,
		checks: [],
		daysRemaining: 288,
		remaining: 5,
		standing: 'short' as const,
		expired: false,
		requirementApplies: true
	};

	it('reports earned against required, with the deadline that makes it mean something', () => {
		const r = row({ development: DEVELOPMENT, cycle }, 'development')!;
		expect(r.value).toBe('7 of 12');
		expect(r.detail).toContain('5 still needed · 288 days left in the cycle');
	});

	/*
	 * A two-year cycle is under its total for most of its life. Flagging that as a problem
	 * is a warning that fires when nothing is wrong, which is how people learn to ignore
	 * the ones that matter.
	 */
	it('does not call an unfinished cycle short while there is still time', () => {
		const r = row({ development: DEVELOPMENT, cycle }, 'development')!;
		expect(r.tone).toBe('neutral');
		expect(r.note).toBeNull();
	});

	/*
	 * There is no grace period and nothing carries over, so a cycle that ended still
	 * owing units is the one fact here worth colouring.
	 */
	it('flags a cycle that ended still owing units', () => {
		const r = row(
			{ development: DEVELOPMENT, cycle: { ...cycle, daysRemaining: -3, remaining: 5 } },
			'development'
		)!;
		expect(r.tone).toBe('short');
		expect(r.note).toBe('cycle ended');
		expect(r.detail).toContain('the cycle has ended');
	});

	it('says so plainly when the units are all in', () => {
		const r = row(
			{
				development: DEVELOPMENT,
				cycle: { ...cycle, earned: 12, remaining: 0, standing: 'met' as const }
			},
			'development'
		)!;
		expect(r.value).toBe('12 of 12');
		expect(r.detail).toContain('All in');
		expect(r.tone).toBe('neutral');
	});

	it('does not appear without a cycle to report on', () => {
		expect(row({ development: DEVELOPMENT, cycle: null }, 'development')).toBeUndefined();
	});
});

describe('the study figures', () => {
	it('reports the weakest area without ever calling it short', () => {
		const r = row(
			{
				weakest: { letter: 'D', name: 'Behavior Reduction', accuracy: 0.42 },
				weakestWeight: 19
			},
			'weakest'
		)!;
		expect(r.value).toBe('42%');
		expect(r.detail).toContain('worth 19% of the paper');
		// An accuracy on this app's own questions is not a mark against a standard, so
		// there is no threshold here to fail and nothing to colour.
		expect(r.tone).toBe('neutral');
		expect(r.note).toBeNull();
	});

	it('stays quiet when nothing is due', () => {
		expect(row({ dueCards: 0 }, 'due')).toBeUndefined();
		expect(row({ dueCards: 3 }, 'due')!.value).toBe('3');
	});

	it('marks the competency count as the readers own judgement', () => {
		const r = row({ competency: { ready: 11, total: 19 } }, 'competency')!;
		expect(r.value).toBe('11 of 19');
		expect(r.detail).toContain('not by an assessor');
	});
});

describe('the stack as a whole', () => {
	it('puts the dated obligations above the study queue', () => {
		const rows = cockpitRows({
			...base,
			dueCards: 10,
			months: [month({ standing: 'short', checks: [check('contacts', false, '4 contacts')] })],
			development: DEVELOPMENT,
			cycle: {
				cycleId: 'c1',
				unitLabel: 'development unit',
				earned: 7,
				required: 12,
				byTopic: {} as never,
				checks: [],
				daysRemaining: 288,
				remaining: 5,
				standing: 'short',
				expired: false,
				requirementApplies: true
			}
		});
		expect(rows.map((r) => r.id)).toEqual(['supervision', 'development', 'due']);
	});

	it('never grows past what fits above the first destination tile', () => {
		const rows = cockpitRows({
			...base,
			dueCards: 10,
			months: [month()],
			development: DEVELOPMENT,
			cycle: {
				cycleId: 'c1',
				unitLabel: 'development unit',
				earned: 12,
				required: 12,
				byTopic: {} as never,
				checks: [],
				daysRemaining: 288,
				remaining: 0,
				standing: 'met',
				expired: false,
				requirementApplies: true
			},
			weakest: { letter: 'D', name: 'Behavior Reduction', accuracy: 0.42 },
			weakestWeight: 19,
			competency: { ready: 11, total: 19 }
		});
		expect(rows.length).toBe(MAX_ROWS);
	});

	it('every row goes somewhere that can act on it', () => {
		const rows = cockpitRows({
			...base,
			dueCards: 1,
			months: [month()],
			competency: { ready: 0, total: 19 }
		});
		expect(rows.length).toBeGreaterThan(0);
		for (const r of rows) expect(r.href).toMatch(/^\/(study|plan|tools|competency)/);
	});
});

describe('days left in the month', () => {
	it('counts to the last day, in months of every length', () => {
		expect(daysLeftInMonth('2026-09-16')).toBe(14);
		expect(daysLeftInMonth('2026-09-30')).toBe(0);
		expect(daysLeftInMonth('2026-01-01')).toBe(30);
		expect(daysLeftInMonth('2026-02-01')).toBe(27);
		// A leap year has the extra day, which is a day somebody still has.
		expect(daysLeftInMonth('2028-02-01')).toBe(28);
	});
});
