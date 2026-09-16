import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';

/**
 * The coverage dial on the home page.
 *
 * What is being defended here is a posture, not a picture. The dial reports how much of
 * the outline has been examined; it must never report — in the centre, in the caption, or
 * in the text a screen reader gets — anything that reads as a readiness score. The app
 * has refused to state one everywhere else, and a ring is exactly the shape people expect
 * a score to come in.
 */

const mode = (page: Page, name: RegExp) =>
	page.getByRole('group', { name: 'Show content for' }).getByRole('radio', { name });

const dial = (page: Page) => page.getByRole('img', { name: /exam outline coverage/i });

/*
 * "Everything, with no filter" is the app's default, because this is a reference tool
 * first. The dial is about one exam, so the mode has to name one before there is a ring.
 */
const chooseRBT = async (page: Page) => {
	await mode(page, /Technician \(RBT\)/)
		.first()
		.check();
};

test('the ring is drawn from the outline before any storage is read', async ({ page }) => {
	await page.goto('/');
	await chooseRBT(page);

	// Six arcs, because the RBT outline has six areas. Nothing here depends on history.
	await expect(page.locator('.track circle')).toHaveCount(6);
	// And nothing is filled in, because nothing has been answered.
	await expect(page.locator('.fill circle')).toHaveCount(0);

	await expect(dial(page)).toBeVisible();
	await expect(page.locator('.cockpit')).toContainText('of 43 tasks');
});

test('the centre never shows a percentage', async ({ page }) => {
	await page.goto('/');
	await chooseRBT(page);
	const centre = await page.locator('.big, .unit, .count').allInnerTexts();
	expect(centre.join(' ')).not.toContain('%');
});

test('the accessible description lists the areas rather than summarising the ring', async ({
	page
}) => {
	await page.goto('/');
	await chooseRBT(page);
	const alt = (await dial(page).getAttribute('aria-label')) ?? '';

	// Every area, by name, with its own two numbers.
	for (const area of [
		'Data Collection and Graphing',
		'Behavior Assessment',
		'Behavior Acquisition',
		'Behavior Reduction',
		'Documentation and Reporting',
		'Ethics'
	]) {
		expect(alt).toContain(area);
	}
	expect(alt).toContain('0 of 43 tasks examined');

	// The only percentages are the published exam weights — no overall figure.
	expect(alt.match(/\d+%/g)).toEqual(['17%', '11%', '25%', '19%', '13%', '15%']);
	expect(alt).not.toMatch(/\b(ready|readiness|likely|on track|pass)\b/i);
});

test('the caption says the arcs are weighted, and that a full ring is not a prediction', async ({
	page
}) => {
	await page.goto('/');
	await chooseRBT(page);
	const caption = page.locator('.cockpit .caption');
	await expect(caption).toContainText('sized by what it is worth on the exam');
	await expect(caption).toContainText('not a prediction');
});

test('with no exam date the centre holds the task count instead of a countdown', async ({
	page
}) => {
	await page.goto('/');
	await chooseRBT(page);
	// Scoped to the ring, not the card: a figure row below it may legitimately mention
	// days left in the month, and what is being asserted here is the centre of the dial.
	await expect(page.locator('.cockpit svg')).not.toContainText(/days left/i);
	await expect(page.locator('.big')).toHaveText('0');
	await expect(page.locator('.unit')).toHaveText('of 43 tasks');
	await expect(page.locator('.count')).toHaveCount(0);
});

