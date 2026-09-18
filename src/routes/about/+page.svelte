<script lang="ts">
	import { reviewScheduleRows, contentVersion, termIndex } from '$lib/content/load.js';
	import { scenarios } from '$lib/content/scenarios.js';

	import { REPO_URL } from '$lib/config.js';
</script>

<svelte:head>
	<title>About this app — ABA Assist</title>
	<meta
		name="description"
		content="What this app is, what it deliberately does not do, and how to report an error."
	/>
</svelte:head>

<h1>About this app</h1>

<section class="callout">
	<h2 class="section-head">This is not clinical advice</h2>
	<p>
		ABA Assist is an educational reference. It is not a medical device, it does not diagnose,
		treat, cure, or prevent any condition, and it is not a substitute for supervision. The
		behavior plan written for a specific person, and the analyst supervising their services,
		decide what applies to that person.
	</p>
	<p>
		It is <strong>not affiliated with, endorsed by, or sponsored by</strong> the Behavior Analyst
		Certification Board or any other certifying body. RBT, BCaBA, BCBA and BCBA-D are marks belonging
		to their respective owners and are used here only to refer to the credentials themselves. Always
		check the official documents at their source.
	</p>
</section>

<h2 class="section-head">What it deliberately does not do</h2>
<ul>
	<li>
		<strong>No instruction on restraint, seclusion, or physical management.</strong> Those are certified,
		hands-on competencies governed by your employer's policy and by state law.
	</li>
	<li>
		<strong>No individualized recommendations.</strong> Technicians implement plans under supervision;
		they do not design, modify, or interpret them.
	</li>
	<li>
		<strong>No client data.</strong> Nothing about a person you work with should ever be typed into
		this app. It stores no client information of any kind.
	</li>
</ul>

<h2 class="section-head">What it costs</h2>
<p>
	Nothing. There is no paid tier, no trial, no advertising and no analytics, and there is
	nothing here to sign up for — this app has no accounts because it has no server to keep them
	on. Every feature is available to everybody who can open the page, which for a workforce that
	frequently studies on unpaid time is the point rather than a courtesy.
</p>
<p>
	That is a description of how it is built rather than a claim you have to take on faith. The
	app downloads its own files — the pages, and a search index it fetches the first time you
	search — and it sends nothing back: no usage, no scores, no logs, no identifiers. Once those
	files are on your device every feature works in airplane mode, which is the easiest way to
	check it for yourself.
</p>

<h2 class="section-head">Where the content comes from</h2>
<p>
	Every definition here is written from scratch, from primary literature where possible, and
	every entry lists what it was written from. Nothing is copied from a certifying body's
	documents or from a textbook — where you need the official wording of a standard or a task,
	this app links you to the source rather than reproducing it.
</p>
<p>
	Domain names, task codes, and exam weights are factual scaffolding and are used as such. The
	explanatory writing is ours.
</p>

<h2 id="errata" class="section-head">Found an error?</h2>
<p>
	Please report it — wrong content in this field is worse than missing content. Errors are
	tracked publicly, so you can see what was reported and what was done about it.
</p>
<p>
	<!-- An external GitHub URL, not an app route: resolve() does not apply. -->
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a class="button" href="{REPO_URL}/issues/new?labels=content-error" rel="noopener">
		Report a content error
	</a>
</p>

<h2 class="section-head">This build</h2>
<dl>
	<dt>Content version</dt>
	<dd>{contentVersion.contentVersion}</dd>
	<dt>Channel</dt>
	<dd>{contentVersion.channel}</dd>
	<dt>Terms</dt>
	<dd>{termIndex.length}</dd>
	<dt>Situations</dt>
	<dd>{scenarios.length}</dd>
	<dt>Practice questions</dt>
	<dd>{contentVersion.counts.questions ?? 0}</dd>
	<dt>Ethics topics</dt>
	<dd>{contentVersion.counts.ethicsTopics ?? 0}</dd>
	<dt>Aligned to</dt>
	<dd>
		RBT Test Content Outline (3rd ed.), effective 1 January 2026; BCBA Test Content Outline
		(6th ed.), effective 1 January 2025
	</dd>
</dl>

<p class="note">
	If the content version here is older than the one on the website, your device is showing a
	cached copy. Reconnecting and reopening the app will update it.
</p>

<h2 class="section-head">When these facts get checked again</h2>
<p>
	Task codes, exam weights, cycle lengths and unit counts are restated from documents the
	certifying bodies maintain and republish, so they expire. Each one carries the date we have
	committed to checking it against its source again, and the build will not call itself a
	release once any of them has passed — it publishes as a preview instead, with the banner on.
	These are our own deadlines, not dates anybody else publishes.
</p>
<table class="schedule">
	<caption class="visually-hidden">Facts restated from a maintained document</caption>
	<thead>
		<tr>
			<th scope="col">What</th>
			<th scope="col">Checked against</th>
			<th scope="col">Re-check by</th>
		</tr>
	</thead>
	<tbody>
		{#each reviewScheduleRows as row (row.id)}
			<tr>
				<th scope="row">{row.label}</th>
				<td>{row.against ?? '—'}</td>
				<td>{row.nextReviewDue ?? 'not set'}</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.schedule {
		border-collapse: collapse;
		width: 100%;
		max-width: 44rem;
		font-size: 0.92rem;
	}

	.schedule th,
	.schedule td {
		text-align: left;
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}

	.schedule th[scope='row'] {
		font-weight: 500;
	}

	.schedule td {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	h1 {
		font-size: 1.5rem;
	}
	.callout {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.5rem 1rem 1rem;
		border-radius: var(--radius);
	}
	.callout h2 {
		margin-top: 1rem;
	}
	.button {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 1rem;
		font-size: 0.95rem;
	}
	dt {
		font-weight: 600;
		color: var(--text-muted);
	}
	dd {
		margin: 0;
	}
	.note {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
</style>
