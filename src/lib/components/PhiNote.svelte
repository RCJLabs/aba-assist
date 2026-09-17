<script lang="ts">
	import { phiWarnings } from '$lib/tracker/phi.js';

	let {
		value = $bindable(''),
		id,
		label = 'Note',
		rows = 2,
		placeholder = ''
	}: {
		value?: string;
		id: string;
		label?: string;
		rows?: number;
		placeholder?: string;
	} = $props();

	const warnings = $derived(phiWarnings(value));
</script>

<div class="field">
	<label for={id}>{label}</label>
	<textarea {id} {rows} {placeholder} bind:value aria-describedby="{id}-help"></textarea>
	<p class="hint" id="{id}-help">
		Never a client's name, initials, date of birth or address. Describe what happened.
	</p>
	{#if warnings.length > 0}
		<!--
			A warning, not a block. This app cannot tell a person's name from a program's,
			and a blocker that fires on "Safety Care" teaches people to work around it.
		-->
		<ul class="warn" role="status">
			{#each warnings as w (w.id)}
				<li>{w.message}</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.field {
		display: grid;
		gap: 0.25rem;
	}
	label {
		font-weight: 600;
		font-size: 0.9rem;
	}
	textarea {
		width: 100%;
		font: inherit;
		padding: 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
	}
	.hint {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.warn {
		margin: 0.25rem 0 0;
		padding: 0.5rem 0.75rem 0.5rem 1.6rem;
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		border-radius: var(--radius);
		color: var(--caution-text);
		font-size: 0.9rem;
	}
</style>