test('an exam date gives a countdown that survives a reload', async ({ page }) => {
	await page.goto('/');
	await chooseRBT(page);
	await page.locator('.cockpit summary').click();

	// Far enough out that the number is stable whichever day this runs.
	const target = new Date();
	target.setDate(target.getDate() + 40);
	const iso = target.toISOString().slice(0, 10);
	await page.getByLabel(/Date of your RBT exam/).fill(iso);

	await expect(page.locator('.big')).toHaveText('40');
	await expect(page.locator('.unit')).toHaveText('days left');
	// The task count moves down rather than being displaced by the countdown.
	await expect(page.locator('.count')).toContainText('of 43 tasks');
	await expect(dial(page)).toHaveAttribute('aria-label', /^40 days to the RBT exam\./);

	await page.reload();
	await expect(page.locator('.big')).toHaveText('40');
	await expect(page.locator('.cockpit summary')).toContainText('change');
});

test('the ring follows the mode, because the outline does', async ({ page }) => {
	await page.goto('/');
	await mode(page, /Behavior analyst \(BCBA\)/)
		.first()
		.check();

	await expect(page.locator('.track circle')).toHaveCount(9);
	await expect(page.locator('.cockpit')).toContainText('of 104 tasks');

	await mode(page, /Assistant behavior analyst/)
		.first()
		.check();
	await expect(page.locator('.cockpit')).toContainText('of 90 tasks');
});

/*
 * "Everything, with no filter" is a browsing posture, not a study one. Drawing the
 * technician's ring there would be answering a question nobody asked.
 */
test('no exam chosen means no ring, but the mode switch is pointed at', async ({ page }) => {
	await page.goto('/');
	await mode(page, /Everything, with no filter/)
		.first()
		.check();
	await expect(page.getByRole('img', { name: /exam outline coverage/i })).toHaveCount(0);
	await expect(page.locator('.cockpit.pick')).toContainText('Pick RBT, BCaBA or BCBA above');
});

test('answering questions fills the arcs for the areas they came from', async ({ page }) => {
	await page.goto('/');
	await chooseRBT(page);

	/*
	 * The area is set through the URL, which is the quiz page's own way in from /exams.
	 * Setting it with the select races hydration: the page's `onMount` re-applies the
	 * shared filter's domain, so a selection made before hydration is quietly reverted —
	 * and a test that starts by choosing a mode on the home page makes that window wide
	 * enough to hit.
	 */
	await page.goto('/quiz?credential=RBT&domain=C');
	await expect(page.getByLabel('Content area')).toHaveValue('C');
	await page.getByLabel('Number of questions').selectOption('5');
	await page.getByRole('button', { name: 'Start' }).click();

	for (let i = 1; i <= 5; i++) {
		await page.getByRole('radio').first().check();
		await page.getByRole('button', { name: 'Check answer' }).click();
		await page.getByRole('button', { name: i < 5 ? 'Next question' : 'See results' }).click();
	}
	await expect(page.getByRole('heading', { name: /\d of 5 correct/ })).toBeVisible();
	/*
	 * Wait for the write, not for the score.
	 *
	 * The results render before storage has settled — deliberately, so a reader whose
	 * storage is unavailable still sees how they did. Navigating on the heading alone
	 * therefore races the transaction, which is what `data-attempt` exists to make
	 * observable.
	 */
	await expect(page.locator('[data-attempt="saved"]')).toBeAttached();

	await page.goto('/');
	// At least one arc is now part-filled, and the count has moved off zero.
	await expect(page.locator('.fill circle')).not.toHaveCount(0);
	await expect(dial(page)).not.toHaveAttribute('aria-label', /0 of 43 tasks examined/);

	/*
	 * And the fill sits in the area the questions came from. Coverage is a record of
	 * having looked at a part of the outline, so it has to land in the right part.
	 */
	const alt = (await dial(page).getAttribute('aria-label')) ?? '';
	expect(alt).toMatch(/Behavior Acquisition, 25% of the paper: [1-5] of 11 tasks/);
	expect(alt).toContain('Ethics, 15% of the paper: 0 of 10 tasks');

	/*
	 * And it is drawn over that area's own arc rather than somewhere else on the ring.
	 * A filled arc that started at twelve o'clock would look plausible and mean nothing,
	 * so the two strokes are checked to share a rotation and the fill to be the shorter.
	 */
	const arcs = await page.evaluate(() => {
		const read = (sel: string) =>
			[...document.querySelectorAll(sel)].map((c) => ({
				length: Number(c.getAttribute('stroke-dasharray')?.split(' ')[0]),
				at: c.getAttribute('transform')
			}));
		return { track: read('.track circle'), fill: read('.fill circle') };
	});
	for (const f of arcs.fill) {
		const twin = arcs.track.find((t) => t.at === f.at);
		expect(twin, 'every filled arc sits on a real segment').toBeDefined();
		expect(f.length).toBeGreaterThan(0);
		expect(f.length).toBeLessThanOrEqual(twin!.length);
	}
});

