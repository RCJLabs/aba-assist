<script lang="ts">
	import { contentVersion, termIndex } from '$lib/content/load.js';
	import { scenarios } from '$lib/content/scenarios.js';

	import { REPO_URL } from '$lib/config.js';
</script>

<svelte:head>
	<title>About this app — ABA Help</title>
	<meta
		name="description"
		content="What this app is, what it deliberately does not do, and how to report an error."
	/>
</svelte:head>

<h1>About this app</h1>

<section class="callout">
	<h2>This is not clinical advice</h2>
	<p>
		ABA Help is an educational reference. It is not a medical device, it does not diagnose,
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

<h2>What it deliberately does not do</h2>
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

<h2>Where the content comes from</h2>
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

<h2 id="errata">Found an error?</h2>
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

<h2>This build</h2>
<dl>
	<dt>Content version</dt>
	<dd>{contentVersion.contentVersion}</dd>
	<dt>Channel</dt>
	<dd>{contentVersion.channel}</dd>
	<dt>Terms</dt>
	<dd>{termIndex.length}</dd>
	<dt>Situations</dt>
	<dd>{scenarios.length}</dd>
	<dt>Aligned to</dt>
	<dd>RBT Test Content Outline (3rd ed.), effective 1 January 2026</dd>
</dl>

<p class="note">
	If the content version here is older than the one on the website, your device is showing a
	cached copy. Reconnecting and reopening the app will update it.
</p>

<style>
	h1 {
		font-size: 1.5rem;
	}
	h2 {
		font-size: 1.1rem;
		margin-top: 2rem;
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
