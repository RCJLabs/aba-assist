import { termIndex } from '$lib/content/load.js';
import { buildAbbreviations } from '$lib/content/acronyms.js';
import type { PageLoad } from './$types';

export const prerender = true;

/*
 * Built at prerender time from the term index, which every page already carries. Nothing
 * new is compiled and nothing new is shipped — the whole page is a second view of data
 * that was in the bundle already.
 */
export const load: PageLoad = () => ({ abbreviations: buildAbbreviations(termIndex) });
