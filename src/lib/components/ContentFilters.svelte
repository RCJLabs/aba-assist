<script lang="ts">
	import { CATEGORIES, CATEGORY_LABELS } from '$lib/content/load.js';
	import {
		CREDENTIAL_OPTIONS,
		filters,
		type CredentialFilter
	} from '$lib/state/filters.svelte.js';

	let { showCategory = true, label = 'Filter' }: { showCategory?: boolean; label?: string } =
		$props();

	// Explicit for/id pairs rather than wrapping <label>s: a label that wraps a <select>
	// gets the selected option's text folded into the control's accessible name ("Exam
	// Everything"), which makes the name unstable and confuses exact-match lookups.
	const uid = $props.id();
</script>

<!--
	Native <select> elements on purpose. Custom drop-downs are the single most common
	accessibility failure in study apps; the native control already handles keyboard,
	screen readers, forced colours and one-handed use on every platform.
-->
<div class="filters" role="group" aria-label={label}>
	<div class="field">
		<label for="{uid}-exam">Exam</label>
		<select
			id="{uid}-exam"
			value={filters.credential}
			onchange={(e) => filters.set({ credential: e.currentTarget.value as CredentialFilter })}
		>
			{#each CREDENTIAL_OPTIONS as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
	</div>

	{#if filters.domains.length > 0}
		<div class="field">
			<label for="{uid}-domain">Domain</label>
			<select
				id="{uid}-domain"
				value={filters.domain}
				onchange={(e) => filters.set({ domain: e.currentTarget.value })}
			>
				<option value="all">All domains</option>
				{#each filters.domains as d (d.letter)}
					<option value={d.letter}>{d.letter}. {d.name}</option>
				{/each}
			</select>
		</div>
	{/if}

	{#if showCategory}
		<div class="field">
			<label for="{uid}-category">Category</label>
			<select
				id="{uid}-category"
				value={filters.category}
				onchange={(e) => filters.set({ category: e.currentTarget.value })}
			>
				<option value="all">All categories</option>
				{#each CATEGORIES as c (c)}
					<option value={c}>{CATEGORY_LABELS[c]}</option>
				{/each}
			</select>
		</div>
	{/if}

	{#if filters.active}
		<button type="button" class="clear" onclick={() => filters.clear()}>Clear filters</button>
	{/if}
</div>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		align-items: flex-end;
		margin: 0.75rem 0 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1 1 9rem;
		min-width: 0;
	}

	label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	select {
		font: inherit;
		color: var(--text);
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		max-width: 100%;
	}

	.clear {
		flex: 0 0 auto;
		padding: 0.5rem 0.8rem;
	}
</style>
