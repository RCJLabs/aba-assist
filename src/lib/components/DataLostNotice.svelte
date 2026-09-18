<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { storage } from '$lib/state/storage.svelte.js';

	/**
	 * Said where the loss is felt.
	 *
	 * A reader whose deck was cleared used to open this page and read "nothing to review
	 * yet" — the same words a new reader sees. The app that lost a year of supervision
	 * records said nothing about it and offered nothing to do, which is the difference
	 * between an app with a known limitation and one that looks broken.
	 *
	 * Rendered on the pages where the emptiness is visible rather than as a banner on
	 * every route, because somebody who only opens the glossary has lost nothing they
	 * would notice, and a global banner about lost data is exactly the kind of thing that
	 * gets dismissed unread.
	 */
	let { settings = false }: { settings?: boolean } = $props();

	onMount(() => storage.load());

	const days = $derived(storage.daysSinceData);
</script>

{#if storage.dataState === 'cleared'}
	<section class="lost" role="alert" data-data-lost>
		<h2>Your saved progress has gone</h2>
		<p>
			This app had flashcard scheduling, practice history or logged hours stored on this device{#if days !== null && days > 0}
				as recently as {days === 1 ? 'yesterday' : `${days} days ago`}{/if}, and the browser
			has since cleared it. Nothing was sent anywhere, so there is no copy to pull back down —
			that is the trade this app makes for having no account and no server.
		</p>
		<p>
			<strong>If you have a backup file, this is what it is for.</strong>
		</p>
		<p class="actions">
			{#if !settings}
				<a class="button" href={resolve('/settings')}>Restore from a backup</a>
			{/if}
			<button type="button" onclick={() => storage.dismissClearedNotice()}>
				Start again without it
			</button>
		</p>
		<p class="why">
			Browsers do this to reclaim space, and Safari and iOS do it to any site you have not
			opened for about a week unless you install it to your home screen. Keeping a backup and
			installing the app are the two things that prevent it.
		</p>
	</section>
{/if}

<style>
	.lost {
		max-width: 44rem;
		margin: 0 0 1rem;
		padding: 0.85rem 1rem;
		border: 1px solid var(--stop-border);
		border-left-width: 4px;
		border-radius: var(--radius);
		background: var(--surface-raised);
	}

	.lost h2 {
		font-size: 1.05rem;
		margin: 0 0 0.4rem;
	}

	.lost p {
		margin: 0 0 0.5rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.actions .button,
	.actions button {
		min-height: var(--tap);
		display: inline-flex;
		align-items: center;
	}

	.why {
		margin: 0.5rem 0 0;
		color: var(--text-muted);
		font-size: 0.9em;
	}
</style>
