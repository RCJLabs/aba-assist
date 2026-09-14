import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import type { Result } from 'axe-core';

function format(violations: Result[]): string {
	if (violations.length === 0) return 'no violations';
	return violations
		.map(
			(v) =>
				`\n[${v.impact ?? 'unknown'}] ${v.id}: ${v.help}\n  ${v.helpUrl}\n` +
				v.nodes.map((n) => `  → ${n.target.join(' ')}`).join('\n')
		)
		.join('\n');
}

/**
 * Zero tolerance, and deliberately no baseline file: this is a greenfield project, and
 * the moment a `known-violations.json` exists it never shrinks.
 *
 * Automated checks catch roughly a third of real accessibility problems, so a green run
 * here is a floor, not a pass — each milestone also gets a manual screen-reader pass.
 */
export async function expectNoA11yViolations(
	page: Page,
	opts: { include?: string } = {}
): Promise<void> {
	let builder = new AxeBuilder({ page }).withTags([
		'wcag2a',
		'wcag2aa',
		'wcag21a',
		'wcag21aa',
		'wcag22aa'
	]);
	if (opts.include) builder = builder.include(opts.include);

	const { violations } = await builder.analyze();
	expect(violations, format(violations)).toEqual([]);
}
