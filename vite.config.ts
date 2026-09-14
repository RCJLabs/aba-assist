import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';
import { abaContent } from '@aba/content-build/vite-plugin';

export default defineConfig({
	plugins: [
		// Runs first, inside buildStart. An invalid content tree aborts the build itself,
		// so there is no path from `vite build` to a bundle containing unreviewed,
		// uncited, or unsafe content.
		abaContent(),

		sveltekit(),

		SvelteKitPWA({
			registerType: 'prompt',
			manifest: {
				name: 'ABA Help',
				short_name: 'ABA Help',
				description:
					'Free, offline reference and study tool for behavior technicians, analysts, and paraeducators.',
				theme_color: '#1b3a5c',
				background_color: '#ffffff',
				display: 'standalone',
				orientation: 'any',
				start_url: '/',
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
					'**/*.map'
				],
				navigateFallback: '/',
				navigateFallbackDenylist: [/^\/v1\//, /^\/\.well-known\//],
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
