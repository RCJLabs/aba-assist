import { describe, expect, it } from 'vitest';
import type { Cycle, DevelopmentUnit, ServiceMonth, SupervisionEntry } from '$lib/db/index.js';
import {
	cycleEnd,
	daysBetween,
	summariseCycle,
	summariseMonth,
	summariseMonths,
	unitsOutsideCycle,
	type Check,
	type DevelopmentRequirement,
	type SupervisionRequirement
} from './rules.js';

/*
 * The numbers here are the technician and analyst requirements as the handbooks state
 * them, because a test that passes against invented thresholds proves nothing about the
 * arithmetic somebody will rely on.
 */
const RBT_SUPERVISION: SupervisionRequirement = {
	monthlyPercent: 5,
	contactsPerMonth: 2,
	observedContactsPerMonth: 1,
	individualContactsPerMonth: 1,
	groupMax: 10,
	locator: 'Ongoing Supervision, pp. 16-17'
};

const RBT_DEVELOPMENT: DevelopmentRequirement = {
	unitLabel: 'PDU',
	cycleYears: 2,
	unitsPerCycle: 12,
	ethicsUnits: null,
	supervisionUnits: null,
	supervisionUnitsOnlyIfSupervising: false,
	carryOver: false,
	effectiveFrom: '2027-01-01',
	locator: 'Professional Development, p. 30'
};

const BCBA_DEVELOPMENT: DevelopmentRequirement = {
	unitLabel: 'CEU',
	cycleYears: 2,
	unitsPerCycle: 32,
	ethicsUnits: 4,
	supervisionUnits: 3,
	supervisionUnitsOnlyIfSupervising: true,
	carryOver: false,
	effectiveFrom: null,
	locator: 'Continuing Education, p. 43'
};

let n = 0;
function contact(over: Partial<SupervisionEntry> = {}): SupervisionEntry {
	return {
		id: `e${n++}`,
		date: '2026-09-04',
		minutes: 60,
		format: 'individual',
		modality: 'in-person',
		observed: true,
		workplaceId: 'w1',
		superviseeId: null,
		note: '',
		...over
	};
}

function month(hours: number, over: Partial<ServiceMonth> = {}): ServiceMonth {
	return { id: 'w1:2026-09', month: '2026-09', workplaceId: 'w1', hours, ...over };
}

const check = (s: { checks: Check[] }, id: string) => s.checks.find((c) => c.id === id)!;

describe('summariseMonth', () => {
	it('passes a month that meets every rule', () => {
		const s = summariseMonth(
			'2026-09',
			'w1',
			[contact(), contact({ format: 'small-group', observed: false })],
			month(30),
			RBT_SUPERVISION
		);
		expect(s.supervisedHours).toBe(2);
		expect(s.requiredHours).toBe(1.5);
		expect(s.standing).toBe('met');
		expect(s.checks.every((c) => c.met)).toBe(true);
	});

	it('fails the percentage without failing anything else', () => {
		// Two contacts of 15 minutes: the contact rules pass, 0.5h against 5% of 40h does not.
		const s = summariseMonth(
			'2026-09',
			'w1',
			[contact({ minutes: 15 }), contact({ minutes: 15, format: 'small-group' })],
			month(40),
			RBT_SUPERVISION
		);
		expect(s.requiredHours).toBe(2);
		expect(s.supervisedHours).toBe(0.5);
		expect(check(s, 'percent').met).toBe(false);
		expect(check(s, 'contacts').met).toBe(true);
		expect(s.standing).toBe('short');
	});

	it('reports an un-entered month as unknown, not as a failure', () => {
		// A missing denominator is missing information. Calling it non-compliance teaches
		// people to ignore the warnings that are real.
		const s = summariseMonth(
			'2026-09',
			'w1',
			[contact(), contact()],
			undefined,
			RBT_SUPERVISION
		);
		expect(check(s, 'percent').met).toBeNull();
		expect(s.standing).toBe('unknown');
		expect(check(s, 'percent').detail).toMatch(/Enter the hours/);
	});

	it('counts observation and one-to-one contacts separately', () => {
		const s = summariseMonth(
			'2026-09',
			'w1',
			[
				contact({ format: 'small-group', observed: false }),
				contact({ format: 'small-group', observed: false })
			],
			month(10),
			RBT_SUPERVISION
		);
		expect(check(s, 'observed').met).toBe(false);
		expect(check(s, 'individual').met).toBe(false);
		// Two hours against 5% of ten is comfortably enough; the shortfall is in the kind
		// of contact, not the amount, which is exactly the distinction people miss.
		expect(check(s, 'percent').met).toBe(true);
	});

	it('keeps workplaces apart, because the rule is written per workplace', () => {
		const entries = [
			contact({ workplaceId: 'w1', minutes: 120 }),
			contact({ workplaceId: 'w1', minutes: 120 }),
			contact({ workplaceId: 'w2', minutes: 5 })
		];
		const months = [month(40), month(40, { id: 'w2:2026-09', workplaceId: 'w2' })];
		const all = summariseMonths(entries, months, RBT_SUPERVISION);
		expect(all).toHaveLength(2);
		// A well-supervised job must not paper over a badly supervised one.
		expect(all.find((m) => m.workplaceId === 'w1')!.standing).toBe('met');
		expect(all.find((m) => m.workplaceId === 'w2')!.standing).toBe('short');
	});

	it('ignores contacts from other months', () => {
		const s = summariseMonth(
			'2026-09',
			'w1',
			[contact({ date: '2026-08-31' }), contact({ date: '2026-10-01' }), contact()],
			month(10),
			RBT_SUPERVISION
		);
		expect(s.contacts).toBe(1);
	});

	it('lists months newest first, including ones with hours but no contacts', () => {
		const all = summariseMonths(
			[contact({ date: '2026-07-02' })],
			[month(10, { id: 'w1:2026-09', month: '2026-09' })],
			RBT_SUPERVISION
		);
		expect(all.map((m) => m.month)).toEqual(['2026-09', '2026-07']);
	});
});

