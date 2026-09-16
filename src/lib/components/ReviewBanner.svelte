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
		<!--
			Two lines on a phone rather than three.
			
			It sits on every screen, so each line it wraps to is a line of the app nobody
			can read. The count went to the queue, which is the only place it can be acted
			on; the warning stayed, because that is the part somebody could be harmed by
			not seeing and it is not going behind a disclosure to save 20 pixels.
		-->
		<strong>Preview build</strong> — not clinically reviewed. Do not rely on it for practice
		decisions.
		<!--
			The link a reviewer needs and nobody else does. It costs a reader nothing — the
			queue explains what it is on arrival, and says the number this used to carry —
			and it is the difference between the one person who can clear this banner
			having to remember a URL and not.
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
		padding: 0.35rem 1rem;
		font-size: 0.85rem;
		line-height: 1.35;
		text-align: center;
		text-wrap: balance;
	}
</style>
