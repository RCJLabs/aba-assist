import { browser } from '$app/environment';
import { clearLookups, getLookups, recordLookup } from '$lib/db/index.js';
import {
	recentLookups,
	repeatedLookups,
	type Lookup,
	type LookupKind
} from '$lib/study/lookups.js';
import { settings } from './settings.svelte.js';

/** How many to show in either list. Long enough to be useful, short enough to scan. */
export const SHOW_LIMIT = 8;

/**
 * The reading history, for the components that may not reach the database themselves.
 *
 * Recording is fire-and-forget and swallows its own failures. This runs on every content
 * page, including the ones somebody opens in a hurry between sessions, and a private-mode
 * browser or a blocked database must cost them a term definition — not a broken page.
 * Nothing downstream of a lookup is load-bearing, so there is nothing to report.
 */
class Lookups {
	/** `$state.raw` — a read-only array handed to rendering, never mutated in place. */
	rows = $state.raw<Lookup[]>([]);
	loaded = $state(false);

	/** Record a visit, unless the reader has asked for that not to happen. */
	note(kind: LookupKind, slug: string, title: string): void {
		if (!browser || !settings.rememberLookups) return;
		void recordLookup(kind, slug, title).catch(() => {});
	}

	async load(): Promise<void> {
		if (!browser) return;
		try {
			this.rows = await getLookups();
		} catch {
			this.rows = [];
		}
		this.loaded = true;
	}

	/** Forget the history, and say so by emptying what is on screen immediately. */
	async forget(): Promise<void> {
		if (!browser) return;
		try {
			await clearLookups();
		} catch {
			// Nothing was stored, or storage is blocked. Either way there is none to show.
		}
		this.rows = [];
		this.loaded = true;
	}

	get recent(): Lookup[] {
		return recentLookups(this.rows, SHOW_LIMIT);
	}

	get repeated(): Lookup[] {
		return repeatedLookups(this.rows, SHOW_LIMIT);
	}

	get isEmpty(): boolean {
		return this.rows.length === 0;
	}
}

export const lookups = new Lookups();
