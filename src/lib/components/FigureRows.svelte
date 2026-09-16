<script lang="ts">
	/**
	 * A stack of figures, one per line: what it is, what makes it mean something, and the
	 * number.
	 *
	 * The form is deliberate. A row of stat chips makes every figure look equally
	 * important and gives none of them room for the sentence that makes them readable —
	 * "7 of 12" is meaningless without "288 days left in the cycle", and "3.1%" is worse
	 * than meaningless without "needs 5%". One per line buys that sentence, and reads
	 * top-to-bottom on a phone held in one hand.
	 *
	 * Tone is never carried by colour alone. A row that is short is coloured *and* says
	 * "short"; a row that could not be checked says "not checked". That is the same rule
	 * the phrasing guide and the scenario badges follow, and it is the difference between
	 * a figure a colour-blind reader can act on and one they cannot.
	 */
	import { resolve } from '$app/paths';
	import type { Figure, FigureHref } from '$lib/ui/figures.js';

	/*
	 * Resolved once, from literal route ids, so the base path is applied and SvelteKit can
	 * still check every destination exists. Building the href from a string at render time
	 * would pass the type checker and break on a project site.
	 */
	const HREFS: Record<FigureHref, string> = {
		'/study': resolve('/study'),
		'/plan': resolve('/plan'),
		'/tools/supervision': resolve('/tools/supervision'),
		'/tools/development': resolve('/tools/development'),
		'/tools/fieldwork': resolve('/tools/fieldwork'),
		'/competency': resolve('/competency')
	};

	interface Props {
		rows: Figure[];
		/** Names the group for a screen reader, since the figures are otherwise a list. */
		label: string;
	}

	const { rows, label }: Props = $props();
</script>

<ul class="figures" aria-label={label}>
	{#each rows as row (row.id)}
		<li>
			<!--
				A row is a link where there is somewhere to act on it, and plain text where the
				card around it is already that link — a nested link to the same page is a second
				tab stop that says the same thing.
			-->
			{#if row.href}
				<!-- Resolved above; the linter cannot see through the lookup. -->
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={HREFS[row.href]}>
					<span class="text">
						<strong>{row.label}</strong>
						<span class="detail">{row.detail}</span>
					</span>
					<span class="figure" data-tone={row.tone}>
						<span class="value">{row.value}</span>
						{#if row.note}<span class="note">{row.note}</span>{/if}
					</span>
				</a>
			{:else}
				<div class="row">
					<span class="text">
						<strong>{row.label}</strong>
						<span class="detail">{row.detail}</span>
					</span>
					<span class="figure" data-tone={row.tone}>
						<span class="value">{row.value}</span>
						{#if row.note}<span class="note">{row.note}</span>{/if}
					</span>
				</div>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.figures {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.figures li + li {
		border-top: 1px solid var(--border);
	}

	.figures a,
	.figures .row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: var(--tap);
		padding: 0.6rem 0.15rem;
		text-decoration: none;
		color: var(--text);
	}

	/* A plain row has no destination, so its label must not read as one. */
	.figures .row strong {
		color: var(--text);
	}

	.text {
		display: grid;
		gap: 0.1rem;
		/* Lets the sentence wrap instead of squeezing the figure off the row at 320px. */
		min-width: 0;
	}

	.text strong {
		font-weight: 600;
		color: var(--link);
	}

	.detail {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.figure {
		display: grid;
		justify-items: end;
		gap: 0.1rem;
		/* The figures line up with each other rather than with the longest sentence. */
		flex: 0 0 auto;
		text-align: right;
	}

	.value {
		font-size: 1.4rem;
		font-weight: 700;
		line-height: 1.1;
		white-space: nowrap;
	}

	.note {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* Never colour alone: every toned row carries `note` as a word beside the number. */
	.figure[data-tone='short'] .value,
	.figure[data-tone='short'] .note {
		color: var(--stop-border);
	}

	.figure[data-tone='unknown'] .value,
	.figure[data-tone='unknown'] .note {
		color: var(--text-muted);
	}

	@media (forced-colors: active) {
		.figure[data-tone='short'] .value,
		.figure[data-tone='short'] .note,
		.figure[data-tone='unknown'] .value,
		.figure[data-tone='unknown'] .note {
			color: CanvasText;
		}
	}
</style>
