import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { outlines } from '$lib/content/load.js';
import { loadQuestions } from '$lib/content/load.js';
import {
	daysUntil,
	dialAltText,
	dialLabels,
	dialSegments,
	domainCoverage,
	tasksExamined,
	totalCoverage,
	type CoverageDomain,
	type OutlineLike
} from './coverage.js';

const DOMAINS: OutlineLike[] = [
	{
		letter: 'A',
		name: 'Data Collection',
		examWeightPercent: 25,
		tasks: [{ code: 'A.1' }, { code: 'A.2' }]
	},
	{
		letter: 'B',
		name: 'Assessment',
		examWeightPercent: 75,
		tasks: [{ code: 'B.1' }, { code: 'B.2' }, { code: 'B.3' }, { code: 'B.4' }]
	}
];

describe('what a run counted as examined', () => {
	it('counts a task the reader got wrong', () => {
		const seen = tasksExamined(
			[
				{
					credential: 'RBT',
					domain: 'all',
					perDomain: {},
					missed: ['q-1'],
					finishedAt: 0,
					tasks: ['A.1']
				}
			],
			'RBT'
		);
		expect(seen.has('A.1')).toBe(true);
	});

	it('ignores runs for another credential', () => {
		const seen = tasksExamined(
			[
				{
					credential: 'BCBA',
					domain: 'all',
					perDomain: {},
					missed: [],
					finishedAt: 0,
					tasks: ['A.1']
				}
			],
			'RBT'
		);
		expect(seen.size).toBe(0);
	});

	/*
	 * Runs recorded before the field existed say nothing about what they covered, and
	 * this must read as "nothing known" rather than throwing. Claiming coverage from a
	 * record that has none would be the worse failure of the two.
	 */
	it('treats a run with no task list as covering nothing', () => {
		const seen = tasksExamined(
			[{ credential: 'RBT', domain: 'all', perDomain: {}, missed: [], finishedAt: 0 }],
			'RBT'
		);
		expect(seen.size).toBe(0);
	});
});

describe('coverage per area', () => {
	it('counts tasks, not questions', () => {
		const cov = domainCoverage(DOMAINS, new Set(['A.1', 'B.1', 'B.2']));
		expect(cov.map((c) => [c.letter, c.seen, c.total])).toEqual([
			['A', 1, 2],
			['B', 2, 4]
		]);
	});

	it('ignores a code that is not on this outline', () => {
		const cov = domainCoverage(DOMAINS, new Set(['Z.9']));
		expect(totalCoverage(cov)).toEqual({ seen: 0, total: 6 });
	});
});

describe('the ring', () => {
	const cov: CoverageDomain[] = [
		{ letter: 'A', name: 'Data Collection', weight: 25, seen: 1, total: 2 },
		{ letter: 'B', name: 'Assessment', weight: 75, seen: 0, total: 4 }
	];

	it('sizes each arc by what the area is worth, not by how many tasks it has', () => {
		const { segments, circumference } = dialSegments(cov, { radius: 94, gap: 3 });
		// B is three times A's share of the paper, and has twice as many tasks. The ring
		// follows the share: this is the whole argument for a weighted dial.
		expect((segments[1]!.length + 3) / (segments[0]!.length + 3)).toBeCloseTo(3, 5);
		const spans = segments.reduce((n, s) => n + s.length + 3, 0);
		expect(spans).toBeCloseTo(circumference, 5);
	});

	it('starts at twelve o clock and runs all the way round', () => {
		const { segments } = dialSegments(cov, { radius: 94, gap: 3 });
		expect(segments[0]!.rotation).toBe(-90);
		const last = segments.at(-1)!;
		expect(last.rotation + ((last.length + 3) / (2 * Math.PI * 94)) * 360).toBeCloseTo(270, 5);
	});

	it('fills an arc in proportion to the tasks examined in that area', () => {
		const { segments } = dialSegments(cov, { radius: 94, gap: 3 });
		expect(segments[0]!.filled / segments[0]!.length).toBeCloseTo(0.5, 5);
		expect(segments[1]!.filled).toBe(0);
	});

	it('shares the ring equally when no area publishes a weight', () => {
		const unweighted = cov.map((c) => ({ ...c, weight: null }));
		const { segments } = dialSegments(unweighted, { radius: 94, gap: 3 });
		expect(segments[0]!.length).toBeCloseTo(segments[1]!.length, 5);
	});

	it('does not divide by zero on an area with no tasks', () => {
		const { segments } = dialSegments(
			[{ letter: 'A', name: 'A', weight: 100, seen: 0, total: 0 }],
			{
				radius: 94,
				gap: 3
			}
		);
		expect(segments[0]!.filled).toBe(0);
	});
});

