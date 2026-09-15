import { expect, test } from '@playwright/test';

/**
 * The competency assessment page.
 *
 * The technician credential needs a performance assessment as well as a paper, and this
 * is the half nothing in this market prepares people for. What the page must get right:
 * every task is listed and numbered as the form numbers them, it never claims to be the
 * assessment itself, and the one task this app refuses to teach says so plainly.
 */

test('lists all nineteen tasks, numbered as the form numbers them', async ({ page }) => {
	await page.goto('/competency');
	await expect(page.locator('.task')).toHaveCount(19);
	const numbers = await page
		.locator('.task')
		.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-task'))));
	expect(numbers).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
});

test('says which methods each task accepts', async ({ page }) => {
	await page.goto('/competency');
	// Dignity is an interview task; discrete-trial teaching is performed.
	await expect(page.locator('[data-task="16"]')).toContainText('Interview');
	await expect(page.locator('[data-task="16"]')).not.toContainText('With a client');
	await expect(page.locator('[data-task="6"]')).toContainText('With a client');
	await expect(page.locator('[data-task="6"]')).toContainText('Role-play');
});

test('the crisis task points at the employer protocol rather than teaching it', async ({
	page
}) => {
	/*
	 * The line this app holds everywhere else, held here too. Crisis and physical
	 * management need certified hands-on training and cannot be learned from reading, so
	 * the one task on the list this app will not prepare you for says so.
	 */
	await page.goto('/competency');
	const crisis = page.locator('[data-task="13"]');
	await expect(crisis).toContainText('does not prepare you for');
	await expect(crisis.locator('.policy')).toContainText("employer's protocol");
});

test('offers the choice on the task that has one', async ({ page }) => {
	await page.goto('/competency');
	const choice = page.locator('[data-task="14"]');
	await expect(choice.locator('.alts > li')).toHaveCount(3);
	await expect(choice).toContainText('Antecedent Interventions');
	await expect(choice).toContainText('Differential Reinforcement');
	await expect(choice).toContainText('Extinction');
});

test('says the section rule about demonstrating with a client', async ({ page }) => {
	await page.goto('/competency');
	await expect(page.locator('.rule')).toContainText('Three of the nine');
});

test('tracks readiness, and is honest that it certifies nothing', async ({ page }) => {
	await page.goto('/competency');
	await expect(page.locator('.caution')).toContainText('certifies nothing');
	await expect(page.locator('.progress')).toContainText('0 of 19');

	await page.locator('[data-task="1"] input[type="checkbox"]').check();
	await expect(page.locator('.progress')).toContainText('1 of 19');

	// It survives a reload, because a candidate works through this over weeks.
	await page.reload();
	await expect(page.locator('[data-task="1"] input[type="checkbox"]')).toBeChecked();
	await expect(page.locator('.progress')).toContainText('1 of 19');
});

test('links each task to the material for it', async ({ page }) => {
	await page.goto('/competency');
	await page.locator('[data-task="8"]').getByRole('link', { name: 'Task Analysis' }).click();
	await expect(page).toHaveURL(/\/glossary\/task-analysis$/);
});

test('states how the assessment runs, and whose document it is', async ({ page }) => {
	await page.goto('/competency');
	await expect(page.locator('.rules dt')).not.toHaveCount(0);
	await expect(page.locator('.rules')).toContainText('ninety days');
	await expect(page.locator('.source')).toContainText('every description here is ours');
});

test('is reachable from home', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: /Competency assessment/ }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Initial Competency Assessment'
	);
});
