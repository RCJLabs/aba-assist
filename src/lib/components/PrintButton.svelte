<script lang="ts">
	/**
	 * Ask the browser to print this page.
	 *
	 * Worth a control rather than leaving it to the browser menu, for one reason: on Android
	 * that menu item is also "Save as PDF", and nobody goes looking in a menu for a feature
	 * they do not know a web app has. This is the export, and it needs to be visible to be
	 * one.
	 *
	 * The button itself is hidden in print by the global rule in `app.css`, along with every
	 * other button — a control that printed a picture of itself would be the first thing
	 * anybody noticed on the paper.
	 */
	import { browser } from '$app/environment';

	const { label = 'Print or save as PDF' }: { label?: string } = $props();

	/*
	 * Feature-detected rather than assumed — some Android WebViews expose no print at all,
	 * and a button that silently does nothing is worse than no button. Gated on `browser`
	 * too: these pages are prerendered, and `window` does not exist while they are.
	 */
	const supported = $derived(browser && typeof window.print === 'function');
</script>

{#if supported}
	<button type="button" class="print" onclick={() => window.print()}>{label}</button>
{/if}

<style>
	.print {
		min-height: var(--tap);
		padding: 0 1rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
</style>
