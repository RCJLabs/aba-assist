<script lang="ts">
	import { resolve } from '$app/paths';
	import { guidanceScenarios, escalationScenarios } from '$lib/content/scenarios.js';
</script>

<svelte:head>
	<title>Situations — ABA Assist</title>
	<meta
		name="description"
		content="What the literature describes for common situations, and when to bring something to your supervisor."
	/>
</svelte:head>

<h1>Situations</h1>
<p>
	What the literature describes, and what to bring to your supervisor. These are not
	instructions for a specific person — the plan written for your learner always wins.
</p>

<h2>Everyday situations</h2>
<ul>
	{#each guidanceScenarios as s (s.id)}
		<li><a href={resolve('/scenarios/[slug]', { slug: s.id })}>{s.title}</a></li>
	{/each}
</ul>

<h2>Stop and escalate</h2>
<p class="note">These do not have steps. They tell you who to contact and what to record.</p>
<ul>
	{#each escalationScenarios as s (s.id)}
		<li><a href={resolve('/scenarios/[slug]', { slug: s.id })}>{s.title}</a></li>
	{/each}
</ul>

<style>
	h1 {
		font-size: 1.5rem;
	}
	h2 {
		font-size: 1.1rem;
		margin-top: 2rem;
	}
	.note {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		border-bottom: 1px solid var(--border);
	}
	a {
		display: block;
		min-height: var(--tap);
		padding: 0.75rem 0.25rem;
	}
</style>
