<script lang="ts">
	let { href = '#main', children }: { href?: string; children?: import('svelte').Snippet } =
		$props();
</script>

<!-- A same-page fragment, not a route: resolve() does not apply to "#main". -->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a class="skip" {href}>
	{#if children}{@render children()}{:else}Skip to main content{/if}
</a>

<style>
	/*
	 * Visible on focus rather than removed from the DOM: a skip link that is
	 * `display: none` is not reachable by keyboard at all, which defeats the point.
	 */
	.skip {
		position: absolute;
		left: -9999px;
		top: 0;
		z-index: 100;
		padding: 0.75rem 1rem;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 0 0 var(--radius) 0;
		text-decoration: none;
	}

	.skip:focus {
		left: 0;
	}
</style>
