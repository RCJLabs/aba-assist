import { expect, test, type Page } from '@playwright/test';
import { ROUTES } from './utils/routes';

/**
 * WCAG 2.2 AA, 1.4.10 Reflow: no horizontal scrolling at 320 CSS pixels.
 *
 * This was in the plan from the start and had never been tested, so it broke without
 * anybody noticing: the quiz page's exam picker is as wide as its longest option — "RBT —
 * Registered Behavior Technician" — and a grid item's default `min-width: auto` let it
 * push past the track. `overflow-x: hidden` on the body then clipped the result rather
 * than revealing it, so on a phone the control simply had no right-hand edge.
 *
 * Measuring `scrollWidth` alone would have missed exactly that case, which is why this
 * also walks the elements and reports which one sticks out.
 */

const PHONE = { width: 320, height: 720 };

async function overflowing(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const limit = document.documentElement.clientWidth;
		const out: string[] = [];
		for (const el of document.querySelectorAll('main *')) {
			const r = el.getBoundingClientRect();
			// A one-pixel tolerance: sub-pixel layout rounding is not an overflow.
			if (r.width > 0 && r.right > limit + 1) {
				const cls = String((el as HTMLElement).className || '').split(' ')[0];
				out.push(
					`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} (right ${Math.round(r.right)} > ${limit})`
				);
			}
		}
		return out;
	});
}

for (const route of ROUTES) {
	test(`${route} reflows at 320px without scrolling sideways`, async ({ page }) => {
		await page.setViewportSize(PHONE);
		await page.goto(route);
		await expect(page.locator('main')).toBeVisible();

		expect(await overflowing(page), `elements wider than the viewport on ${route}`).toEqual(
			[]
		);

		const scroll = await page.evaluate(() => {
			const de = document.documentElement;
			const main = document.querySelector('main');
			return {
				document: de.scrollWidth - de.clientWidth,
				main: main ? main.scrollWidth - main.clientWidth : 0
			};
		});
		expect(scroll.document, `${route} document scrolls sideways`).toBeLessThanOrEqual(1);
		expect(scroll.main, `${route} main scrolls sideways`).toBeLessThanOrEqual(1);
	});
}
