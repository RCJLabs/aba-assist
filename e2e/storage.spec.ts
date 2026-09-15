import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations } from './utils/a11y';

/**
 * Backup, restore and persistence.
 *
 * The failure this guards against is documented and specific: Safari and iOS clear a
 * non-installed site's storage after about a week of inactivity, and the reader who
 * studies once a week is exactly who spaced repetition is for. Until this existed the app
 * had no export, no import and no way to delete — `exportAll` and `clearAll` had no
 * callers at all.
 */

async function gradeOneCard(page: Page): Promise<void> {
	await page.goto('/study');
	await page.getByRole('button', { name: 'Start' }).click();
	await page
		.getByRole('button', { name: /Show|Reveal/ })
		.first()
		.click();
	await page.getByRole('button', { name: 'Good' }).click();
}

async function openSettings(page: Page): Promise<void> {
	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Your data' })).toBeVisible();
}

test('a backup round-trips through a real file', async ({ page }, testInfo) => {
	await gradeOneCard(page);
	await openSettings(page);

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download a backup' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/^aba-assist-backup-\d{4}-\d{2}-\d{2}\.json$/);
	const path = testInfo.outputPath('backup.json');
	await file.saveAs(path);

	await expect(page.getByRole('status')).toContainText('Backup downloaded');
	await expect(page.locator('.age')).toContainText('Last backup: today');

	// Wipe it, then bring it back from the file.
	await page.getByRole('button', { name: 'Delete my data' }).click();
	await page.getByRole('button', { name: 'Yes, delete it all' }).click();
	await expect(page.getByRole('status')).toContainText('has been deleted');

	await page.setInputFiles('input[type="file"]', path);
	await expect(page.getByText('Restoring replaces everything')).toBeVisible();
	await page.getByRole('button', { name: 'Replace my data' }).click();
	await expect(page.getByRole('status')).toContainText(/Restored \d+ record/);

	// The card is genuinely back: the deck knows it has been seen.
	await page.goto('/study');
	await expect(page.locator('.stats')).toContainText('Learned');
});

test('restoring asks first, and cancelling changes nothing', async ({ page }, testInfo) => {
	await gradeOneCard(page);
	await openSettings(page);
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download a backup' }).click();
	const path = testInfo.outputPath('b.json');
	await (await download).saveAs(path);

	await page.setInputFiles('input[type="file"]', path);
	const dialog = page.getByRole('alertdialog');
	await expect(dialog).toContainText('cannot be undone');
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('alertdialog')).toHaveCount(0);
	// The status still reports the export that preceded this, not a restore that happened.
	await expect(page.getByRole('status')).toContainText('Backup downloaded');
	await expect(page.getByRole('status')).not.toContainText('Restored');
});

test('a file this app did not write is refused with a usable message', async ({
	page
}, testInfo) => {
	await openSettings(page);
	const path = testInfo.outputPath('not-ours.json');
	await page.evaluate(() => {});
	const fs = await import('node:fs/promises');
	await fs.writeFile(path, JSON.stringify({ invoices: [1, 2, 3] }));

	await page.setInputFiles('input[type="file"]', path);
	await page.getByRole('button', { name: 'Replace my data' }).click();
	// Names what to do instead, rather than just failing.
	await expect(page.getByRole('status')).toContainText('not exported by this app');
});

test('a restore that lost rows says so instead of looking clean', async ({
	page
}, testInfo) => {
	await openSettings(page);
	const path = testInfo.outputPath('partly-bad.json');
	const fs = await import('node:fs/promises');
	await fs.writeFile(
		path,
		JSON.stringify({
			kind: 'aba-assist-backup',
			version: 1,
			exportedAt: Date.now(),
			cards: [
				{
					id: 'ok',
					due: 1,
					stability: 1,
					difficulty: 1,
					reps: 1,
					lapses: 0,
					state: 2
				},
				{ id: 'broken' }
			],
			// A name where a code belongs: the structural PHI guard has to hold here too.
			supervisees: [{ id: 's1', code: 'Jamie Rivera', role: 'RBT' }]
		})
	);

	await page.setInputFiles('input[type="file"]', path);
	await page.getByRole('button', { name: 'Replace my data' }).click();
	await expect(page.getByRole('status')).toContainText('Restored 1 record');
	const report = page.getByRole('note').filter({ hasText: 'could not be restored' });
	await expect(report).toBeVisible();
	// Both the corrupt row and the one carrying a name where a code belongs.
	await expect(report).toContainText('1 from cards');
	await expect(report).toContainText('does not store names');
});

test('the study page nudges somebody who has never backed up', async ({ page }) => {
	await gradeOneCard(page);
	// Leave the session so the nudge is not competing with a card.
	await page.goto('/study');
	const nudge = page.getByRole('note').filter({ hasText: 'never been backed up' });
	await expect(nudge).toBeVisible();
	await expect(nudge.getByRole('link', { name: 'Back it up' })).toBeVisible();

	await nudge.getByRole('button', { name: 'Not now' }).click();
	await expect(nudge).toHaveCount(0);
});

test('the nudge stays quiet for somebody who has nothing stored', async ({ page }) => {
	await page.goto('/study');
	await expect(page.getByRole('note').filter({ hasText: 'backed up' })).toHaveCount(0);
});

test('settings reports whether the browser will keep the data', async ({ page }) => {
	await openSettings(page);
	const box = page.locator('.storage');
	await expect(box).toBeVisible();
	// Whatever the browser said, the answer is a sentence — never a silent unknown.
	await expect(box).not.toHaveAttribute('data-persist', 'unknown');
	await expect(box.locator('h3')).toHaveText('Is it safe here?');
});

test('the backup section is accessible', async ({ page }) => {
	await gradeOneCard(page);
	await openSettings(page);
	await expectNoA11yViolations(page);
});
