import { expect, test, type Page } from '@playwright/test';

/**
 * One code's block on the index. Anchored on its own heading rather than on its text,
 * because each code's prose can legitimately name the other one.
 */
function codeBlock(page: Page, shortName: string) {
	return page
		.locator('.code')
		.filter({ has: page.getByRole('heading', { level: 2, name: shortName, exact: true }) });
}

/*
 * The ethics reference is the part of this app most likely to be read by someone who is
 * worried, so these tests check the honesty machinery as much as the navigation: every
 * standard number on screen has to be one that was read from the code document, the
 * wording has to be ours, and the real code has to be one link away.
 */

test('the ethics index lists both codes, their principles and their sections', async ({
	page
}) => {
	await page.goto('/ethics');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ethics');
	await expect(page.getByRole('heading', { level: 2, name: /RBT Ethics Code/ })).toBeVisible();
	await expect(
		page.getByRole('heading', { level: 2, name: /Ethics Code for Behavior Analysts/ })
	).toBeVisible();

	// Verified structure: three sections for the technician code, six for the analyst code.
	const rbtCode = codeBlock(page, 'RBT Ethics Code (2.0)');
	const analystCode = codeBlock(page, 'Ethics Code for Behavior Analysts');
	await expect(rbtCode.locator('.sec')).toHaveCount(3);
	await expect(analystCode.locator('.sec')).toHaveCount(6);

	// Both codes link out rather than reproducing their text.
	const official = page.getByRole('link', { name: 'Read the code itself' });
	await expect(official).toHaveCount(2);
	await expect(official.first()).toHaveAttribute('href', /bacb\.com/);
});

test('the index lists every standard of both codes, in our own words', async ({ page }) => {
	await page.goto('/ethics');

	// Nothing claims an unverified number any more, and both codes say what was checked.
	await expect(page.getByText(/Standard numbers are not listed/)).toHaveCount(0);
	await expect(page.getByText(/read from the code document itself/)).toHaveCount(2);

	const rbtCode = codeBlock(page, 'RBT Ethics Code (2.0)');
	const analystCode = codeBlock(page, 'Ethics Code for Behavior Analysts');

	// 29 standards across three sections, and 85 across six — the counts in the documents.
	await expect(rbtCode.locator('.stds dl div')).toHaveCount(29);
	await expect(analystCode.locator('.stds dl div')).toHaveCount(85);

	// Collapsed by default, so 114 standards do not bury the topics somebody came for.
	const first = rbtCode.locator('details.stds').first();
	await expect(first.locator('dl')).toBeHidden();
	await first.locator('summary').click();
	await expect(first.locator('dl')).toBeVisible();
	await expect(first).toContainText('1.11');
});

test('the credential switcher narrows the topics on offer', async ({ page }) => {
	await page.goto('/ethics');
	const all = await page.locator('.topics li').count();

	await page.getByRole('button', { name: 'Technician' }).click();
	await expect(page.locator('.count')).toContainText('that bind technicians');
	const rbt = await page.locator('.topics li').count();
	expect(rbt).toBeGreaterThan(0);
	expect(rbt).toBeLessThan(all);

	await page.getByRole('button', { name: 'Analyst' }).click();
	await expect(page.locator('.count')).toContainText('that bind analysts');

	// The choice is the shared exam filter, so it survives a reload.
	await page.reload();
	await expect(page.locator('.count')).toContainText('that bind analysts');
});

test('a topic page carries the obligation, the pitfalls, and where to go when unsure', async ({
	page
}) => {
	await page.goto('/ethics/gifts');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Gifts/);
	await expect(page.getByRole('heading', { name: 'What this looks like' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Where people get caught' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'If you are not sure' })).toBeVisible();

	// Every topic routes an unresolved question to a person, not to this app.
	await expect(page.locator('.unsure')).toContainText(/supervisor|policy/i);

	// It names the section it sits under and the standards it covers, each with the label
	// we wrote for it rather than the code's own heading.
	await expect(page.locator('.codes')).toContainText('Section 1');
	await expect(page.locator('.codes')).toContainText('1.11');
	await expect(page.locator('.codes')).toContainText('1.12');
	await expect(page.locator('.codes')).not.toContainText('Standard numbers not listed');
	await expect(page.locator('.codes .stds li').first()).toContainText(/[a-z]{4}/);

	await expect(page.getByRole('link', { name: /Report it/ })).toHaveAttribute(
		'href',
		/github\.com\/RCJLabs\/aba-assist\/issues\/new/
	);
});

test('a topic toggles between the full explanation and plain language', async ({ page }) => {
	await page.goto('/ethics/confidentiality-and-records');
	const full = page.locator('.summary:not(.plain)');
	const plain = page.locator('.summary.plain');
	await expect(full).toBeVisible();
	await expect(plain).toBeHidden();
	await page.getByRole('button', { name: /plain language/i }).click();
	await expect(plain).toBeVisible();
	await expect(full).toBeHidden();
});

test('topics cross-link to terms, situations and each other', async ({ page }) => {
	await page.goto('/ethics/mandated-reporting');
	await page.getByRole('link', { name: 'Mandated Reporter' }).click();
	await expect(page).toHaveURL(/\/glossary\/mandated-reporter$/);

	await page.goto('/ethics/mandated-reporting');
	await page.getByRole('link', { name: /suspect a learner is being abused/i }).click();
	await expect(page).toHaveURL(/\/scenarios\//);
	await expect(page.getByText(/Stop and escalate/i)).toBeVisible();
});

test('technician topics are reachable from the urgent page and the home page', async ({
	page
}) => {
	await page.goto('/help');
	await page.getByRole('link', { name: 'Ethics', exact: true }).click();
	await expect(page).toHaveURL(/\/ethics$/);

	await page.goto('/');
	await page.locator('.tile').filter({ hasText: 'Ethics' }).click();
	await expect(page).toHaveURL(/\/ethics$/);
});