describe('cycleEnd and daysBetween', () => {
	it('ends a two-year cycle the day before the anniversary', () => {
		// Off by one here is a day somebody believes they still have.
		expect(cycleEnd('2027-01-01', 2)).toBe('2028-12-31');
		expect(cycleEnd('2026-03-15', 2)).toBe('2028-03-14');
	});

	it('handles a leap day without drifting', () => {
		expect(cycleEnd('2024-02-29', 2)).toBe('2026-02-28');
		expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
	});

	it('counts whole days in UTC, so a timezone cannot shift a deadline', () => {
		expect(daysBetween('2026-09-15', '2026-09-15')).toBe(0);
		expect(daysBetween('2026-09-15', '2026-09-14')).toBe(-1);
		expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
	});
});

describe('summariseCycle', () => {
	const cycle = (over: Partial<Cycle> = {}): Cycle => ({
		id: 'c1',
		credential: 'RBT',
		startDate: '2027-01-01',
		endDate: '2028-12-31',
		supervisedOthers: false,
		...over
	});

	let u = 0;
	const unit = (over: Partial<DevelopmentUnit> = {}): DevelopmentUnit => ({
		id: `u${u++}`,
		cycleId: 'c1',
		date: '2027-04-01',
		units: 1,
		kind: 'learning',
		topic: 'general',
		title: 'An authorized event',
		provider: 'A provider',
		...over
	});

	it('adds up a technician cycle', () => {
		const s = summariseCycle(
			cycle(),
			[unit({ units: 8 }), unit({ units: 4 })],
			RBT_DEVELOPMENT,
			'2027-06-01'
		);
		expect(s.earned).toBe(12);
		expect(s.remaining).toBe(0);
		expect(s.standing).toBe('met');
		// A technician has no ethics or supervision minimum at all, which is different
		// from having one of zero.
		expect(s.checks.map((c) => c.id)).toEqual(['total']);
	});

	it('holds an analyst to the topic minimums as well as the total', () => {
		const s = summariseCycle(
			cycle({ credential: 'BCBA', supervisedOthers: true }),
			[unit({ units: 32, topic: 'general' })],
			BCBA_DEVELOPMENT,
			'2027-06-01'
		);
		expect(check(s, 'total').met).toBe(true);
		// 32 units and still short, which is the trap this whole screen exists to catch.
		expect(check(s, 'ethics').met).toBe(false);
		expect(check(s, 'supervision').met).toBe(false);
		expect(s.standing).toBe('short');
	});

	it('drops the supervision minimum for a cycle spent supervising nobody', () => {
		const s = summariseCycle(
			cycle({ credential: 'BCBA', supervisedOthers: false }),
			[unit({ units: 28 }), unit({ units: 4, topic: 'ethics' })],
			BCBA_DEVELOPMENT,
			'2027-06-01'
		);
		expect(check(s, 'supervision').met).toBe(true);
		expect(check(s, 'supervision').detail).toMatch(/supervised nobody/);
		expect(s.standing).toBe('met');
	});

	it('counts down to the end date and knows when it has passed', () => {
		expect(summariseCycle(cycle(), [], RBT_DEVELOPMENT, '2028-12-01').daysRemaining).toBe(30);
		const over = summariseCycle(cycle(), [], RBT_DEVELOPMENT, '2029-01-05');
		expect(over.daysRemaining).toBe(-5);
		expect(over.expired).toBe(true);
	});

	it('adds half units without a floating-point tail', () => {
		const s = summariseCycle(
			cycle(),
			[unit({ units: 0.5 }), unit({ units: 0.5 }), unit({ units: 0.1 })],
			RBT_DEVELOPMENT,
			'2027-06-01'
		);
		expect(s.earned).toBe(1.1);
		expect(s.remaining).toBe(10.9);
	});

	it('flags units dated outside the cycle they are filed under', () => {
		// Nothing carries forward at any BACB credential, so these will not count — and
		// the reader would rather find out now than at recertification.
		const stray = [unit({ date: '2026-12-31' }), unit({ date: '2029-01-01' }), unit()];
		expect(unitsOutsideCycle(cycle(), stray).map((x) => x.date)).toEqual([
			'2026-12-31',
			'2029-01-01'
		]);
	});
});