/*
 * The letters are the only part of the ring that can leave the box.
 *
 * At three and nine o'clock a label sits at exactly the centre plus the label radius,
 * which on a box two radii wide is the edge — so B and E rendered clipped in half. The
 * box is inset for that reason, and this is the test that says so.
 */
describe('the area letters', () => {
	const INSET = 16;
	const CX = 114;
	const BOX = CX * 2 + INSET * 2;
	// A letter's own half-width at 11px, generously: enough that a clipped glyph fails.
	const HALF = 8;

	const rbt = Object.values(outlines).find((o) => o.credential === 'RBT')!;
	const cov = domainCoverage(
		rbt.domains.map((d) => ({
			letter: d.letter,
			name: d.name,
			examWeightPercent: d.examWeightPercent,
			tasks: d.tasks.map((t) => ({ code: t.code }))
		})),
		new Set()
	);

	it('all sit inside the box, including at three and nine o clock', () => {
		const labels = dialLabels(dialSegments(cov, { radius: 94, gap: 3 }), {
			centre: CX,
			gap: 3,
			offset: 20
		});
		expect(labels).toHaveLength(6);
		for (const l of labels) {
			expect(l.x - HALF, `${l.letter} left edge`).toBeGreaterThan(-INSET);
			expect(l.x + HALF, `${l.letter} right edge`).toBeLessThan(BOX - INSET);
			expect(l.y - HALF, `${l.letter} top edge`).toBeGreaterThan(-INSET);
			expect(l.y + HALF, `${l.letter} bottom edge`).toBeLessThan(BOX - INSET);
		}
	});

	it('sit clear of the ring rather than on top of it', () => {
		const labels = dialLabels(dialSegments(cov, { radius: 94, gap: 3 }), {
			centre: CX,
			gap: 3,
			offset: 20
		});
		// The stroke is 17 wide on a radius of 94, so its outer edge is at 102.5.
		for (const l of labels) {
			const r = Math.hypot(l.x - CX, l.y - 4 - CX);
			expect(r, `${l.letter}`).toBeGreaterThan(102.5);
		}
	});
});

describe('the accessible description', () => {
	const cov: CoverageDomain[] = [
		{ letter: 'A', name: 'Data Collection', weight: 25, seen: 1, total: 2 },
		{ letter: 'B', name: 'Assessment', weight: 75, seen: 0, total: 4 }
	];

	it('lists every area with its own two numbers', () => {
		const text = dialAltText(cov, totalCoverage(cov), 'RBT');
		expect(text).toContain('Data Collection, 25% of the paper: 1 of 2 tasks');
		expect(text).toContain('Assessment, 75% of the paper: 0 of 4 tasks');
		expect(text).toContain('1 of 6 tasks examined');
	});

	/*
	 * The visual design refuses to put a percentage in the centre because a percentage
	 * there is read as a readiness score. Handing a screen-reader user one instead would
	 * give them the figure everybody else is protected from.
	 */
	it('states no overall percentage and no readiness claim', () => {
		const text = dialAltText(cov, totalCoverage(cov), 'RBT', 41);
		expect(text).not.toMatch(/\b(ready|readiness|likely|on track|pass)\b/i);
		// The only percentages present are the published exam weights.
		const percentages = text.match(/\d+%/g) ?? [];
		expect(percentages).toEqual(['25%', '75%']);
	});

	it('leads with the countdown when there is one', () => {
		expect(dialAltText(cov, totalCoverage(cov), 'RBT', 41)).toMatch(
			/^41 days to the RBT exam\./
		);
		expect(dialAltText(cov, totalCoverage(cov), 'RBT', 1)).toMatch(/^1 day to the RBT exam\./);
		expect(dialAltText(cov, totalCoverage(cov), 'RBT', 0)).toMatch(/^The RBT exam is today\./);
	});
});

