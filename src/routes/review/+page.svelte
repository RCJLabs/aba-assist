<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { KIND_LABELS, type ReviewableKind } from '$lib/content/reviewable.js';
	import { TIER_LABELS, TIER_NOTES, type ReviewTier } from '$lib/content/tier.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { review } from '$lib/state/review.svelte.js';
	import { downloadBlob } from '$lib/util/download.js';

	let copied = $state(false);
	let confirmingReset = $state(false);

	onMount(() => void review.load());

	const kinds = Object.keys(KIND_LABELS) as ReviewableKind[];
	const item = $derived(review.current);
	const decision = $derived(item ? review.decisions[item.id] : undefined);
	const counts = $derived(review.counts);
	const tiers: ReviewTier[] = ['A', 'B', 'C'];
	const meta = $derived(item ? review.metaFor(item) : null);

	async function carryBatch(name: string) {
		const s = review.samples.get(name);
		await review.carryBatch(name);
		announcer.announce(`${s?.carried.length ?? 0} terms carried by the ${name} draw`);
	}

	async function decide(d: 'approved' | 'needs-change') {
		if (!item) return;
		const title = item.title;
		await review.decide(d);
		announcer.announce(d === 'approved' ? `Approved: ${title}` : `Flagged: ${title}`);
	}

	function onKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
		if (e.key === 'a') {
			e.preventDefault();
			void decide('approved');
		} else if (e.key === 's') {
			e.preventDefault();
			review.skip();
		}
	}

	function download() {
		downloadBlob(
			`aba-assist-review-${new Date().toISOString().slice(0, 10)}.json`,
			review.exportPayload(),
			'application/json'
		);
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(review.exportPayload());
			copied = true;
			announcer.announce('Decisions copied to the clipboard');
			setTimeout(() => (copied = false), 3000);
		} catch {
			copied = false;
		}
	}
</script>

<svelte:head>
	<title>Content review — ABA Assist</title>
	<meta name="description" content="Reviewer tool for approving content before release." />
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window onkeydown={onKey} />

<h1>Content review</h1>

<!--
  Deterministic hook for the end-to-end tests, and only that. The queue loads the whole
  corpus asynchronously, so a test that waits on rendered text is really waiting on a
  race; this says plainly which state the page is in.
-->
<div data-review-status={review.status} hidden></div>

