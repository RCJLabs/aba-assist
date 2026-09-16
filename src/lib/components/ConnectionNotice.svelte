<script lang="ts">
	import { pwa } from '$lib/state/pwa.svelte.js';
	import { announcer } from '$lib/state/announcer.svelte.js';

	/*
	 * Announced on the way down and on the way back, because the bar appearing and
	 * disappearing is a visual event and a screen reader gets neither. Skipped on first
	 * render: somebody who opens the app already offline is told by the bar itself, and
	 * an announcement fired during load lands before there is anything to hear it.
	 */
	let seen = $state(false);
	$effect(() => {
		const online = pwa.online;
		if (!seen) {
			seen = true;
			return;
		}
		announcer.announce(
			online ? 'Connection restored.' : 'No connection. The app still works.'
		);
	});
</script>

<!--
	Only ever the offline state.

	`navigator.onLine` reports true for a captive portal and for a router with no route out,
	so "you are online" is a claim this app is not in a position to make. "You are offline"
	is the half it can stand behind, and it is also the only half worth saying: the reason
	to install this is that it keeps working without a signal, and the moment that promise
	pays off is the moment a reader is most likely to doubt it.

	Informational rather than alarming, deliberately. Offline is not an error here, and the
	caution palette is spent on things somebody has to act on.
-->
{#if !pwa.online}
	<div class="offline" role="status" data-offline="true">
		<span class="dot" aria-hidden="true"></span>
		<span>
			<strong>No connection.</strong> Everything here still works. Links to other sites will not
			open.
		</span>
	</div>
{/if}

<style>
	.offline {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.4rem 1rem;
		background: var(--surface);
		border-top: 1px solid var(--border);
		color: var(--text-muted);
		font-size: 0.85rem;
		line-height: 1.35;
		text-wrap: balance;
	}

	/*
	 * A shape, not a colour: the dot is hollow, which reads as "nothing here" in
	 * greyscale and under forced colours as much as it does in colour. The sentence
	 * carries the meaning regardless — this only makes the bar recognisable at a glance.
	 */
	.dot {
		flex: none;
		width: 0.55rem;
		height: 0.55rem;
		border: 2px solid currentColor;
		border-radius: 50%;
	}
</style>
