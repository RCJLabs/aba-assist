import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';
import { abaContent } from '@aba/content-build/vite-plugin';

// Mirrors `paths.base` in svelte.config.js. Kept in sync through the same env var rather
// than duplicated, because a mismatch between the two silently breaks offline navigation.
const BASE_PATH = process.env.ABA_BASE_PATH ?? '';

/**
 * Where this build will actually be served from, scheme and host only.
 *
 * Needed because a share card and a canonical link have to be absolute, and nothing at
 * runtime can work it out: these pages are prerendered, where SvelteKit's own `page.url`
 * has the origin `http://sveltekit-prerender`. Baked in at build time instead.
 *
 * Resolved by the deploy workflow in the same step as the base path, from the same
 * `static/CNAME` check, because the two have to agree — an origin that disagrees with the
 * base path produces canonical links pointing at pages that are not there, which is worse
 * for indexing than having no canonical link at all. The default is the project site,
 * which is where this is served today.
 */
const SITE_ORIGIN = process.env.ABA_SITE_ORIGIN ?? 'https://rcjlabs.github.io';

export default defineConfig({
	// Substituted at build time. `import.meta.env` would need a VITE_ prefix and would put
	// the value in every chunk's env object; this puts the one string where it is used.
	define: { __SITE_ORIGIN__: JSON.stringify(SITE_ORIGIN) },
	plugins: [
		// Runs first, inside buildStart. An invalid content tree aborts the build itself,
		// so there is no path from `vite build` to a bundle containing unreviewed,
		// uncited, or unsafe content.
		abaContent(),

		sveltekit(),

		SvelteKitPWA({
			registerType: 'prompt',
			kit: {
				/*
				 * Required, not optional. The static adapter writes the fallback page after
				 * the PWA plugin has already generated the service worker, so without this
				 * the plugin never sees it and `200.html` is missing from the precache —
				 * while `navigateFallback` still points at it. The handler then fails on
				 * every offline navigation it is supposed to rescue, which looks exactly
				 * like "offline is broken" rather than "one file is missing".
				 */
				adapterFallback: '200.html',
				/*
				 * Not "this app is a SPA" — every route here is prerendered. This is the
				 * plugin's switch for actually putting the adapter fallback into the
				 * precache manifest (it derives the revision from `_app/version.json`,
				 * which is precached). Without it `adapterFallback` only names the file and
				 * never caches it.
				 */
				spa: true
			},
			manifest: {
				name: 'ABA Assist',
				short_name: 'ABA Assist',
				description:
					'Free, offline reference and study tool for behavior technicians, analysts, and paraeducators.',
				/*
				 * Matches the light `--surface` in `app.css`, which is what the app header is
				 * painted in. The manifest takes one value where the meta tags in `app.html`
				 * take two, and this is the one the task switcher and the splash screen use.
				 */
				theme_color: '#f2f6fa',
				background_color: '#ffffff',
				display: 'standalone',
				orientation: 'any',
				// `start_url` and `scope` are deliberately not set: the plugin derives them
				// from SvelteKit's base path. Hardcoding "/" breaks installation from a
				// project site served under a subdirectory, because the scope would not
				// contain the app.
				icons: [
					{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
					{
						src: 'icons/maskable-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			workbox: {
				/*
				 * Pulled into the generated worker rather than written through
				 * `injectManifest`. Switching strategies would mean owning the whole service
				 * worker — precache handling, navigation fallback, the update flow — to add one
				 * periodic-sync listener. A static file next to `sw.js` costs one line.
				 */
				importScripts: ['badge-sw.js'],
				globPatterns: ['**/*.{js,css,html,woff2,png,svg,json}'],
				// The ~600 prerendered term pages exist for first visit and for search
				// engines. Precaching them would cost several megabytes to say what the
				// JSON already says — offline navigation renders them client-side from the
				// precached category buckets instead.
				// Paths are relative to `.svelte-kit/output`, so these need the
				// `prerendered/pages/` prefix that @vite-pwa/sveltekit globs with — bare
				// `glossary/**` silently matches nothing and every term page gets
				// precached. The index pages (`glossary.html`, `scenarios.html`) live
				// beside these directories, not inside them, so they are still cached.
				globIgnores: [
					'prerendered/pages/glossary/**',
					'prerendered/pages/scenarios/**',
					'prerendered/pages/ethics/**',
					// Six pages of inline SVG. The graph documents are already in the JS
					// bundle, so the app renders these offline from data — precaching the
					// HTML too would be paying twice for the same six pages.
					'prerendered/pages/graphs/**',
					// A maintenance tool for one person, which pulls the whole corpus when
					// opened. Nobody should be paying for it in their offline cache.
					'prerendered/pages/review.html',
					'**/*.map'
				],
				/*
				 * Must carry the base path. Workbox resolves this against the precache, and
				 * the precached shell is `<base>/` — a bare '/' matches nothing when the app
				 * is served from a subdirectory, so every offline navigation to a page that
				 * is not itself precached fails. That is precisely the term pages, which are
				 * excluded above on purpose, so the symptom is "offline works until you open
				 * a bookmarked term".
				 */
				navigateFallback: `${BASE_PATH}/200.html`,
				navigateFallbackDenylist: [
					/^\/v1\//,
					/\/\.well-known\//,
					// Never answer a missing asset with the app shell: it turns a 404 into a
					// confusing HTML response with a 200.
					/\.[a-z0-9]+$/i
				],
				cleanupOutdatedCaches: true,
				// Never swap content mid-session: a service-worker takeover during a review
				// session would discard in-flight scheduling state. The app prompts instead.
				clientsClaim: false,
				skipWaiting: false,
				maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
			}
		})
	],

	server: { fs: { allow: ['..'] } }
});
