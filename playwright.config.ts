import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Some CI images ship a Chromium build that does not match the revision this Playwright
 * version expects. Where a prebuilt binary is present, use it rather than downloading a
 * second copy; everywhere else fall back to Playwright's own managed browser.
 */
const PREINSTALLED = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const found = PREINSTALLED.find((p) => existsSync(p));
const chromium = found ? { launchOptions: { executablePath: found } } : {};

/**
 * E2E runs against the BUILT static output, not the dev server, so the tests exercise the
 * real prerendered HTML and the real service worker rather than a dev-mode approximation.
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,

	/*
	 * Playwright's default test budget is 30s, and several specs spend a documented 30s
	 * waiting for the search index or a tracker to report ready. That is the whole budget:
	 * a wait that actually ran long could never fail as itself, only as "test timeout of
	 * 30000ms exceeded" with no locator named — the least useful message available at the
	 * moment you most need one. 60s leaves the readiness wait its 30s and the assertions
	 * after it the 30s they were written against.
	 *
	 * `expect` keeps its 5s default on purpose: ordinary assertions should stay fast to
	 * fail, and the slow waits already say so explicitly at the call site.
	 */
	timeout: 60_000,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		// Motion is reduced by default: the suite should assert on content and semantics,
		// never race an animation.
		reducedMotion: 'reduce'
	},

	webServer: {
		/*
		 * Served the way GitHub Pages serves it, not with `vite preview`.
		 *
		 * The service worker precaches extensionless URLs (`glossary`, not
		 * `glossary.html`). Pages resolves those with a 200; a generic static server
		 * answers 301, and Workbox treats a redirect during precaching as a failure — so
		 * the worker never activates and offline silently does not work. Testing against
		 * routing that differs from production is how that stayed invisible.
		 */
		command: 'node scripts/serve-pages.mjs --dir build --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},

	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...chromium } },
		{ name: 'mobile-chrome', use: { ...devices['Pixel 7'], ...chromium } },
		{
			name: 'a11y',
			use: { ...devices['Desktop Chrome'], ...chromium },
			testMatch: /a11y\.spec\.ts/
		},
		{
			name: 'forced-colors',
			use: { ...devices['Desktop Chrome'], ...chromium, forcedColors: 'active' },
			testMatch: /a11y\.spec\.ts/
		}
	]
});
