<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import LiveRegion from '$lib/a11y/LiveRegion.svelte';
	import SkipLink from '$lib/a11y/SkipLink.svelte';
	import ReviewBanner from '$lib/components/ReviewBanner.svelte';
	import UpdatePrompt from '$lib/components/UpdatePrompt.svelte';
	import { settings } from '$lib/state/settings.svelte.js';
	import { filters } from '$lib/state/filters.svelte.js';
	import { pwa } from '$lib/state/pwa.svelte.js';

	let { children } = $props();
	let main: HTMLElement | undefined = $state();

	onMount(() => {
		settings.hydrate();
		filters.hydrate();
		void pwa.register();
	});

	afterNavigate(({ type }) => {
		// `enter` is the first render, not a navigation: the reader has not gone anywhere,
		// so taking focus there would steal it and scroll the header out of view. `popstate`
		// is back/forward, where scroll restoration should own the scroll position.
		//
		// For real navigations, SvelteKit already announces document.title in its own live
		// region; moving focus to <main> is what puts a screen-reader user at the start of
		// the new content instead of stranding them where the previous page left them.
		// `preventScroll` keeps that from fighting SvelteKit's own scroll handling.
		if (type === 'enter' || type === 'popstate') return;
		// `main` is the scroll container and persists across navigations, so its scroll
		// position has to be reset explicitly — SvelteKit's scroll handling targets the
		// window, which never scrolls in this layout.
		if (main) main.scrollTop = 0;
		main?.focus({ preventScroll: true });
	});

	/*
	 * Five primary destinations, with short labels so they fit at 320px (64px each, all
	 * still above the 44px target). Settings lives in the header; Situations, Exams and
	 * About are reached from the home page and from the Urgent page.
	 *
	 * Route ids, resolved in the template: `resolve` applies the base path itself, which
	 * is why nothing in this app concatenates `base` by hand. That matters more than it
	 * looks — the base path differs between an origin root and a project site, and
	 * hand-built hrefs are exactly what breaks when it changes.
	 */
	const nav = [
		{ id: '/', label: 'Search', urgent: false },
		{ id: '/glossary', label: 'Terms', urgent: false },
		{ id: '/study', label: 'Study', urgent: false },
		{ id: '/quiz', label: 'Quiz', urgent: false },
		{ id: '/help', label: 'Urgent', urgent: true }
	] as const;

	const isCurrent = (href: string) =>
		page.url.pathname === href || page.url.pathname.startsWith(href + '/');
</script>

<SkipLink />

<ReviewBanner />

<header>
	<a class="wordmark" href={resolve('/')}>ABA&nbsp;Assist</a>
	<div class="header-actions">
		<button
			type="button"
			class="theme"
			onclick={() => settings.toggleTheme()}
			aria-label="Theme: {settings.theme}. Activate to change."
		>
			{settings.theme === 'dark' ? 'Dark' : settings.theme === 'light' ? 'Light' : 'Auto'}
		</button>
		<a
			class="settings-link"
			href={resolve('/settings')}
			aria-current={page.url.pathname === resolve('/settings') ? 'page' : undefined}
		>
			Settings
		</a>
	</div>
</header>

<main id="main" bind:this={main} tabindex="-1">
	<div class="page">
		{@render children()}
	</div>
</main>

<!--
	Bottom navigation, always. Primary controls belong in the thumb zone: this app is used
	standing up, mid-session, often with one hand already occupied.
-->
<nav aria-label="Main">
	<ul>
		{#each nav as item (item.id)}
			<li>
				<a
					href={resolve(item.id)}
					aria-current={isCurrent(resolve(item.id)) ? 'page' : undefined}
					class:urgent={item.urgent}
				>
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<UpdatePrompt />

<LiveRegion />

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	.wordmark {
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--text);
		text-decoration: none;
		min-height: var(--tap);
		display: flex;
		align-items: center;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.theme {
		padding: 0.5rem 0.7rem;
	}

	.settings-link {
		display: flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0.5rem 0.7rem;
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--link);
	}

	.settings-link[aria-current='page'] {
		font-weight: 700;
	}

	/*
	 * The scroll container. Header and nav are siblings in the body flex column, so they
	 * frame this rather than floating over it.
	 *
	 * Note the centring: `margin: 0 auto` on a scroll container would centre the scroll
	 * box itself and leave the scrollbar inset, so the element fills the width and an
	 * inner wrapper does the centring instead.
	 */
	main {
		flex: 1 1 auto;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.page {
		max-width: var(--maxw);
		margin-inline: auto;
		padding: 1rem 1rem calc(2rem + var(--actionbar-h));
	}

	main:focus {
		outline: none;
	}

	/*
	 * A flex sibling of `main`, not a layer over it: a bar that floats over the content
	 * covers mid-page links at every scroll position, which axe reports as partially
	 * obscured targets under 2.5.8. Sticky on top of that is belt and braces — it only
	 * does anything in the case where the body has had to become scrollable, and there
	 * a bar pinned to the bottom beats a bar that scrolled away.
	 */
	nav {
		flex: 0 0 auto;
		position: sticky;
		bottom: 0;
		z-index: 2;
		background: var(--surface);
		border-top: 1px solid var(--border);
		padding-bottom: env(safe-area-inset-bottom);
	}

	header {
		flex: 0 0 auto;
	}

	nav ul {
		display: flex;
		margin: 0;
		padding: 0;
		list-style: none;
		max-width: var(--maxw);
		margin-inline: auto;
	}

	nav li {
		flex: 1;
	}

	nav a {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: var(--tap);
		padding: 0.5rem 0.25rem;
		text-decoration: none;
		color: var(--text);
		font-size: 0.9rem;
	}

	/* Never colour alone: the current page is also marked with aria-current. */
	nav a[aria-current='page'] {
		font-weight: 700;
		box-shadow: inset 0 3px 0 var(--accent);
	}

	nav a.urgent {
		color: var(--stop-text);
	}

	:global([data-theme='dark']) nav a.urgent {
		color: var(--stop-border);
	}
</style>
