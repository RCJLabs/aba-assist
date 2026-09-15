import { expect, test, type Page } from '@playwright/test';

/**
 * The abbreviation list.
 *
 * Its whole reason to exist is the three-second lookup: somebody heard "MSWO" and needs it
 * decoded before the conversation moves on. So the properties worth holding are that the
 * letters are findable without knowing the words, that an abbreviation meaning two things
 * says so rather than picking one, and that it never claims letters stand for something
 * they do not.
 */

/** The definition half of one entry, keyed by the abbreviation it decodes. */
const meaning = (page: Page, abbr: string) => page.locator(`dd[data-abbr="${abbr}"]`);

test('decodes an abbreviation and links to the entry', async ({ page }) => {
	await page.goto('/abbreviations');
	const dro = meaning(page, 'DRO');
	await expect(dro).toContainText('Differential Reinforcement of Other Behavior');
	await dro.getByRole('link').first().click();
	await expect(page).toHaveURL(/\/glossary\/differential-reinforcement-of-other-behavior$/);
});

test('is a real definition list, not a table of divs', async ({ page }) => {
	// The roles are what a screen reader navigates this page by.
	await page.goto('/abbreviations');
	await expect(page.getByRole('term').first()).toBeVisible();
	await expect(page.getByRole('definition').first()).toBeVisible();
});

test('filters as you type, by letters or by words', async ({ page }) => {
	await page.goto('/abbreviations');
	const field = page.getByLabel('Find an abbreviation');

	await field.fill('msw');
	await expect(page.getByRole('term')).toHaveCount(2); // MSW and MSWO
	await expect(meaning(page, 'MSW')).toBeVisible();

	// Somebody who remembers the words but not the letters still gets there.
	await field.fill('momentary');
	await expect(page.getByRole('term')).toHaveCount(1);
	await expect(page.getByRole('term')).toHaveText(/MTS/);
});

test('an abbreviation with two meanings shows both and says so', async ({ page }) => {
	await page.goto('/abbreviations');
	await page.getByLabel('Find an abbreviation').fill('MTS');
	await expect(page.getByRole('term')).toHaveCount(1);
	await expect(page.getByRole('term')).toContainText('two meanings');

	// Matching-to-Sample and Momentary Time Sampling are different things sharing letters.
	const mts = meaning(page, 'MTS');
	await expect(mts).toContainText('Matching-to-Sample');
	await expect(mts).toContainText('Momentary Time Sampling');
	await expect(mts.getByRole('listitem')).toHaveCount(2);
	// Both are genuine expansions, so neither is demoted to "related".
	await expect(mts.getByText('related')).toHaveCount(0);
});

test('the two reinforcement notations are never merged', async ({ page }) => {
	// SR+ and SR- are opposites; one entry for both would be the worst error this page
	// could make, and normalising punctuation away is exactly how it would happen.
	await page.goto('/abbreviations');
	await page.getByLabel('Find an abbreviation').fill('sr');
	await expect(page.getByRole('term')).toHaveCount(2);
	await expect(meaning(page, 'SR+')).toContainText('Positive Reinforcement');
	await expect(meaning(page, 'SR-')).toContainText('Negative Reinforcement');
	// Notation spells nothing out, but it is not "related" either — it is what the
	// letters mean, and the only sense here should not be hedged.
	await expect(meaning(page, 'SR+').getByText('related')).toHaveCount(0);
});

test('a term the letters only point at is marked, not asserted', async ({ page }) => {
	await page.goto('/abbreviations');
	await page.getByLabel('Find an abbreviation').fill('MSWO');

	// MSWO is a kind of preference assessment, not another name for one.
	const mswo = meaning(page, 'MSWO');
	const first = mswo.getByRole('listitem').first();
	await expect(first).toContainText('Multiple-Stimulus Without Replacement');
	await expect(first).not.toContainText('related');
	await expect(mswo.getByRole('listitem').nth(1)).toContainText('related');

	// And FA must never be presented as standing for Functional Behavior Assessment.
	await page.getByLabel('Find an abbreviation').fill('FA');
	const fa = meaning(page, 'FA').getByRole('listitem');
	await expect(fa.first()).toContainText('Functional Analysis');
	await expect(fa.first()).not.toContainText('related');
	await expect(fa.nth(1)).toContainText('Functional Behavior Assessment');
	await expect(fa.nth(1)).toContainText('related');
});

test('says what it does not cover rather than looking complete', async ({ page }) => {
	await page.goto('/abbreviations');
	await expect(page.locator('.scope')).toContainText("this app's glossary");

	await page.getByLabel('Find an abbreviation').fill('zzzz');
	await expect(page.getByRole('term')).toHaveCount(0);
	await expect(page.locator('.empty')).toContainText('will not have everything');
});

test('is reachable from home and from the glossary', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: /Abbreviations/ }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Abbreviations');

	await page.goto('/glossary');
	await page.getByRole('link', { name: 'The abbreviation list' }).click();
	await expect(page).toHaveURL(/\/abbreviations$/);
});
