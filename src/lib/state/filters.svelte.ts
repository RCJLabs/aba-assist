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
 * "RBT:C" and "BCBA:G.5" — so filtering never has to load a category bucket.
 *
 * The BCaBA outline is a subset of the BCBA one; until it is modelled separately, the
 * BCaBA filter uses BCBA refs, which is a superset of what a BCaBA candidate needs
 * rather than a different thing.
 */
class Filters {
	credential = $state<CredentialFilter>('all');
	domain = $state<string>('all');
	category = $state<string>('all');

	hydrate(): void {
		if (!browser) return;
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
	get refCredential(): 'RBT' | 'BCBA' | null {
		if (this.credential === 'all') return null;
		return this.credential === 'RBT' ? 'RBT' : 'BCBA';
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
