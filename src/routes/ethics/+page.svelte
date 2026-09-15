<script lang="ts">
	import { resolve } from '$app/paths';
	import { ethicsCodes, topicsBySection, topicsForCredential } from '$lib/content/load.js';
	import { filters } from '$lib/state/filters.svelte.js';

	// The ethics reference is organised by code, because that is what binds a given
	// reader: technicians answer to one code, analysts to the other. The shared exam
	// filter picks which one leads.
	const codes = Object.values(ethicsCodes);
	const rbtCode = codes.find((c) => c.appliesTo.includes('RBT'));
	const analystCode = codes.find((c) => c.appliesTo.includes('BCBA'));

	const credential = $derived(filters.refCredential);
	const visible = $derived(topicsForCredential(credential));
	const lead = $derived(
		credential === 'BCBA' ? analystCode : credential === 'RBT' ? rbtCode : null
	);
	const ordered = $derived(lead ? [lead, ...codes.filter((c) => c.id !== lead.id)] : codes);

	const fmtDate = (iso: string) =>
		new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
</script>

<svelte:head>
	<title>Ethics — ABA Assist</title>
	<meta
		name="description"
		content="A plain-language reference to the ethics codes for behavior technicians and behavior analysts: the core principles, what each section covers, and what each obligation looks like in practice."
	/>
</svelte:head>

<h1>Ethics</h1>
<p class="lede">
	Both certification ethics codes, organised by the question you actually have — can I accept
	this, can I say that, who do I tell — rather than by standard number. Each topic says what
	the obligation is, what it looks like on an ordinary day, and where people get caught.
</p>

<div class="switcher">
	<button
		type="button"
		class:active={credential === null}
		onclick={() => filters.set({ credential: 'all' })}>Everything</button
	>
	<button
		type="button"
		class:active={credential === 'RBT'}
		onclick={() => filters.set({ credential: 'RBT' })}>Technician</button
	>
	<button
		type="button"
		class:active={credential === 'BCBA'}
		onclick={() => filters.set({ credential: 'BCBA' })}>Analyst</button
	>
</div>
<p class="count" aria-live="polite">
	Showing {visible.length}
	{visible.length === 1 ? 'topic' : 'topics'}{#if credential}
		that bind {credential === 'RBT' ? 'technicians' : 'analysts'}{/if}.
</p>

{#each ordered as code (code.id)}
	<section class="code">
		<h2>{code.shortName}</h2>
		<p class="meta">
			Effective {fmtDate(code.effectiveDate)} · applies to {code.appliesTo.join(', ')}
			{#if code.totalStandards}· {code.totalStandards} standards{/if}
		</p>
		<p>{code.ourOverview}</p>

		{#if code.corePrinciples.length > 0}
			<h3>The principles it is built on</h3>
			<ol class="principles">
				{#each code.corePrinciples as p (p.number)}
					<li>
						<strong>{p.ourLabel}</strong>
						<span>{p.ourSummary}</span>
						<span class="src">{p.sourceNote}</span>
					</li>
				{/each}
			</ol>
		{/if}

		<h3>What each section covers</h3>
		{#each topicsBySection(code.id, credential) as group (group.section.number)}
			<section class="sec">
				<h4>
					<span class="num">Section {group.section.number}</span>
					{group.section.ourLabel}
				</h4>
				<p class="secsum">{group.section.ourSummary}</p>
				{#if group.topics.length > 0}
					<ul class="topics">
						{#each group.topics as t (t.id)}
							<li>
								<a href={resolve('/ethics/[slug]', { slug: t.id })}>
									<span class="label">{t.ourLabel}</span>
									<span class="gloss">{t.gloss}</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="none">No topic written for this section yet.</p>
				{/if}
			</section>
		{/each}

		<p class="official">
			<!-- The code itself is an external document, not an app route. -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={code.officialUrl} rel="noopener">Read the code itself</a>
			— this app never reproduces its wording.
		</p>

		{#if !code.standardsVerified}
			<p class="notice" role="note">
				<strong>Standard numbers are not listed.</strong> The sections and principles above are checked
				against the certifying board's own handbooks. The individual standard numbers have not been
				checked against the code document, so this app does not print them rather than risk citing
				one wrongly.
			</p>
		{/if}
	</section>
{/each}

<p class="note">
	Not legal advice and not affiliated with any certifying body. Where this app and the official
	code differ, the code is right. Your supervisor is the person to ask first.
</p>

<style>
	h1 {
		font-size: 1.5rem;
	}
	.lede {
		color: var(--text-muted);
	}
	.switcher {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0 0.5rem;
	}
	.switcher button.active {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
		font-weight: 700;
	}
	.count,
	.meta,
	.note,
	.src,
	.none {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.code {
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 2px solid var(--border);
	}
	h2 {
		font-size: 1.25rem;
		margin-bottom: 0.15rem;
	}
	h3 {
		font-size: 1.05rem;
		margin-top: 1.75rem;
	}
	h4 {
		font-size: 1rem;
		margin: 0 0 0.25rem;
	}
	.num {
		display: inline-block;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-right: 0.4rem;
	}
	.principles {
		padding-left: 1.2rem;
	}
	.principles li {
		margin-bottom: 0.75rem;
	}
	.principles strong,
	.principles span {
		display: block;
	}
	.src {
		font-style: italic;
		margin-top: 0.2rem;
	}
	.sec {
		border-left: 3px solid var(--border);
		padding-left: 0.9rem;
		margin-bottom: 1.25rem;
	}
	.secsum {
		font-size: 0.95rem;
	}
	.topics {
		list-style: none;
		padding: 0;
	}
	.topics li {
		border-bottom: 1px solid var(--border);
	}
	.topics a {
		display: block;
		padding: 0.6rem 0.25rem;
		min-height: var(--tap);
		text-decoration: none;
		color: var(--text);
	}
	.label {
		display: block;
		font-weight: 600;
		color: var(--link);
	}
	.gloss {
		display: block;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.official {
		font-size: 0.95rem;
	}
	.notice {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
		font-size: 0.9rem;
	}
</style>
