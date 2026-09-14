import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Base path.
 *
 * Defaults to '' — i.e. the app is served from an origin root (custom domain, or a
 * user/org GitHub Pages site). This is REQUIRED for the Trusted Web Activity: Android
 * verifies app<->site ownership via `/.well-known/assetlinks.json` at the ORIGIN ROOT,
 * which a GitHub Pages *project* site (`<user>.github.io/aba-help/`) cannot serve.
 *
 * `ABA_BASE_PATH=/aba-help` is supported as a preview-only escape hatch. Do not ship a
 * TWA from a build that used it — asset-link verification will fail and the app will
 * render with a browser URL bar.
 */
const base = process.env.ABA_BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			/*
			 * A SPA fallback shell, even though every route is prerendered.
			 *
			 * It exists for offline navigation. Term and scenario pages are deliberately
			 * kept out of the precache (hundreds of near-duplicate HTML files), so the
			 * service worker answers those navigations from a fallback instead. Pointing
			 * that at the prerendered home page does not work: it carries the home route's
			 * own data payload, so SvelteKit hydrates it as the home page regardless of the
			 * URL — offline, every bookmarked term silently opened the search screen.
			 *
			 * This shell has no route baked in, so the client router renders whatever URL
			 * was actually requested.
			 */
			fallback: '200.html',
			precompress: false,
			strict: true
		}),
		paths: { base, relative: false },
		alias: {
			$content: 'src/lib/content',
			$db: 'src/lib/db',
			$state: 'src/lib/state',
			$a11y: 'src/lib/a11y',
			$components: 'src/lib/components'
		},
		prerender: {
			handleHttpError: 'fail',
			handleMissingId: 'fail'
		},
		typescript: {
			// Extend the generated include list rather than overriding it in tsconfig.json,
			// which would drop SvelteKit's own generated declarations.
			config(cfg) {
				cfg.include.push('../packages/**/*.ts', '../e2e/**/*.ts');
				return cfg;
			}
		}
	}
};

export default config;
