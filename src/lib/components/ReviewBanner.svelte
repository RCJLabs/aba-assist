<script lang="ts">
	import { contentVersion } from '$lib/content/load.js';

	// Fails closed, like robots.txt: an unknown review state shows the banner rather
	// than silently presenting a preview as finished.
	const unreviewed = contentVersion.counts.unreviewed;
	const preview = unreviewed === undefined || unreviewed > 0;
</script>

<!--
	Shown whenever any entry is still awaiting clinical review, which makes the whole build
	a preview. Not dismissible: someone who installs this to a phone and comes back a week
	later should still be told what they are reading. It disappears by itself once every
	entry is approved, so there is nothing to remember to remove.
-->
{#if preview}
	<div class="banner" role="note">
		<strong>Preview build.</strong>
		{#if unreviewed}{unreviewed}
			{unreviewed === 1 ? 'entry has' : 'entries have'}{:else}Content has{/if} not been through clinical
		review yet. Do not rely on this for practice decisions.
	</div>
{/if}

<style>
	.banner {
		background: var(--caution-bg);
		color: var(--caution-text);
		border-bottom: 1px solid var(--caution-border);
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		text-align: center;
	}
</style>
