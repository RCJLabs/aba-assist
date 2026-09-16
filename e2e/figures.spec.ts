import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';
import { seedTracker } from './utils/tracker-seed';

/**
 * The figures under the dial, and the same figures on the tools hub.
 *
 * What is defended here is not the layout. It is that a number on this screen never
 * misleads: a red figure always says why in words, a figure that could not be worked out
 * says so instead of showing a zero, and nothing is flagged as a problem that is not one.
 * All three were wrong before this, in the mockup and on the tools page.
 */

const home = async (page: Page) => {
	await page.goto('/');
	await page
		.getByRole('group', { name: 'Show content for' })
		.getByRole('radio', { name: /Technician \(RBT\)/ })
		.first()
		.check();
	// The figures come from storage, after the page is already complete. Without waiting
	// for that, "still loading" and "nothing to show" look identical and the assertion
	// below is racing a timeout rather than testing anything.
	await expect(page.locator('[data-strip="ready"]')).toBeAttached();
};

/** The tools hub loads the tracker the same way, and says when it has. */
const tools = async (page: Page) => {
	await page.goto('/tools');
	await expect(page.locator('[data-tracker="ready"]')).toBeAttached();
};

/** The app has to open the database before records can be put into it. */
const openDb = async (page: Page) => {
	await tools(page);
};

const figure = (page: Page, label: RegExp) =>
	page.locator('.figures li').filter({ hasText: label });

test('a short month shows the percentage and says short in words', async ({ page }) => {
	await openDb(page);
	// 96 hours delivered, 3 hours supervised: 3.1%, under the 5% the month owes.
	await seedTracker(page, { serviceHours: 96, contacts: 3, observed: 2 });
	await home(page);

	const row = figure(page, /Supervision this month/);
	await expect(row).toContainText('3.1%');
	await expect(row).toContainText('short');
	// And it names what is actually missed, rather than leaving the reader to guess.
	await expect(row).toContainText('Not met yet');
});

/*
 * The tracker has always refused to call a missing denominator non-compliance. A
 * percentage cannot be computed without the hours delivered, and showing a red zero
 * there would train people to ignore the failures that are real.
 */
test('a month with no service hours says not checked, not zero', async ({ page }) => {
	await openDb(page);
	await seedTracker(page, { contacts: 4, observed: 2 });
	await home(page);

	const row = figure(page, /Supervision this month/);
	await expect(row).toContainText('—');
	await expect(row).toContainText('not checked');
	await expect(row).not.toContainText('0%');
	await expect(row).not.toContainText('short');
});

/*
 * A two-year cycle is under its total for most of its life. The tools page used to
 * colour that red and call it "In progress", which is a warning that fires when nothing
 * is wrong.
 */
test('an unfinished cycle with time left is not flagged', async ({ page }) => {
	await openDb(page);
	await seedTracker(page, { cycle: { units: 7, startMonthsAgo: 9, years: 2 } });
	await home(page);

	const row = figure(page, /this cycle/);
	await expect(row).toContainText('7 of 12');
	await expect(row).toContainText('5 still needed');
	await expect(row).not.toContainText('short');
	await expect(row.locator('[data-tone="short"]')).toHaveCount(0);
});

/*
 * The technician unit rule applies from 2027, because anyone recertifying during 2026
 * meets the older annual requirements one last time. A cycle that ended before then was
 * never under it, so the ledger keeps what was earned and withholds the verdict — the
 * same posture the tools take for a credential whose handbook has not been read.
 */
test('a cycle that ended before the rule started is recorded, not scored', async ({
	page
}) => {
	await openDb(page);
	await seedTracker(page, { cycle: { units: 7, startMonthsAgo: 30, years: 2 } });
	await home(page);

	const row = figure(page, /recorded/);
	await expect(row).toContainText('not scored');
	await expect(row).not.toContainText('of 12');
	await expect(row).not.toContainText('still needed');
});

test('the competency count is marked as the reader own judgement', async ({ page }) => {
	await openDb(page);
	await seedTracker(page, { competencyReady: 11 });
	await home(page);

	const row = figure(page, /Competency tasks/);
	await expect(row).toContainText('11 of 19');
	await expect(row).toContainText('not by an assessor');
});

test('the home page and the tools hub report the same month', async ({ page }) => {
	await openDb(page);
	await seedTracker(page, { serviceHours: 96, contacts: 3, observed: 2 });

	await home(page);
	await expect(figure(page, /Supervision this month/)).toContainText('3.1%');

	await tools(page);
	const row = figure(page, /This month at Clinic/);
	await expect(row).toContainText('3.1%');
	await expect(row).toContainText('short');
});

/*
 * Every toned figure must be readable without seeing the colour. This is the check that
 * would have caught the mockup's bare red "3.1%", and it runs over whatever the page
 * happens to be showing rather than over a list of known cases.
 */
test('no figure carries a tone without also saying it in words', async ({ page }) => {
	await openDb(page);
	await seedTracker(page, {
		serviceHours: 96,
		contacts: 3,
		observed: 2,
		cycle: { units: 7, startMonthsAgo: 30, years: 2 },
		competencyReady: 11
	});

	for (const route of ['/', '/tools']) {
		if (route === '/') await home(page);
		else await tools(page);
		await expect(page.locator('.figures li').first()).toBeVisible();
		const bare = await page.evaluate(() =>
			[...document.querySelectorAll('.figures [data-tone]')]
				.filter((el) => el.getAttribute('data-tone') !== 'neutral')
				.filter((el) => !el.querySelector('.note')?.textContent?.trim())
				.map((el) => el.textContent?.trim() ?? '')
		);
		expect(bare, `${route} has a coloured figure with no word beside it`).toEqual([]);
	}
});

test.describe('the figures under the same sweeps as everything else', () => {
	const seeded = async (page: Page) => {
		await openDb(page);
		await seedTracker(page, {
			serviceHours: 96,
			contacts: 3,
			observed: 2,
			cycle: { units: 7, startMonthsAgo: 30, years: 2 },
			competencyReady: 11
		});
		await home(page);
		await expect(page.locator('.figures li').first()).toBeVisible();
	};

	for (const [name, prepare] of [
		['light', async (page: Page) => seeded(page)],
		[
			'dark',
			async (page: Page) => {
				await page.emulateMedia({ colorScheme: 'dark' });
				await seeded(page);
			}
		],
		[
			'320px',
			async (page: Page) => {
				await page.setViewportSize({ width: 320, height: 720 });
				await seeded(page);
			}
		]
	] as [string, (page: Page) => Promise<void>][]) {
		test(`no axe violations, ${name}`, async ({ page }) => {
			await prepare(page);
			await expectNoA11yViolations(page);
		});
	}

	test('no horizontal scrolling at 320px with figures on the page', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 720 });
		await seeded(page);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test('every figure row clears the 24px target floor', async ({ page }) => {
		await seeded(page);
		const small = await page.evaluate(() =>
			[...document.querySelectorAll('.figures a')]
				.map((el) => el.getBoundingClientRect())
				.filter((r) => r.height < 24 || r.width < 24)
				.map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`)
		);
		expect(small).toEqual([]);
	});
});
