/**
 * Project-level constants.
 *
 * The repository URL lives here rather than inline in components because it appears in
 * the errata link on every content page, and a stale value breaks the single most
 * important feedback path in the app — the one that makes wrong content fixable. The repo
 * has already been renamed once.
 */
export const REPO_URL = 'https://github.com/RCJLabs/aba-assist';

/** Pre-filled "report a content error" issue. */
export function errataUrl(subject: string): string {
	const title = encodeURIComponent(`Content error: ${subject}`);
	return `${REPO_URL}/issues/new?labels=content-error&title=${title}`;
}

/**
 * Where this build is served from, scheme and host only, no trailing slash.
 *
 * Substituted by Vite at build time from `ABA_SITE_ORIGIN`, which the deploy workflow
 * resolves in the same step and from the same `static/CNAME` check as the base path — the
 * two have to agree or the canonical links point at pages that are not there.
 *
 * It cannot be worked out at runtime. Every page here is prerendered, and during
 * prerendering SvelteKit's own `page.url` carries the origin `http://sveltekit-prerender`.
 */
declare const __SITE_ORIGIN__: string;

export const SITE_ORIGIN: string =
	typeof __SITE_ORIGIN__ === 'string' ? __SITE_ORIGIN__ : 'https://rcjlabs.github.io';
