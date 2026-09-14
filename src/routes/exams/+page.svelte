<script lang="ts">
	import { resolve } from '$app/paths';
	import { CREDENTIAL_LABELS, credentials, outlines } from '$lib/content/load.js';

	const list = Object.values(outlines).sort((a, b) =>
		a.credential.localeCompare(b.credential)
	);
	const factsFor = (outlineId: string) =>
		Object.values(credentials).find((c) => c.outlineId === outlineId);
	const taskCount = (o: (typeof list)[number]) =>
		o.domains.reduce((n, d) => n + d.tasks.length, 0);
</script>

<svelte:head>
	<title>Exams — ABA Assist</title>
	<meta
		name="description"
		content="What each certification exam covers: domains, weights, task areas, and the certification requirements, with links to the official documents."
	/>
</svelte:head>

<h1>Exams and certifications</h1>
<p>
	The structure of each exam — its content areas, their weights, and the tasks under them —
	plus the requirements to earn and keep the credential. Codes, counts and weights are facts
	from the official documents; the explanations are ours, and every page links to the source.
</p>

<ul class="exams">
	{#each list as o (o.id)}
		{@const facts = factsFor(o.id)}
		<li>
			<a href={resolve('/exams/[id]', { id: o.id })}>
				<strong>{o.credential} — {CREDENTIAL_LABELS[o.credential] ?? o.credential}</strong>
				<span>
					Test Content Outline, {o.edition} ed. · {o.domains.length} areas ·
					{#if o.countsVerified}{taskCount(o)} tasks{:else}{o.totalTasks} tasks (task list pending
						verification){/if}
					{#if o.exam.scoredItems}· {o.exam.scoredItems} scored questions{/if}
					{#if o.exam.minutes}· {o.exam.minutes} minutes{/if}
				</span>
				{#if facts}
					<span class="facts"
						>Eligibility, supervision, recertification — from the {facts.handbookVersion} handbook</span
					>
				{/if}
			</a>
		</li>
	{/each}
</ul>

<p class="note">
	Not affiliated with any certifying body. Exam formats and requirements change; each page
	shows the document version it was checked against, and the official document always wins.
</p>

<style>
	h1 {
		font-size: 1.5rem;
	}
	.exams {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.75rem;
	}
	.exams a {
		display: block;
		padding: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		text-decoration: none;
		color: var(--text);
	}
	.exams strong {
		display: block;
		color: var(--link);
		margin-bottom: 0.25rem;
	}
	.exams span {
		display: block;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.facts {
		margin-top: 0.25rem;
	}
	.note {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
</style>
