<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		escalationScenarios,
		CONTACT_LABELS,
		RISK_LABELS,
		IMMEDIATE_CONTACTS
	} from '$lib/content/scenarios.js';
</script>

<svelte:head>
	<title>Something urgent is happening — ABA Assist</title>
	<meta
		name="description"
		content="Who to contact and what to document when a situation is unsafe. This page does not give procedures."
	/>
</svelte:head>

<h1>Something urgent is happening</h1>

<div class="stop" role="note">
	<p>
		<strong>If someone is in immediate danger, call 911 now</strong> — or your local emergency
		number. For suicidal statements, call or text <strong>988</strong> in the US.
	</p>
</div>

<p class="intro">
	This page tells you who to contact and what to write down. It deliberately does not tell you
	what to do physically, and that is not an omission — see
	<a href="#why">why below</a>. For everyday situations that are not emergencies, see
	<a href={resolve('/scenarios')}>Situations</a>; for what the codes require of you, see
	<a href={resolve('/ethics')}>Ethics</a>.
</p>

{#each escalationScenarios as s (s.id)}
	{#if s.kind === 'escalation-only'}
		<article class="card">
			<h2>{s.title}</h2>

			<ul class="flags">
				{#each s.riskFlags as f (f)}
					<li>{RISK_LABELS[f] ?? f}</li>
				{/each}
			</ul>

			<p>{s.situation}</p>

			<h3>Contact now</h3>
			<ul class="contacts">
				{#each s.escalation.contacts as c (c)}
					<li class:immediate={IMMEDIATE_CONTACTS.has(c)}>
						{#if IMMEDIATE_CONTACTS.has(c)}
							<span class="visually-hidden">Immediate: </span>
						{/if}
						{CONTACT_LABELS[c] ?? c}
					</li>
				{/each}
			</ul>

			<h3>Right now</h3>
			<p>{s.escalation.immediateSafetyNote}</p>

			{#if s.escalation.mandatedReporterNote}
				<h3>Mandated reporting</h3>
				<p>{s.escalation.mandatedReporterNote}</p>
			{/if}

			<h3>Write down</h3>
			<ul>
				{#each s.escalation.documentation as d, i (i)}
					<li>{d}</li>
				{/each}
			</ul>

			<p class="legal">{s.escalation.legalNote}</p>

			<p>
				<a href={resolve('/scenarios/[slug]', { slug: s.id })}
					>Open this card on its own page</a
				>
			</p>
		</article>
	{/if}
{/each}

<section id="why">
	<h2>Why this app will not tell you what to do physically</h2>
	<p>
		Physical management is a certified, hands-on competency — programs such as Safety-Care,
		CPI, and PRO-ACT teach it in person and reassess it on a schedule. It cannot be learned
		from a screen.
	</p>
	<p>
		An app also cannot know whether you have been trained, what this person's plan authorizes,
		or what your state permits. Restraint and seclusion are governed by state law and, in
		schools, by federal guidance; the US Department of Education's position is that they should
		never be used except where behavior poses an imminent danger of serious physical harm.
	</p>
	<p>
		Survey research finds that a substantial share of technicians receive little or no training
		for situations like these. That is a reason for employers to fix their training — not a
		reason for a reference app to improvise instructions.
	</p>
	<p>
		If you have not been trained in your employer's crisis procedure, tell your supervisor
		before you are alone with someone who has a history of these situations.
	</p>
</section>

<style>
	h1 {
		font-size: 1.5rem;
	}

	.stop {
		background: var(--stop-bg);
		border: 2px solid var(--stop-border);
		color: var(--stop-text);
		border-radius: var(--radius);
		padding: 0.5rem 1rem;
		margin-bottom: 1rem;
	}

	.intro {
		color: var(--text-muted);
	}

	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1rem;
		margin-bottom: 1.5rem;
		background: var(--surface-raised);
	}

	.card h2 {
		font-size: 1.15rem;
		margin-top: 0;
	}

	.card h3 {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-bottom: 0.25rem;
	}

	.flags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		list-style: none;
		padding: 0;
		margin: 0 0 0.75rem;
	}

	.flags li {
		font-size: 0.8rem;
		padding: 0.15rem 0.6rem;
		border: 1px solid var(--caution-border);
		background: var(--caution-bg);
		color: var(--caution-text);
		border-radius: 999px;
	}

	.contacts {
		list-style: none;
		padding: 0;
	}

	.contacts li {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 0.4rem;
	}

	/* Never colour alone — immediate contacts are also bold and announced to screen readers. */
	.contacts li.immediate {
		background: var(--stop-bg);
		border-color: var(--stop-border);
		color: var(--stop-text);
		font-weight: 700;
	}

	.legal {
		font-size: 0.9rem;
		color: var(--text-muted);
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
	}
</style>
