<script lang="ts">
	/**
	 * What kind of page this is, in one strip across the top of it.
	 *
	 * `urgent` is not a decoration. It marks the pages that refuse to give a procedure —
	 * the escalation cards — and it is the only place in the app that draws a solid red
	 * fill. That scarcity is what makes it mean anything: if an ordinary glossary entry
	 * also arrived under a coloured bar, nobody would read this one as different.
	 */
	type Tone = 'ordinary' | 'caution' | 'urgent';

	let {
		tone = 'ordinary',
		label,
		detail = null
	}: { tone?: Tone; label: string; detail?: string | null } = $props();
</script>

<!--
	`role="note"` rather than a heading or a landmark. The band labels the page it sits on
	and is not a section anybody navigates to, so it belongs in the reading order exactly
	where it is drawn, without adding a level to the heading outline or a stop to the
	landmark list.
-->
<div class="band" data-tone={tone} role="note">
	<span class="label">{label}</span>
	{#if detail}<span class="detail">{detail}</span>{/if}
</div>

<style>
	/*
	 * Full-bleed across the content column. The inline values mirror `.page`'s padding in
	 * the layout: a negative margin out and the same padding back in, so the strip meets
	 * both edges while its text stays on the same measure as everything below it. If that
	 * padding ever changes, this changes with it.
	 */
	.band {
		margin: -1rem -1rem 1.25rem;
		padding: 0.5rem 1rem;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		background: var(--band-ordinary-bg);
		color: var(--band-ordinary-text);
		border-bottom: 3px solid var(--band-ordinary-edge);
	}

	.band[data-tone='caution'] {
		background: var(--band-caution-bg);
		color: var(--band-caution-text);
		border-bottom-color: var(--band-caution-edge);
	}

	.band[data-tone='urgent'] {
		background: var(--band-urgent-bg);
		color: var(--band-urgent-text);
		border-bottom-color: var(--band-urgent-edge);
	}

	.label {
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		line-height: 1.4;
	}

	.detail {
		font-size: 0.78rem;
		font-weight: 600;
		line-height: 1.4;
	}

	/*
	 * Forced colours drop our backgrounds, which would leave three bands that read
	 * identically. The border is what survives, so the tone is redrawn as a border weight
	 * the system palette keeps — and the label already says the kind in words regardless.
	 */
	@media (forced-colors: active) {
		.band {
			border: 1px solid CanvasText;
		}
		.band[data-tone='urgent'] {
			border: 3px solid CanvasText;
		}
	}
</style>
