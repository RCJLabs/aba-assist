import { expect, test, type Page } from '@playwright/test';

/**
 * The graph-construction drill.
 *
 * The scoring arithmetic is covered in `plot.test.ts` over two hundred generated sheets
 * and is not re-checked here. What only a browser can answer: whether the data sheet a
 * reader is copying from is the one they are scored against, whether the controls put a
 * point where they said, and whether the two graphs on the result screen are drawn from
 * different answers rather than the same one twice.
 */

/** Read the sheet off the page, which is the only place the reader can see it either. */
async function readSheet(page: Page) {
	const rows = await page.locator('tbody tr').all();
	return Promise.all(
		rows.map(async (row) => {
			const cells = await row.locator('td').allInnerTexts();
			return {
				x: Number((await row.locator('th').innerText()).trim()),
				y: cells[0].trim() === '—' ? null : Number(cells[0].trim()),
				phase: cells[1].trim()
			};
		})
	);
}

/** Draw the sheet correctly, using only the controls a keyboard user has. */
async function drawPerfectly(page: Page) {
	const sheet = await readSheet(page);
	for (const cell of sheet) {
		await page
			.getByRole('button', { name: new RegExp(`^${cell.x}\\b`) })
			.first()
			.click();
		if (cell.y === null) continue;
		// Up from the middle, or down to it: the stepper starts unplotted columns at half.
		const middle = 5;
		const steps = cell.y - middle;
		for (let i = 0; i < Math.abs(steps) + (steps === 0 ? 1 : 0); i++) {
			await page.getByRole('button', { name: steps >= 0 ? 'Up one' : 'Down one' }).click();
		}
		// One nudge each way lands back on the middle when the target is the middle.
		if (steps === 0) await page.getByRole('button', { name: 'Down one' }).click();
	}
	const lastBaseline = sheet.filter((c) => c.phase === 'Baseline').length;
	await page
		.getByRole('button', {
			name: new RegExp(`^${lastBaseline}\\s*and\\s*${lastBaseline + 1}$`)
		})
		.click();
	return sheet;
}

test('a graph drawn from the sheet scores full marks', async ({ page }) => {
	await page.goto('/drills/graph');
	await expect(page.locator('[data-plot-status="drawing"]')).toBeAttached({ timeout: 30_000 });

	const sheet = await drawPerfectly(page);
	await page.getByRole('button', { name: 'Check my graph' }).click();
	await expect(page.locator('[data-plot-status="done"]')).toBeAttached();

	await expect(page.locator('[data-percent="100"]')).toBeVisible();
	await expect(page.locator('[data-fault="none"]')).toBeVisible();
	// Nine decisions: eight sessions and the line, however many of them had values.
	await expect(page.locator('.result h2')).toContainText(
		`${sheet.length + 1} of ${sheet.length + 1}`
	);
});

test('the phase line in the wrong gap is marked, and the drawn path shows why', async ({
	page
}) => {
	await page.goto('/drills/graph');
	await expect(page.locator('[data-plot-status="drawing"]')).toBeAttached({ timeout: 30_000 });

	const sheet = await readSheet(page);
	const lastBaseline = sheet.filter((c) => c.phase === 'Baseline').length;
	// Everything left blank on purpose; only the line is being tested.
	const wrong = lastBaseline === 1 ? 2 : lastBaseline - 1;
	await page
		.getByRole('button', { name: new RegExp(`^${wrong}\\s*and\\s*${wrong + 1}$`) })
		.click();
	await page.getByRole('button', { name: 'Check my graph' }).click();

	await expect(page.locator('[data-fault="boundary"]')).toContainText(
		`between sessions ${lastBaseline} and ${lastBaseline + 1}`
	);
	// Two graphs, drawn from two different answers rather than the truth rendered twice.
	await expect(page.locator('[data-plot="yours"]')).toBeVisible();
	await expect(page.locator('[data-plot="truth"]')).toBeVisible();
	const theirs = await page.locator('[data-plot="yours"] .data').innerHTML();
	const truth = await page.locator('[data-plot="truth"] .data').innerHTML();
	expect(theirs).not.toBe(truth);
});

test('leaving every column alone is scored as missing them, not as blanks got right', async ({
	page
}) => {
	await page.goto('/drills/graph');
	await expect(page.locator('[data-plot-status="drawing"]')).toBeAttached({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Check my graph' }).click();
	await expect(page.locator('[data-plot-status="done"]')).toBeAttached();
	await expect(page.locator('[data-fault="missing"]').first()).toBeVisible();
});

test('a finished graph reaches progress and stays out of the other drill figures', async ({
	page
}) => {
	await page.goto('/drills/graph');
	await expect(page.locator('[data-plot-status="drawing"]')).toBeAttached({ timeout: 30_000 });
	await drawPerfectly(page);
	await page.getByRole('button', { name: 'Check my graph' }).click();
	await expect(page.locator('[data-sitting="saved"]')).toBeVisible({ timeout: 10_000 });

	await page.goto('/progress');
	await expect(page.locator('[data-progress-status="ready"]')).toBeAttached({
		timeout: 30_000
	});
	await expect(page.locator('body')).toContainText(/100%\s+across 1\s+graph/);
	/*
	 * Three kinds now share one store. A graph sitting counted into either of the others
	 * would render a percentage that looks entirely reasonable and measures nothing.
	 */
	await expect(page.locator('body')).toContainText(/No drill sittings yet/i);
	await expect(page.locator('body')).toContainText(/No recording sittings yet/i);
});
