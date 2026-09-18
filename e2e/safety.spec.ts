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
	await expect(page.getByText(/988/).first()).toBeVisible();
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
	await expect(link).toHaveAttribute('href', /github\.com\/RCJLabs\/aba-assist\/issues\/new/);
});

/*
 * The refusal card the app most needs to have, and the navigation the page needs now that
 * it carries twelve of them.
 */

test('the restraint card exists, names what it refuses, and gives no procedure', async ({
	page
}) => {
	await page.goto('/scenarios/you-have-been-told-to-restrain-or-seclude-a-learner');

	// It has to be findable by the word somebody would use, and has to refuse rather than
	// instruct. Both halves matter: a card nobody recognises is a card nobody opens.
	await expect(page.getByRole('heading', { level: 1 })).toContainText(/restrain/i);
	await expect(page.getByText(/Stop and escalate/i)).toBeVisible();
	await expect(page.locator('article ol')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Contact now' })).toBeVisible();

	// Nothing on the page may describe how it is done.
	const body = (await page.locator('main').innerText()).toLowerCase();
	for (const phrase of ['hold them', 'holding', 'prone', 'supine', 'takedown', 'floor hold']) {
		expect(body, phrase).not.toContain(phrase);
	}
});

test('searching for restraint reaches the card that refuses', async ({ page }) => {
	await page.goto('/');
	await page.getByLabel('Search terms').fill('restraint');
	await expect(page.locator('[data-search-status="ready"]')).toBeAttached({ timeout: 30_000 });
	await expect(
		page.locator('.results a', { hasText: /told to restrain or seclude/i })
	).toBeVisible();
});

test('the urgent page puts the emergency cards first and can be jumped through', async ({
	page
}) => {
	await page.goto('/help');

	const jump = page.getByRole('navigation', { name: 'Jump to' });
	const links = jump.getByRole('link');
	const cards = page.locator('article.card');
	await expect(links).toHaveCount(await cards.count());

	// Every card routing to emergency services or the crisis line sits above every card
	// that does not. Alphabetical order would bury a seizure behind a medication question.
	const urgent = await cards.evaluateAll((els) =>
		els.map((el) => /\(911\)|\(988\)/.test(el.textContent ?? ''))
	);
	expect(urgent.indexOf(false)).toBeGreaterThan(urgent.lastIndexOf(true));

	// And the jump list actually lands on a card.
	await links.last().click();
	const target = await links.last().getAttribute('href');
	await expect(page.locator(target!)).toBeInViewport();
});

test('everyday situations are grouped rather than listed as two dozen titles', async ({
	page
}) => {
	await page.goto('/scenarios');
	await expect(page.getByRole('heading', { name: 'In the session' })).toBeVisible();
	await expect(
		page.getByRole('heading', { name: 'Your supervisor, and what is yours to decide' })
	).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Records and paperwork' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'At school' })).toBeVisible();

	// Every situation appears exactly once across the groups.
	const links = page.locator('ul li a');
	const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
	expect(new Set(hrefs).size).toBe(hrefs.length);
});

test('the app states what it costs, and there is no account to make', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByRole('heading', { name: 'What it costs' })).toBeVisible();
	await expect(
		page.getByText(/no paid tier, no trial, no advertising and no analytics/i)
	).toBeVisible();
});

test('using the app sends nothing to anybody', async ({ page, baseURL }) => {
	/*
	 * The about page claims this in words, so something has to hold it to the claim. A
	 * tracker added later would be one script tag and would break no other test in the
	 * suite — it would simply start reporting what people study, on an app whose whole
	 * position is that it does not.
	 *
	 * Written as "no request leaves this origin" rather than a blocklist of known analytics
	 * hosts, because the hosts worth catching are the ones nobody thought to list.
	 */
	const origin = new URL(baseURL ?? 'http://localhost:4173').origin;
	const offsite: string[] = [];
	page.on('request', (req) => {
		const url = req.url();
		// data: and blob: are the page talking to itself; they reach no network.
		if (url.startsWith('data:') || url.startsWith('blob:')) return;
		if (!url.startsWith(origin)) offsite.push(`${req.method()} ${url}`);
	});

	// Real use, across the features that would be worth reporting on if anybody were.
	await page.goto('/');
	// Search specifically, because it is the one feature that fetches anything after load.
	await page.getByLabel('Search terms').fill('reinforcement');
	await expect(page.locator('[data-search-status="ready"]')).toBeAttached({ timeout: 30_000 });
	await expect(page.locator('.results li').first()).toBeVisible();

	await page.goto('/quiz');
	await expect(page.locator('.setup')).toContainText(/\d+\s+questions available/);
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();
	await page.getByRole('radio').first().check();
	await page.getByRole('button', { name: 'Check answer' }).click();

	await page.goto('/study');
	await page.goto('/tools/supervision');
	await page.goto('/progress');

	expect(offsite).toEqual([]);
});

test('the app says when its restated facts are due to be checked again', async ({ page }) => {
	/*
	 * The claim this app makes is that its facts are current, and the honest version of
	 * that claim names the date each one was last good for. The build refuses a volatile
	 * file with no date and refuses to call itself a release once one has passed; this is
	 * the half a reader can see.
	 */
	await page.goto('/about');
	await expect(
		page.getByRole('heading', { name: 'When these facts get checked again' })
	).toBeVisible();

	const rows = page.locator('table.schedule tbody tr');
	// Three outlines, three credentials, two ethics codes, one competency model.
	await expect(rows).toHaveCount(9);
	// Every one carries a date; "not set" would mean the build rule had stopped working.
	await expect(page.locator('table.schedule')).not.toContainText('not set');
	await expect(rows.first()).toContainText(/\d{4}-\d{2}-\d{2}/);
});