describe('the countdown', () => {
	const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0).getTime();

	it('counts whole calendar days, not elapsed hours', () => {
		// 23:59 today and 00:01 today must both say "tomorrow is 1".
		const late = new Date(2026, 8, 16, 23, 59).getTime();
		const early = new Date(2026, 8, 16, 0, 1).getTime();
		expect(daysUntil('2026-09-17', late)).toBe(1);
		expect(daysUntil('2026-09-17', early)).toBe(1);
	});

	it('says zero on the day', () => {
		expect(daysUntil('2026-09-16', noon(2026, 9, 16))).toBe(0);
	});

	it('goes negative for a date already gone, rather than clamping', () => {
		expect(daysUntil('2026-09-10', noon(2026, 9, 16))).toBe(-6);
	});

	it('crosses a daylight-saving boundary without drifting', () => {
		// Whatever the runner's zone, a month is a whole number of calendar days.
		expect(daysUntil('2026-11-16', noon(2026, 10, 16))).toBe(31);
		expect(daysUntil('2026-04-16', noon(2026, 3, 16))).toBe(31);
	});

	it('refuses anything that is not a real calendar day', () => {
		expect(daysUntil('', Date.now())).toBeNull();
		expect(daysUntil('16/09/2026', Date.now())).toBeNull();
		expect(daysUntil('2026-02-31', Date.now())).toBeNull();
		expect(daysUntil('2026-13-01', Date.now())).toBeNull();
	});
});

/*
 * The dial's denominator has to be reachable.
 *
 * "16 of 43 tasks examined" is a promise that 43 of 43 is attainable. If the bank cannot
 * ask about a task, that task is a permanent gap in the ring and the count is a lie by
 * omission. This is the ratchet that keeps it honest as the outlines and banks grow.
 */
describe('every task on every outline can actually be examined', () => {
	for (const outline of Object.values(outlines)) {
		it(`${outline.credential}: the bank reaches every task`, async () => {
			const asked = new Set(
				(await loadQuestions(outline.credential)).map((q) => q.taskRef.code)
			);
			const unreachable = outline.domains
				.flatMap((d) => d.tasks.map((t) => t.code))
				.filter((code) => !asked.has(code));
			expect(unreachable).toEqual([]);
		});
	}
});

/*
 * The two strokes have to be told apart.
 *
 * WCAG 1.4.11 asks 3:1 for a graphical object you need in order to understand the
 * content, both against what is behind it and against the parts beside it. The track
 * carries the size of each area and the fill carries the coverage, so all three
 * relationships matter — and this is the sort of claim a comment makes and nobody checks
 * again, so it is checked here instead.
 */
describe("the dial's colours", () => {
	const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');

	const token = (name: string, block: string) =>
		new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1] ?? null;

	const luminance = (hex: string) => {
		const channel = (n: number) => {
			const v = n / 255;
			return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		};
		const r = channel(parseInt(hex.slice(1, 3), 16));
		const g = channel(parseInt(hex.slice(3, 5), 16));
		const b = channel(parseInt(hex.slice(5, 7), 16));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};

	const ratio = (a: string, b: string) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (hi! + 0.05) / (lo! + 0.05);
	};

	// Each theme block, sliced from the first declaration to the closing brace.
	const themes = {
		light: css.slice(
			css.indexOf(':root {'),
			css.indexOf('@media (prefers-color-scheme: dark)')
		),
		'dark (system)': css.slice(
			css.indexOf("	:root:not([data-theme='light']) {"),
			css.indexOf("\n:root[data-theme='dark'] {")
		),
		'dark (chosen)': css.slice(
			css.indexOf("\n:root[data-theme='dark'] {"),
			css.indexOf('\n* {')
		)
	};

	for (const [name, block] of Object.entries(themes)) {
		it(`${name}: both strokes clear 3:1 against the card and against each other`, () => {
			const surface = token('--surface-raised', block);
			const track = token('--dial-track', block);
			const fill = token('--dial-fill', block);
			expect({ surface, track, fill }).not.toContain(null);
			expect(ratio(track!, surface!), 'track against the card').toBeGreaterThanOrEqual(3);
			expect(ratio(fill!, surface!), 'fill against the card').toBeGreaterThanOrEqual(3);
			expect(ratio(track!, fill!), 'track against fill').toBeGreaterThanOrEqual(3);
		});
	}
});
