<script lang="ts">
	import { resolve } from '$app/paths';
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
		<!--
			The link a reviewer needs and nobody else does. It costs a reader nothing — the
			queue explains what it is on arrival — and it is the difference between the one
			person who can clear this banner having to remember a URL and not.
		-->
		<a href={resolve('/review')}>Review the content</a>
	</div>
{/if}

<style>
	/*
	 * Inline in the sentence, and still a real target: 2.5.8 sets a 24px floor and the
	 * app's own sweep enforces it on every link, without the standard's exception for
	 * links inside a block of text. Padding rather than a button, because a 44px control
	 * inside a banner that sits on every screen costs more than it is worth here.
	 */
	.banner a {
		display: inline-block;
		padding: 0.3rem 0.15rem;
		color: inherit;
		white-space: nowrap;
	}

	.banner {
		background: var(--caution-bg);
		color: var(--caution-text);
		border-bottom: 1px solid var(--caution-border);
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
		text-align: center;
	}
</style>
