import { browser } from '$app/environment';
import type { TermIndexEntry } from '@aba/content-schema';
import { outlines, outlineForCredential } from '$lib/content/load.js';

export type CredentialFilter = 'all' | 'RBT' | 'BCBA' | 'BCaBA';

const KEY = 'aba-assist:filter';

export const CREDENTIAL_OPTIONS: { value: CredentialFilter; label: string }[] = [
	{ value: 'all', label: 'Everything' },
	{ value: 'RBT', label: 'RBT exam' },
	{ value: 'BCBA', label: 'BCBA exam' },
	{ value: 'BCaBA', label: 'BCaBA exam' }
];

/**
 * The exam / domain / category filter, shared by the glossary, search, flashcards and
 * quiz so a reader sets it once. Persisted per device like the display settings, and
 * for the same reason: someone studying for one exam should not have to re-select it
 * every time they open the app.
 *
 * Matching is done against the lightweight term index — `r` carries refs like
 * "RBT:C" and "BCaBA:G.5" — so filtering never has to load a category bucket.
 *
 * Each filtered credential now has its own outline, so a credential filters on its own
 * refs. The BCaBA filter used to borrow BCBA refs, which was defensible while there was
 * no assistant outline and wrong the moment there was: the two documents number their
 * tasks independently, so B.15 is not the same task in both and a borrowed domain letter
 * would have pointed at the wrong content.
 */
class Filters {
	credential = $state<CredentialFilter>('all');
	private hydrated = false;
	domain = $state<string>('all');
	category = $state<string>('all');

	/**
	 * Read the saved filter back.
	 *
	 * Idempotent, and it has to be: child components mount before the root layout does, so
	 * a page that reads the filter in its own `onMount` — the quiz, the home strip — would
	 * otherwise run against the default and quietly ignore the mode the reader chose. Those
	 * pages call this first, and the layout's call then finds nothing left to do.
	 */
	hydrate(): void {
		if (!browser || this.hydrated) return;
		this.hydrated = true;
		try {
			const raw = localStorage.getItem(KEY);
			if (!raw) return;
			const s = JSON.parse(raw) as Partial<Filters>;
			if (s.credential && CREDENTIAL_OPTIONS.some((o) => o.value === s.credential)) {
				this.credential = s.credential;
			}
			if (typeof s.domain === 'string') this.domain = s.domain;
			if (typeof s.category === 'string') this.category = s.category;
		} catch {
			// Storage unavailable: defaults are fine.
		}
	}

	set(next: { credential?: CredentialFilter; domain?: string; category?: string }): void {
		if (next.credential !== undefined && next.credential !== this.credential) {
			this.credential = next.credential;
			// A domain letter only means something within one outline.
			this.domain = 'all';
		}
		if (next.domain !== undefined) this.domain = next.domain;
		if (next.category !== undefined) this.category = next.category;
		this.persist();
	}

	clear(): void {
		this.set({ credential: 'all', domain: 'all', category: 'all' });
	}

	get active(): boolean {
		return this.credential !== 'all' || this.domain !== 'all' || this.category !== 'all';
	}

	/** The credential whose outline supplies the domain list. */
	get refCredential(): 'RBT' | 'BCBA' | 'BCaBA' | null {
		return this.credential === 'all' ? null : this.credential;
	}

	get domains(): { letter: string; name: string }[] {
		const cred = this.refCredential;
		if (!cred) return [];
		const outline = outlineForCredential(cred);
		return outline ? outline.domains.map((d) => ({ letter: d.letter, name: d.name })) : [];
	}

	matches(entry: TermIndexEntry): boolean {
		if (this.category !== 'all' && entry.c !== this.category) return false;
		const cred = this.refCredential;
		if (!cred) return true;
		const prefix = `${cred}:`;
		const refs = entry.r.filter((r) => r.startsWith(prefix));
		if (refs.length === 0) return false;
		if (this.domain === 'all') return true;
		return refs.some((r) => r.slice(prefix.length).charAt(0) === this.domain);
	}

	/**
	 * The same test for a search hit of any kind.
	 *
	 * Category is a glossary concept, so narrowing to one hides every other kind rather
	 * than letting them through a filter that cannot apply to them — a reader who asked
	 * for Measurement terms did not ask to also see ethics topics.
	 */
	matchesHit(hit: { kind: string; category: string | null; refs: string[] }): boolean {
		if (this.category !== 'all' && hit.category !== this.category) return false;
		const cred = this.refCredential;
		if (!cred) return true;
		const prefix = `${cred}:`;
		const refs = hit.refs.filter((r) => r.startsWith(prefix));
		if (refs.length === 0) return false;
		if (this.domain === 'all') return true;
		return refs.some((r) => r.slice(prefix.length).charAt(0) === this.domain);
	}

	/** Same test for anything that carries task refs (questions, scenarios). */
	matchesRefs(refs: { credential: string; code: string }[]): boolean {
		const cred = this.refCredential;
		if (!cred) return true;
		const mine = refs.filter((r) => r.credential === cred);
		if (mine.length === 0) return false;
		if (this.domain === 'all') return true;
		return mine.some((r) => r.code.charAt(0) === this.domain);
	}

	describe(): string {
		const parts: string[] = [];
		if (this.credential !== 'all') {
			parts.push(
				CREDENTIAL_OPTIONS.find((o) => o.value === this.credential)?.label ?? this.credential
			);
		}
		if (this.domain !== 'all') {
			const d = this.domains.find((x) => x.letter === this.domain);
			parts.push(d ? `${d.letter}. ${d.name}` : `Domain ${this.domain}`);
		}
		return parts.join(' · ');
	}

	private persist(): void {
		if (!browser) return;
		try {
			localStorage.setItem(
				KEY,
				JSON.stringify({
					credential: this.credential,
					domain: this.domain,
					category: this.category
				})
			);
		} catch {
			// Storage unavailable.
		}
	}
}

export const filters = new Filters();

// Referenced so an unused-import lint never removes the outline module, which also
// warms the taxonomy chunk the domain list needs.
void outlines;
