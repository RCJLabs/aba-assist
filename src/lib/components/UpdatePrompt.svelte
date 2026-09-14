<script lang="ts">
	import { pwa } from '$lib/state/pwa.svelte.js';
	import { announcer } from '$lib/state/announcer.svelte.js';

	let announced = false;
	$effect(() => {
		if (pwa.updateReady && !announced) {
			announced = true;
			announcer.announce('An updated version of the content is available.');
		}
	});
</script>

<!--
	Sits above the bottom navigation so it never covers the primary controls, and is a real
	button rather than an auto-reload: reloading out from under someone mid-read is the
	behaviour this whole arrangement exists to avoid.
-->
{#if pwa.updateReady}
	<div class="update" role="status">
		<span>Updated content is available.</span>
		<button type="button" onclick={() => pwa.applyUpdate()}>Reload</button>
	</div>
{/if}

<style>
	.update {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.5rem 1rem;
		background: var(--accent);
		color: var(--accent-text);
		font-size: 0.9rem;
	}

	button {
		background: var(--accent-text);
		color: var(--accent);
		border-color: var(--accent-text);
		font-weight: 600;
		padding: 0.4rem 0.9rem;
		min-height: var(--tap);
	}
</style>
