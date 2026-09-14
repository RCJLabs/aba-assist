import { expect, test } from '@playwright/test';

/*
 * These assert the product's safety posture as user-visible behavior. The build-time
 * validator stops bad content being authored; these stop a UI change from quietly
 * dropping the refusal, the escalation routing, or the non-affiliation statement.
 */

test('the urgent page is reachable from every route', async ({ page }) => {
	for (const route of ['/', '/glossary', '/scenarios', '/about']) {
		await page.goto(route);
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Urgent' })
		).toBeVisible();
	}
});

test('the urgent page leads with emergency services and refuses to give procedure', async ({
	page
}) => {
	await page.goto('/help');
	await expect(page.getByText(/call 911 now/i)).toBeVisible();
	await expect(page.getByText(/988/)).toBeVisible();
	await expect(
		page.getByRole('heading', { name: /will not tell you what to do physically/i })
	).toBeVisible();
});

test('an escalation scenario shows contacts and documentation, never steps', async ({
	page
}) => {
	await page.goto('/scenarios/learner-is-injuring-themselves');
	await expect(page.getByText(/Stop and escalate/i)).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Contact now' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Write down' })).toBeVisible();

	// An escalation card must never render a numbered procedure.
	await expect(page.locator('article ol')).toHaveCount(0);
});

test('a guidance scenario does show steps', async ({ page }) => {
	await page.goto('/scenarios/learner-pushes-materials-away');
	await expect(page.locator('article ol li').first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'What not to do' })).toBeVisible();
});

test('the non-affiliation and not-clinical-advice statements are present', async ({
	page
}) => {
	await page.goto('/about');
	await expect(page.getByText(/not clinical advice/i).first()).toBeVisible();
	await expect(
		page.getByText(/not affiliated with, endorsed by, or sponsored by/i)
	).toBeVisible();
	await expect(page.getByText(/stores no client information/i)).toBeVisible();
});

test('unreviewed content is visibly marked as such', async ({ page }) => {
	await page.goto('/glossary/negative-reinforcement');
	await expect(page.getByText(/has not yet been through clinical review/i)).toBeVisible();
});

test('every term page shows its sources', async ({ page }) => {
	await page.goto('/glossary/motivating-operation');
	await expect(page.getByRole('heading', { name: 'Written from' })).toBeVisible();
	await expect(page.getByText('michael-1982')).toBeVisible();
});

test('every term page offers a working errata link', async ({ page }) => {
	await page.goto('/glossary/extinction');
	const link = page.getByRole('link', { name: /report it/i });
	await expect(link).toHaveAttribute('href', /github\.com\/RCJLabs\/aba-help\/issues\/new/);
});
