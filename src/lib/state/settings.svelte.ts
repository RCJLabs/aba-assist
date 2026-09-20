import { browser } from '$app/environment';

export type Theme = 'system' | 'light' | 'dark';
export type Hand = 'left' | 'right';

const DISPLAY_KEY = 'aba-assist:display';

type DisplaySettingKey =
	| 'theme'
	| 'oneHanded'
	| 'hand'
	| 'fontScale'
	| 'plainLanguage'
	| 'rememberLookups'
	| 'dueBadge';

/**
 * The reader's own preferences, in localStorage.
 *
 * Mostly display, with one that is not: `rememberLookups` decides whether opening a
 * content page is recorded at all. It lives here rather than in the database because the
 * switch has to be readable before the database is opened — a preference stored inside
 * the thing it governs cannot turn that thing off.
 *
 * A class rather than exported `$state` variables, because Svelte 5 refuses to export
 * reassignable state from a module ("Cannot export state from a module if it is
 * reassigned"). Properties reached through an instance are fine.
 *
 * Persistence is imperative, in the setter — not a `$effect`. Reactive persistence
 * effects fire once on hydration with the default value and overwrite what was just
 * loaded, which is the single most common cause of "my settings keep resetting".
 */
class Settings {
	theme = $state<Theme>('system');
	oneHanded = $state(false);
	hand = $state<Hand>('right');
	fontScale = $state(1);
	plainLanguage = $state(false);
	/*
	 * On by default, which is the part worth defending. The app already records which
	 * questions somebody got wrong and how their recall is going, without asking, and a
	 * list of pages opened is less revealing than either. It never leaves the device, the
	 * switch is in Settings beside a button that erases the list on its own, and the page
	 * that shows the history says what is kept. A feature that is off until somebody finds
	 * a toggle they have no reason to look for is a feature nobody has.
	 */
	rememberLookups = $state(true);
	/*
	 * On, where the platform offers it at all. The count is the only way this app has of
	 * saying "there is work waiting" — no account, no server, no push — and a review app
	 * nobody returns to is a review app that does not work. It writes one number to an
	 * icon the reader installed on purpose, and nothing leaves the device.
	 */
	dueBadge = $state(true);

	/** Called once from the root layout's onMount. Never at module scope — this runs on the server too. */
	hydrate(): void {
		if (!browser) return;
		try {
			const raw = localStorage.getItem(DISPLAY_KEY);
			if (raw) {
				const s = JSON.parse(raw) as Partial<Settings>;
				if (s.theme) this.theme = s.theme;
				if (typeof s.oneHanded === 'boolean') this.oneHanded = s.oneHanded;
				if (s.hand) this.hand = s.hand;
				if (typeof s.fontScale === 'number') this.fontScale = s.fontScale;
				if (typeof s.plainLanguage === 'boolean') this.plainLanguage = s.plainLanguage;
				if (typeof s.rememberLookups === 'boolean') this.rememberLookups = s.rememberLookups;
				if (typeof s.dueBadge === 'boolean') this.dueBadge = s.dueBadge;
			}
		} catch {
			// Private mode or blocked storage. Defaults are correct and the app still works.
		}
		this.apply();
	}

	set<K extends DisplaySettingKey>(key: K, value: Settings[K]): void {
		// Assign through an explicitly-typed alias rather than `this`, because `this` is
		// polymorphic and TypeScript cannot prove a subclass keeps the same value types.
		(this as Settings)[key] = value;
		this.apply();
		this.persist();
	}

	toggleTheme(): void {
		const order: Theme[] = ['system', 'light', 'dark'];
		const next = order[(order.indexOf(this.theme) + 1) % order.length]!;
		this.set('theme', next);
	}

	private apply(): void {
		if (!browser) return;
		const el = document.documentElement;
		el.dataset.theme = this.theme;
		el.dataset.onehanded = String(this.oneHanded);
		el.dataset.hand = this.hand;
		el.style.setProperty('--font-scale', String(this.fontScale));
	}

	private persist(): void {
		if (!browser) return;
		try {
			localStorage.setItem(
				DISPLAY_KEY,
				JSON.stringify({
					theme: this.theme,
					oneHanded: this.oneHanded,
					hand: this.hand,
					fontScale: this.fontScale,
					plainLanguage: this.plainLanguage,
					rememberLookups: this.rememberLookups,
					dueBadge: this.dueBadge
				})
			);
		} catch {
			// Storage unavailable. The setting still applies for this session.
		}
	}
}

export const settings = new Settings();
