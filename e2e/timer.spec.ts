import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';

/**
 * The interval timer.
 *
 * What makes it worth building rather than pointing people at a stopwatch is that the
 * three procedures differ in when you score and each biases the estimate a different way.
 * What makes it safe to build is that it saves nothing: a per-interval record of one
 * person's behaviour is client data, and the promise that this app holds none is worth
 * more than the convenience of keeping it.
 */

/** Five-second intervals over one minute, which is twelve of them. */
async function setUpShortRun(page: Page): Promise<void> {
	await page.goto('/tools/timer');
	await expect(page.locator('[data-timer-status="idle"]')).toBeAttached();
	await page.getByLabel('Interval length').selectOption('5');
	await page.getByLabel('Observation length').selectOption('1');
	await expect(page.locator('.count')).toContainText('12 intervals of 5 seconds');
}

test('each procedure says when to score and which way it is wrong', async ({ page }) => {
	await page.goto('/tools/timer');

	await page.getByRole('radio', { name: /Partial interval/ }).check();
	await expect(page.locator('.bias')).toContainText('Overestimates');

	await page.getByRole('radio', { name: /Whole interval/ }).check();
	await expect(page.locator('.bias')).toContainText('Underestimates');

	await page.getByRole('radio', { name: /Momentary time sampling/ }).check();
	await expect(page.locator('.bias')).toContainText('Closest');

	// And each links to the entry that defines it, rather than explaining it twice.
	await page.locator('.bias').getByRole('link', { name: 'Read the full entry' }).click();
	await expect(page).toHaveURL(/\/glossary\/momentary-time-sampling\/?$/);
});

test('the run counts down, advances intervals and scores them', async ({ page }) => {
	await setUpShortRun(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.locator('[data-timer-status="running"]')).toBeAttached();

	await expect(page.locator('.of')).toContainText('Interval 1 of 12');
	await expect(page.locator('.strip .cell')).toHaveCount(12);

	await page.getByRole('button', { name: 'Yes', exact: true }).click();
	await expect(page.locator('.totals')).toContainText('1 / 12');
	await expect(page.locator('.totals')).toContainText('100%');

	// The clock is real: five-second intervals move on without being touched.
	await expect(page.locator('.of')).toContainText('Interval 2 of 12', { timeout: 10_000 });

	await page.getByRole('button', { name: 'No', exact: true }).click();
	// Percent is of SCORED intervals, not of all of them — an unscored one is missing
	// data, and counting it as a no would look like an improvement.
	await expect(page.locator('.totals')).toContainText('2 / 12');
	await expect(page.locator('.totals')).toContainText('50%');
});

test('any interval can be scored, not only the one in progress', async ({ page }) => {
	await setUpShortRun(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();

	// Missing one is the normal case in a real session, so going back has to work.
	const fifth = page.getByRole('button', { name: /^Interval 5,/ });
	await expect(fifth).toContainText('not scored');
	await fifth.click();
	await expect(page.getByRole('button', { name: /^Interval 5, occurred/ })).toBeVisible();

	// Three states, cycling: an interval nobody scored is not the same as one scored as a
	// no, and going round reaches any answer without a second control to clear it.
	await page.getByRole('button', { name: /^Interval 5, occurred/ }).click();
	await expect(page.getByRole('button', { name: /^Interval 5, did not occur/ })).toBeVisible();
	await page.getByRole('button', { name: /^Interval 5, did not occur/ }).click();
	await expect(page.getByRole('button', { name: /^Interval 5, not scored/ })).toBeVisible();
});

test('the tally is thrown away, because it was never a record', async ({ page }) => {
	await setUpShortRun(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await page.getByRole('button', { name: 'Yes', exact: true }).click();
	await expect(page.locator('.totals')).toContainText('1 / 12');

	await page.getByRole('button', { name: 'Stop' }).click();
	await expect(page.locator('[data-timer-status="finished"]')).toBeAttached();
	await expect(page.getByRole('status')).toContainText('this page keeps nothing');

	// Leaving and coming back starts from nothing: no store, no localStorage, no revival.
	await page.goto('/tools');
	await page.goto('/tools/timer');
	await expect(page.locator('[data-timer-status="idle"]')).toBeAttached();
	await expect(page.locator('.strip')).toHaveCount(0);
});

test('the setup is remembered even though the data is not', async ({ page }) => {
	await page.goto('/tools/timer');
	await page.getByRole('radio', { name: /Whole interval/ }).check();
	await page.getByLabel('Interval length').selectOption('30');
	await page.getByLabel('Observation length').selectOption('10');

	await page.reload();
	await expect(page.getByRole('radio', { name: /Whole interval/ })).toBeChecked();
	await expect(page.getByLabel('Interval length')).toHaveValue('30');
	await expect(page.locator('.count')).toContainText('20 intervals');
});

test('sound is off unless somebody turns it on', async ({ page }) => {
	await page.goto('/tools/timer');
	// A beep is audible to the learner and is a change to the environment nobody's plan
	// asked for, so it is never the default.
	await expect(page.getByRole('checkbox', { name: 'Sound' })).not.toBeChecked();
	await expect(page.getByRole('checkbox', { name: 'Vibrate' })).toBeChecked();
});

test('a run in progress is accessible', async ({ page }) => {
	await setUpShortRun(page);
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await page.getByRole('button', { name: 'Yes', exact: true }).click();
	await expect(page.getByRole('timer')).toBeVisible();
	await expectNoA11yViolations(page);
});

test('the timer is reachable from the tools hub', async ({ page }) => {
	await page.goto('/tools');
	await page.getByRole('link', { name: 'Interval timer' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Interval timer' })).toBeVisible();
});