{#if review.status === 'loading' || review.status === 'idle'}
	<p>Loading the whole corpus…</p>
{:else if review.status === 'unavailable'}
	<p class="warn">
		This tool needs local storage to remember your decisions, and this browser has blocked it.
		Decisions would be lost, so the queue is disabled rather than pretending to work.
	</p>
{:else}
	<p class="lede">
		Nothing here reaches a reader until an export is applied to the content files in git. Your
		decisions stay on this device until you export them.
	</p>

	<dl class="stats" aria-live="polite">
		<div>
			<dt>Decided</dt>
			<dd>{counts.decided} / {counts.total}</dd>
		</div>
		<div>
			<dt>Approved</dt>
			<dd>{counts.approved}</dd>
		</div>
		<div>
			<dt>Flagged</dt>
			<dd>{counts.flagged}</dd>
		</div>
		<div>
			<dt>Left</dt>
			<dd>{counts.total - counts.decided}</dd>
		</div>
	</dl>

	<!--
		Tier first, because the queue is otherwise four hundred items in no particular
		order and the only rational way through it is hardest-consequence-first.
	-->
	<div class="tiers" role="group" aria-label="Review tier">
		{#each tiers as t (t)}
			{@const load = review.tierLoad(t)}
			<button
				type="button"
				class:active={review.tier === t}
				onclick={() => review.setTier(t)}
				aria-pressed={review.tier === t}
			>
				<strong>Tier {t}</strong>
				<span class="tier-label">{TIER_LABELS[t]}</span>
				<span class="tier-load">
					{#if load.left === 0}
						done
					{:else}
						{load.left} to read · about {load.minutes} min
					{/if}
				</span>
			</button>
		{/each}
		<button
			type="button"
			class:active={review.tier === 'all'}
			onclick={() => review.setTier('all')}
			aria-pressed={review.tier === 'all'}
		>
			<strong>Everything</strong>
			<span class="tier-label">No ordering</span>
			<span class="tier-load">{counts.total - counts.decided} left</span>
		</button>
	</div>

	{#if review.tier !== 'all'}
		<p class="tier-note">{TIER_NOTES[review.tier]}</p>
	{/if}

	{#if review.tier === 'C'}
		<div class="field sample-rate">
			<label for="rate">Read this much of each glossary batch</label>
			<select
				id="rate"
				value={String(review.sampleRate)}
				onchange={(e) => (review.sampleRate = Number(e.currentTarget.value))}
			>
				<option value="1">All of it — no sampling</option>
				<option value="0.5">Half</option>
				<option value="0.25">A quarter</option>
				<option value="0.1">A tenth</option>
			</select>
			<p class="hint">
				Approving a batch on its sample records the rest as approved
				<strong>without anybody reading them</strong>. Each carried file says so, and says
				which draw carried it. How much is enough is your call, not the author's.
			</p>
		</div>
	{/if}

	<div class="controls">
		<div class="field">
			<label for="kind">Reviewing</label>
			<select
				id="kind"
				value={review.kind}
				onchange={(e) => review.setKind(e.currentTarget.value as ReviewableKind | 'all')}
			>
				<option value="all">Everything ({counts.total})</option>
				{#each kinds as k (k)}
					{@const c = review.countsFor(k)}
					<option value={k}>{KIND_LABELS[k]} ({c.decided}/{c.total})</option>
				{/each}
			</select>
		</div>
		<label class="switch">
			<input type="checkbox" bind:checked={review.hideDecided} />
			<span>Hide items I have already decided</span>
		</label>
	</div>

	{#if item}
		<article class="card">
			<header>
				<p class="kind">
					{KIND_LABELS[item.kind]}
					<span class="id">{item.id}</span>
					{#if item.status !== 'in-review'}<span class="status">status: {item.status}</span
						>{/if}
				</p>
				<h2>{item.title}</h2>
				<p class="subtitle">{item.subtitle}</p>
				{#if meta}
					<p class="tier-why">
						<span class="badge" data-tier={meta.tier}>Tier {meta.tier}</span>
						{meta.reason}
					</p>
				{/if}
			</header>

			{#each item.fields as f (f.label)}
				{#if f.lines.length > 0}
					<section class="field-block">
						<h3>{f.label}</h3>
						{#each f.lines as line, i (i)}
							<p>{line}</p>
						{/each}
					</section>
				{/if}
			{/each}

			<section class="field-block prov">
				<h3>Written from</h3>
				<ul>
					{#each item.citations as c, i (i)}<li>{c}</li>{/each}
				</ul>
				{#if item.consulted}<p class="consulted">{item.consulted}</p>{/if}
				{#if item.href}
					<!-- Already resolved against the base path where the item was built. -->
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<p><a href={item.href}>Open the page a reader sees</a></p>
				{/if}
			</section>
		</article>

		{#if decision}
			<p class="decided" role="status">
				Already {decision.decision === 'approved' ? 'approved' : 'flagged'}{#if decision.note}:
					{decision.note}{/if}
			</p>
		{/if}

		<div class="actions">
			<button type="button" class="approve" onclick={() => decide('approved')}>
				Approve <span class="key">A</span>
			</button>
			<button
				type="button"
				class="flag"
				disabled={review.note.trim().length === 0}
				onclick={() => decide('needs-change')}
			>
				Needs a change
			</button>
			<button type="button" onclick={() => review.skip()}
				>Skip <span class="key">S</span></button
			>
			<button type="button" onclick={() => review.back()}>Back</button>
		</div>

		<div class="field note">
			<label for="note">What needs changing (required to flag)</label>
			<textarea
				id="note"
				rows="3"
				bind:value={review.note}
				placeholder="The non-example is really an example; the citation does not support the claim; …"
			></textarea>
		</div>
	{:else}
		<p class="done">
			Nothing left in this selection. Change the filter, untick "hide decided", or export
			below.
		</p>
	{/if}

	{#if review.tier === 'C'}
		<section class="batches">
			<h2>Glossary batches</h2>
			<p class="hint">
				Each batch is one category. Read its draw, then decide whether the draw is enough to
				carry the rest.
			</p>
			<ul>
				{#each [...review.samples] as [name, s] (name)}
					{@const state = review.batchState(name)}
					<li data-state={state}>
						<div>
							<strong>{name.replace('term:', '')}</strong>
							<span class="hint">
								{s.drawn.length} drawn of {s.drawn.length + s.carried.length}
								{#if state === 'flagged'}
									· a drawn item was flagged, so this batch needs reading
								{:else if state === 'carried'}
									· {s.carried.length} carried by this draw
								{:else if state === 'ready'}
									· the draw is clean
								{:else}
									· draw not finished
								{/if}
							</span>
						</div>
						<button
							type="button"
							disabled={state !== 'ready'}
							onclick={() => {
								review.setTier('C');
								void carryBatch(name);
							}}
						>
							{#if state === 'carried'}
								Carried
							{:else}
								Carry {s.carried.length} on this draw
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="export">
		<h2>Export</h2>
		<div class="field">
			<label for="reviewer">Your reviewer id (lower-case, no spaces)</label>
			<input
				id="reviewer"
				type="text"
				value={review.reviewer}
				oninput={(e) => review.setReviewer(e.currentTarget.value)}
				placeholder="evan"
				autocapitalize="none"
				autocomplete="off"
				spellcheck="false"
			/>
			{#if review.reviewer && !review.reviewerValid}
				<p class="hint warn-text">
					Use lower-case letters, digits and hyphens. It is written into the content files as
					the person who approved them.
				</p>
			{/if}
		</div>
		<p class="hint">
			This is recorded as who approved each item. It must not be the author, because the build
			rejects an approval signed by the person who wrote the entry.
		</p>
		<div class="actions">
			<button
				type="button"
				class="approve"
				disabled={counts.decided === 0 || !review.reviewerValid}
				onclick={download}>Download decisions</button
			>
			<button
				type="button"
				disabled={counts.decided === 0 || !review.reviewerValid}
				onclick={copy}>{copied ? 'Copied' : 'Copy to clipboard'}</button
			>
			{#if confirmingReset}
				<button
					type="button"
					class="flag"
					onclick={async () => {
						await review.reset();
						confirmingReset = false;
					}}>Really discard all {counts.decided}?</button
				>
				<button type="button" onclick={() => (confirmingReset = false)}>Cancel</button>
			{:else}
				<button type="button" onclick={() => (confirmingReset = true)}
					>Discard decisions</button
				>
			{/if}
		</div>
		<p class="hint">
			Then apply them: <code>npm run content:apply-review -- --file=&lt;the file&gt;</code>
		</p>
		<p class="hint">
			<a href={resolve('/about')}>About this app</a>
		</p>
	</section>
{/if}

<style>
	.tiers {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.tiers button {
		display: grid;
		gap: 0.15rem;
		text-align: left;
		padding: 0.6rem 0.75rem;
		min-height: var(--tap);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.tiers button.active {
		border-color: var(--accent);
		border-width: 2px;
		padding: calc(0.6rem - 1px) calc(0.75rem - 1px);
	}
	.tier-label,
	.tier-load {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.tier-note,
	.hint {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.sample-rate {
		border: 1px solid var(--caution-border);
		background: var(--caution-bg);
		border-radius: var(--radius);
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.sample-rate .hint {
		color: var(--caution-text);
	}
	.tier-why {
		margin: 0.35rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
	}
	/* Never colour alone: the badge carries the letter. */
	.badge {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.05rem 0.4rem;
		font-weight: 700;
		color: var(--text);
	}
	.badge[data-tier='A'] {
		border-color: var(--stop-border);
		color: var(--stop-text);
	}
	.batches ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	.batches li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		justify-content: space-between;
		border: 1px solid var(--border);
		border-left: 4px solid var(--border);
		border-radius: var(--radius);
		padding: 0.5rem 0.75rem;
	}
	.batches li[data-state='flagged'] {
		border-left-color: var(--stop-border);
	}
	.batches li[data-state='carried'] {
		border-left-color: var(--accent);
	}
	.batches li[data-state='ready'] {
		border-left-color: var(--caution-border);
	}
	.batches button {
		min-height: var(--tap);
		padding: 0 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.batches button:disabled {
		opacity: 0.55;
		cursor: default;
	}
	h1 {
		font-size: 1.5rem;
	}
	.lede,
	.hint,
	.subtitle,
	.consulted,
	.id,
	.status {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.warn,
	.warn-text {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
		margin: 1rem 0;
	}
	@media (min-width: 36rem) {
		.stats {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.stats div {
		background: var(--surface);
		border-radius: var(--radius);
		padding: 0.6rem 0.8rem;
	}
	.stats dt {
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.stats dd {
		margin: 0;
		font-size: 1.3rem;
		font-weight: 700;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		align-items: flex-end;
		margin-bottom: 1rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
		flex: 1 1 14rem;
	}
	.field label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}
	select,
	input[type='text'],
	textarea {
		font: inherit;
		color: var(--text);
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		max-width: 100%;
	}
	textarea {
		min-height: 4.5rem;
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--tap);
		font-size: 0.9rem;
	}
	.switch input {
		width: 1.15rem;
		height: 1.15rem;
	}
	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		padding: 1rem;
	}
	.kind {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin: 0;
	}
	.id {
		font-family: ui-monospace, monospace;
		text-transform: none;
		letter-spacing: 0;
	}
	.status {
		text-transform: none;
		font-weight: 700;
	}
	.card h2 {
		font-size: 1.15rem;
		margin: 0.25rem 0;
	}
	.field-block {
		margin-top: 1.25rem;
	}
	.field-block h3 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-bottom: 0.25rem;
	}
	.field-block p {
		white-space: pre-wrap;
		margin: 0 0 0.5rem;
	}
	.prov {
		border-top: 1px solid var(--border);
		padding-top: 0.75rem;
		font-size: 0.9rem;
	}
	.prov ul {
		padding-left: 1.2rem;
		margin: 0;
	}
	.consulted {
		font-style: italic;
	}
	.decided {
		background: var(--surface);
		border-radius: var(--radius);
		padding: 0.5rem 0.8rem;
		font-size: 0.9rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
	}
	/* Colour supports the labels; the words carry the meaning. */
	.approve {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}
	.flag {
		border-color: var(--stop-border);
		color: var(--stop-text);
	}
	button:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.key {
		font-size: 0.75rem;
		opacity: 0.8;
		border: 1px solid currentColor;
		border-radius: 4px;
		padding: 0 0.25rem;
		margin-left: 0.3rem;
	}
	.note {
		max-width: 40rem;
	}
	.done {
		background: var(--surface);
		padding: 0.75rem 1rem;
		border-radius: var(--radius);
	}
	.export {
		margin-top: 2.5rem;
		padding-top: 1rem;
		border-top: 2px solid var(--border);
	}
	.export h2 {
		font-size: 1.15rem;
	}
	code {
		background: var(--surface);
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
		font-size: 0.85em;
	}
</style>
