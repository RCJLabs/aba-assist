import { browser } from '$app/environment';

export type Theme = 'system' | 'light' | 'dark';
export type Hand = 'left' | 'right';

const DISPLAY_KEY = 'aba-assist:display';

type DisplaySettingKey = 'theme' | 'oneHanded' | 'hand' | 'fontScale' | 'plainLanguage';

/**
 * Display settings.
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
					plainLanguage: this.plainLanguage
				})
			);
		} catch {
			// Storage unavailable. The setting still applies for this session.
		}
	}
}

export const settings = new Settings();
