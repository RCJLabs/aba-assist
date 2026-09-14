import { contentVersion } from '$lib/content/load.js';
import type { RequestHandler } from './$types';

export const prerender = true;

/**
 * robots.txt is generated rather than static so it can reflect review state.
 *
 * While any entry is still unreviewed the whole site is a preview, and unreviewed
 * clinical content should not be discoverable by someone searching for an ABA term. Once
 * every entry is approved this opens up on its own — the glossary being indexable is the
 * app's main way of reaching the people who need it.
 */
export const GET: RequestHandler = () => {
	// Fails closed. If the count is missing for any reason, treat the build as
	// unreviewed: defaulting an unknown review state to "safe to index" is the wrong
	// way round when what could get indexed is unreviewed clinical content.
	const unreviewed = contentVersion.counts.unreviewed;
	const preview = unreviewed === undefined || unreviewed > 0;

	const body = preview
		? [
				'# Preview build: content has not completed review.',
				'# Indexing is disabled until every entry is approved.',
				'User-agent: *',
				'Disallow: /',
				''
			].join('\n')
		: ['User-agent: *', 'Allow: /', ''].join('\n');

	return new Response(body, {
		headers: { 'content-type': 'text/plain; charset=utf-8' }
	});
};
