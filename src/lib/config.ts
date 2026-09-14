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