/*
 * The sweeps do not reach this state on their own.
 *
 * `e2e/a11y.spec.ts` and `e2e/reflow.spec.ts` visit every route with no stored choices,
 * and the app's default mode is "Everything" — so the dial is never drawn during either
 * sweep. Left alone, the one piece of graphics on the home page would be the one piece of
 * the app nobody checked, which is how a ring that clipped its own labels got as far as a
 * screenshot. These run the same checks against the state the sweeps miss.
 */
test.describe('the dial under the same sweeps as everything else', () => {
	const openEverything = async (page: Page) => {
		await page.goto('/');
		await chooseRBT(page);
		// The date panel open, because a collapsed panel is not swept either.
		await page.locator('.cockpit summary').click();
		await expect(page.getByLabel(/Date of your RBT exam/)).toBeVisible();
	};

	test('no axe violations, light', async ({ page }) => {
		await openEverything(page);
		await expectNoA11yViolations(page);
	});

	test('no axe violations, dark', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await openEverything(page);
		await expectNoA11yViolations(page);
	});

	test('no axe violations at 320px', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 720 });
		await openEverything(page);
		await expectNoA11yViolations(page);
	});

	test('no horizontal scrolling at 320px', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 720 });
		await openEverything(page);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(1);
	});

	test('the date control clears the 24px target floor', async ({ page }) => {
		await openEverything(page);
		const small = await page.evaluate(() => {
			const out: string[] = [];
			for (const el of document.querySelectorAll(
				'.cockpit a, .cockpit input, .cockpit summary'
			)) {
				const r = el.getBoundingClientRect();
				if (r.width === 0 && r.height === 0) continue;
				if (r.width < 24 || r.height < 24) {
					out.push(
						`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`
					);
				}
			}
			return out;
		});
		expect(small).toEqual([]);
	});

	/*
	 * The ring has to survive Windows High Contrast, where our own palette is thrown away.
	 * Without the forced-colors block both strokes would come back the same system colour
	 * and the dial would say nothing at all.
	 */
	test('the two strokes are still different colours under a forced palette', async ({
		page
	}) => {
		await page.emulateMedia({ forcedColors: 'active' });
		await page.goto('/quiz?credential=RBT&domain=C');
		await expect(page.getByLabel('Content area')).toHaveValue('C');
		await page.getByLabel('Number of questions').selectOption('5');
		await page.getByRole('button', { name: 'Start' }).click();
		for (let i = 1; i <= 5; i++) {
			await page.getByRole('radio').first().check();
			await page.getByRole('button', { name: 'Check answer' }).click();
			await page
				.getByRole('button', { name: i < 5 ? 'Next question' : 'See results' })
				.click();
		}
		await expect(page.locator('[data-attempt="saved"]')).toBeAttached();

		await page.goto('/');
		await chooseRBT(page);
		await expect(page.locator('.fill circle').first()).toBeVisible();

		const strokes = await page.evaluate(() => ({
			track: getComputedStyle(document.querySelector('.track circle')!).stroke,
			fill: getComputedStyle(document.querySelector('.fill circle')!).stroke
		}));
		expect(strokes.track).not.toBe(strokes.fill);
	});
});
