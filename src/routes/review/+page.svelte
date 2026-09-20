<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { KIND_LABELS, type ReviewableKind } from '$lib/content/reviewable.js';
	import { TIER_LABELS, TIER_NOTES, type ReviewTier } from '$lib/content/tier.js';
	import { RELEASE_MINIMUM_TERMS } from '@aba/content-schema/runtime';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { review } from '$lib/state/review.svelte.js';
	import { SITTING_SIZES } from '$lib/review/sitting.js';
	import { downloadBlob } from '$lib/util/download.js';

	let copied = $state(false);
	let confirmingReset = $state(false);

	onMount(() => void review.load());

	const kinds = Object.keys(KIND_LABELS) as ReviewableKind[];
	const item = $derived(review.current);
	const decision = $derived(item ? review.decisions[item.id] : undefined);
	const counts = $derived(review.counts);
	const gate = $derived(review.gate);
	const launch = $derived(review.launchLoad);
	const tiers: ReviewTier[] = ['A', 'B', 'C'];
	const meta = $derived(item ? review.metaFor(item) : null);

	/*
	 * Sitting sizes worth offering, which depends on what is actually left.
	 *
	 * Offering twenty when three remain would quote a cost for seventeen items that do not
	 * exist, and then end the sitting early for reasons the reviewer cannot see. Below the
	 * smallest size the only honest offer is "what is left".
	 */
	const left = $derived(review.queue.length);
	const offers = $derived.by(() => {
		const fits = SITTING_SIZES.filter((n) => n <= left);
		const sizes: number[] = fits.length > 0 ? [...fits] : left > 0 ? [left] : [];
		return sizes.map((n) => ({ n, minutes: review.sittingCost(n) }));
	});
	const tallied = $derived(review.sittingTally);

	async function carryBatch(name: string) {
		const s = review.samples.get(name);
		await review.carryBatch(name);
		announcer.announce(`${s?.carried.length ?? 0} terms carried by the ${name} draw`);
	}

	let headingEl = $state<HTMLElement | null>(null);

	async function decide(d: 'approved' | 'needs-change') {
		if (!item) return;
		const title = item.title;
		await review.decide(d);
		announcer.announce(d === 'approved' ? `Approved: ${title}` : `Flagged: ${title}`);
		/*
		 * Put focus on the item that just arrived.
		 *
		 * Necessary rather than decorative: a flag is submitted from inside the note, and
		 * focus stayed there afterwards — so the next `a` typed the letter a into the note
		 * instead of approving, which breaks the keyboard flow at the exact point it is
		 * most useful. Moving to the heading also tells a screen reader that the card
		 * underneath it has changed, which nothing else on this page does.
		 */
		requestAnimationFrame(() => headingEl?.focus());
	}

	let noteEl = $state<HTMLTextAreaElement | null>(null);
	let showKeys = $state(false);

	/**
	 * Keys, because the cost of a review is the friction between items.
	 *
	 * Approving was already one key and flagging was click, type, click — which had it
	 * exactly backwards. A flag is the decision that carries information, and it is the one
	 * worth making cheap. `f` starts one by putting the cursor in the note; Ctrl or Cmd
	 * with Enter submits it from inside the textarea, since a bare Enter has to stay a
	 * newline in a field where people write sentences.
	 */
	function onKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

		if (typing) {
			// The one combination that works while typing: submit the flag being written.
			if (target?.id === 'note' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				void decide('needs-change');
			}
			return;
		}

		if (e.key === '?') {
			e.preventDefault();
			showKeys = !showKeys;
		} else if (e.key === 'a') {
			e.preventDefault();
			void decide('approved');
		} else if (e.key === 'f') {
			/*
			 * Starts a flag rather than making one. A flag without a reason cannot be acted
			 * on later, so the note stays required and this only saves the reach for it.
			 *
			 * Focused after the event rather than during it. Moving focus into the textarea
			 * inside the handler makes it the target for the rest of this keystroke, and
			 * preventing the default on the window no longer stops the insertion — so the
			 * note opened with a stray "f" already typed into it.
			 */
			e.preventDefault();
			requestAnimationFrame(() => noteEl?.focus());
		} else if (e.key === 's') {
			e.preventDefault();
			review.skip();
		} else if (e.key === 'b') {
			e.preventDefault();
			review.back();
		}
	}

	/** The shortcuts, in one place, because six keys do not fit on button labels. */
	const KEYS: { key: string; does: string }[] = [
		{ key: 'A', does: 'Approve' },
		{ key: 'F', does: 'Start a flag (types into the note)' },
		{ key: 'Ctrl or ⌘ + Enter', does: 'Submit the flag you are writing' },
		{ key: 'S', does: 'Skip without deciding' },
		{ key: 'B', does: 'Back to the previous item' },
		{ key: '?', does: 'Show or hide this list' }
	];

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

<Seo
	title="Content review"
	description="Reviewer tool for approving content before release."
	noindex
/>

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
		The release gate, before the tiers.

		The backlog is the wrong number to lead with. What stands between this app and a
		reader is four small complete-or-nothing kinds and a floor on the glossary, and
		that is normally a couple of dozen entries rather than the hundreds below. Leading
		with the backlog made the queue look like a wall; leading with this makes it a
		path with a stated end.
	-->
	<section class="gate" aria-labelledby="gate-heading" data-gate={gate.met ? 'met' : 'open'}>
		<h2 id="gate-heading">Getting this published</h2>

		{#if gate.met}
			<p class="verdict good">
				The content files clear the release gate. The next build will publish as a release and
				let search engines in.
			</p>
		{:else}
			<p class="verdict">
				<strong>{gate.remaining}</strong>
				{gate.remaining === 1 ? 'entry stands' : 'entries stand'} between this app and an indexed
				site. Everything else is withheld from a release rather than blocking it, so the backlog
				below is not the wall.
			</p>
		{/if}

		<ul class="reqs">
			{#each gate.requirements as r (r.id)}
				<li data-req={r.id} class:done={r.remaining === 0}>
					<span class="req-label">{r.label}</span>
					<span class="req-count">
						{r.approved} of {r.total}
						{#if r.remaining === 0}
							<span class="flag ok">complete</span>
						{:else if r.pending > 0}
							<span class="flag">{r.pending} pending export</span>
						{/if}
					</span>
				</li>
			{/each}
			<li data-req="terms" class:done={gate.floor.remaining === 0}>
				<span class="req-label">{gate.floor.label}</span>
				<span class="req-count">
					{gate.floor.approved} of {gate.floor.needed}
					{#if gate.floor.remaining === 0}
						<span class="flag ok">complete</span>
					{:else if gate.floor.pending > 0}
						<span class="flag">{gate.floor.pending} pending export</span>
					{/if}
				</span>
			</li>
		</ul>

		{#if !gate.met}
			<div class="gate-actions">
				<!--
					A toggle, so the label stays put and aria-pressed carries the state. Flipping
					the label as well would have a screen reader announce "Reviewing everything,
					pressed", which says the opposite of what is happening.
				-->
				<button
					type="button"
					data-gate-toggle
					class:active={review.gateOnly}
					aria-pressed={review.gateOnly}
					onclick={() => review.setGateOnly(!review.gateOnly)}
				>
					Review the launch set
				</button>
				<p class="gate-cost" data-launch-cost>
					{#if launch.left === 0}
						Nothing left to read in the launch set.
					{:else}
						<strong>{launch.left}</strong> to read · about
						<strong>{launch.minutes} min</strong>
						· {launch.total} entries in the set
					{/if}
				</p>
				<p class="hint">
					The four kinds above, complete, and {RELEASE_MINIMUM_TERMS} glossary terms — first every
					term an escalation card or the RBT outline's own tasks name, because those pages ship whole
					and a link into a withheld term is pruned out of them rather than left dangling, then the
					most-cited of the rest to make up the number. Nothing else: the other terms, the questions
					and the guidance situations are withheld from a release individually and can wait.
				</p>
				{#if gate.metAfterExport}
					<p class="verdict good" role="status">
						Every entry the gate needs is decided here. Export and apply the decisions and the
						next build is a release.
					</p>
				{/if}
			</div>
		{/if}

		<p class="gate-note" role="note">
			Decisions made here have not reached the content files, so a build cannot see them yet.
			The counts above read the files; anything marked pending is waiting on an export.
		</p>
	</section>

	<!--
		Tier next, because the rest of the queue is otherwise hundreds of items in no
		particular order and the only rational way through it is
		hardest-consequence-first.
	-->
	{#if !review.gateOnly}
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
	{/if}

	{#if !review.gateOnly && review.tier !== 'all'}
		<p class="tier-note">{TIER_NOTES[review.tier]}</p>
	{/if}

	{#if review.gateOnly || review.tier === 'C'}
		<div class="field sample-rate">
			<label for="rate">
				{review.gateOnly
					? 'Read this much of each launch-set category'
					: 'Read this much of each glossary batch'}
			</label>
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

	<!--
		The sitting. Two and a quarter hours of reading does not get done because two and a
		quarter hours is not a thing anybody sits down and does; ten items is. This is the
		same shape the app gives a reader for a study session, pointed at the one person who
		has to do the reviewing.
	-->
	{#if !review.sittingActive}
		{#if offers.length > 0}
			<section class="sitting-start" aria-labelledby="sitting-heading">
				<h2 id="sitting-heading">Do a sitting</h2>
				<p class="hint">
					Pick a number and stop when it is done. The whole queue is not a plan; this is.
				</p>
				<div class="sizes">
					{#each offers as o (o.n)}
						<button type="button" onclick={() => review.startSitting(o.n)}>
							{o.n === left && o.n < SITTING_SIZES[0] ? `The last ${o.n}` : `${o.n} items`}
							<span class="cost">about {o.minutes} min</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}
	{:else}
		<section class="sitting-now" aria-labelledby="sitting-now-heading">
			<h2 id="sitting-now-heading" class="visually-hidden">This sitting</h2>
			<p class="sitting-line">
				<strong data-sitting-done={tallied.done}
					>{tallied.done} of {review.sittingTarget}</strong
				>
				in this sitting · {left}
				{left === 1 ? 'item' : 'items'} left in this selection
				<button type="button" class="linkish" onclick={() => review.endSitting()}>
					End the sitting
				</button>
			</p>
			<div
				class="sitting-bar"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={review.sittingTarget ?? 0}
				aria-valuenow={tallied.done}
				aria-label="Items decided in this sitting"
			>
				<span
					class="fill"
					style="width: {Math.min(
						100,
						review.sittingTarget ? (100 * tallied.done) / review.sittingTarget : 0
					)}%"
				></span>
			</div>
		</section>
	{/if}

	{#if review.sittingActive && (review.sittingFinished || !item)}
		<!--
			The finish line, and the reason the whole thing exists. A queue that never says
			"that is done" is a queue somebody stops opening.
		-->
		<section class="sitting-done" aria-labelledby="sitting-done-heading" data-sitting="done">
			<h2 id="sitting-done-heading">
				{review.sittingFinished ? 'Sitting done' : 'Nothing left to read in this selection'}
			</h2>
			<p class="figures">
				<strong>{tallied.done}</strong>
				{tallied.done === 1 ? 'item' : 'items'} decided ·
				<strong>{tallied.approved}</strong> approved ·
				<strong data-sitting-flagged={tallied.flagged}>{tallied.flagged}</strong> flagged
				{#if review.sittingMinutes() > 0}
					· started {review.sittingMinutes()} min ago
				{/if}
			</p>
			{#if launch.left > 0}
				<p class="hint">
					{launch.left} to read before a release, about {launch.minutes} minutes. Nothing is published
					until they are exported and applied in git.
				</p>
			{/if}
			<div class="actions">
				{#if offers.length > 0}
					<button
						type="button"
						class="approve"
						onclick={() => review.startSitting(offers[0]!.n)}
					>
						Another {offers[0]!.n}
					</button>
				{/if}
				<button type="button" onclick={() => review.endSitting()}>
					Keep going without a sitting
				</button>
			</div>
		</section>
	{:else if item}
		<article class="card">
			<header>
				<p class="kind">
					{KIND_LABELS[item.kind]}
					<span class="id">{item.id}</span>
					{#if item.status !== 'in-review'}<span class="status">status: {item.status}</span
						>{/if}
				</p>
				<!-- Focus target after a decision; see `decide`. -->
				<h2 tabindex="-1" bind:this={headingEl}>{item.title}</h2>
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
				Needs a change <span class="key">F</span>
			</button>
			<button type="button" onclick={() => review.skip()}
				>Skip <span class="key">S</span></button
			>
			<button type="button" onclick={() => review.back()}
				>Back <span class="key">B</span></button
			>
		</div>

		<div class="field note">
			<label for="note">What needs changing (required to flag)</label>
			<textarea
				id="note"
				rows="3"
				bind:this={noteEl}
				bind:value={review.note}
				placeholder="The non-example is really an example; the citation does not support the claim; …"
			></textarea>
			<p class="hint">
				Ctrl or ⌘ with Enter submits the flag from here, so a flag never needs the mouse.
			</p>
		</div>

		<!--
			Six keys do not fit on button labels, and a shortcut nobody can find is a shortcut
			nobody uses. Toggled by the button or by "?".
		-->
		<p class="keys-toggle">
			<button
				type="button"
				class="linkish"
				aria-expanded={showKeys}
				onclick={() => (showKeys = !showKeys)}
			>
				{showKeys ? 'Hide' : 'Show'} keyboard shortcuts
				<span class="key">?</span>
			</button>
		</p>
		{#if showKeys}
			<dl class="keys">
				{#each KEYS as k (k.key)}
					<div>
						<dt>{k.key}</dt>
						<dd>{k.does}</dd>
					</div>
				{/each}
			</dl>
		{/if}
	{:else}
		<p class="done">
			Nothing left in this selection. Change the filter, uncheck "hide decided", or export
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
		<!--
			One command, no path. The file is looked for in the places a browser puts
			downloads, because four steps of administration on the end of a fifteen-minute
			sitting is how the sitting stops happening.
		-->
		<p class="hint">
			Then, in the repo: <code>npm run review:apply</code> — it finds the file you just
			downloaded. <code>npm run review:check</code> does the same without writing anything.
		</p>
		<p class="hint">
			<a href={resolve('/about')}>About this app</a>
		</p>
	</section>
{/if}

<style>
	/* The gate leads, so it is the one block on the page with a border. */
	.gate {
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 0.75rem;
		margin-bottom: 1rem;
	}

	.gate[data-gate='met'] {
		border-left-color: var(--go-border, var(--accent));
	}

	.gate[data-gate='open'] {
		border-left-color: var(--caution-border, var(--border));
	}

	.gate h2 {
		font-size: 1.05rem;
		margin: 0 0 0.5rem;
	}

	.verdict {
		margin: 0 0 0.6rem;
	}

	.verdict strong {
		font-size: 1.3rem;
		font-variant-numeric: tabular-nums;
	}

	.reqs {
		list-style: none;
		margin: 0 0 0.6rem;
		padding: 0;
	}

	.reqs li {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.3rem 0.75rem;
		padding: 0.35rem 0;
		border-top: 1px solid var(--border);
	}

	.req-count {
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
	}

	/* Never colour alone: a finished requirement says "complete" as well. */
	.reqs li.done .req-count {
		color: var(--text);
		font-weight: 600;
	}

	.flag {
		display: inline-block;
		margin-left: 0.4rem;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.05rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.gate-actions button {
		width: 100%;
		min-height: var(--tap);
		font-weight: 600;
	}

	.gate-actions button.active {
		box-shadow: inset 0 0 0 2px var(--accent);
	}

	.gate-note {
		margin: 0.6rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.gate-cost {
		margin: 0.5rem 0 0.35rem;
		font-size: 0.95rem;
	}

	.gate-actions .hint {
		margin: 0;
	}

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
	/* Selects take their chrome from app.css; these are the text controls beside them. */
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
	/* ------------------------------------------------------------- the sitting */

	.sitting-start,
	.sitting-now,
	.sitting-done {
		max-width: 44rem;
		margin: 1rem 0;
	}

	.sitting-start,
	.sitting-done {
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius);
		background: var(--surface-raised);
	}

	.sitting-start h2,
	.sitting-done h2 {
		font-size: 1.05rem;
		margin: 0 0 0.35rem;
	}

	.sizes {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.sizes button {
		display: grid;
		gap: 0.1rem;
		min-height: var(--tap);
		padding: 0.4rem 0.8rem;
	}

	.cost {
		font-size: 0.8rem;
		color: var(--text-muted);
		font-weight: 400;
	}

	.sitting-line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem;
		margin: 0 0 0.35rem;
		font-size: 0.95rem;
	}

	/*
	 * A button that reads as a link. It ends a sitting rather than navigating, so it stays
	 * a button for the keyboard and the screen reader and only borrows the appearance.
	 */
	.linkish {
		background: none;
		border: none;
		padding: 0.25rem;
		min-height: var(--tap);
		color: var(--text-muted);
		text-decoration: underline;
		cursor: pointer;
		font-size: 0.9em;
	}

	.sitting-bar {
		height: 6px;
		border-radius: 3px;
		background: var(--surface);
		border: 1px solid var(--hair);
		overflow: hidden;
	}

	.sitting-bar .fill {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.sitting-done .figures {
		margin: 0 0 0.5rem;
		font-size: 1.02rem;
	}

	.card h2:focus-visible {
		outline: 3px solid var(--focus);
		outline-offset: 3px;
	}

	.keys-toggle {
		margin: 0.5rem 0 0;
	}

	.keys {
		display: grid;
		gap: 0.3rem;
		max-width: 34rem;
		margin: 0.4rem 0 0;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		font-size: 0.9rem;
	}

	.keys div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: baseline;
	}

	.keys dt {
		flex: none;
		font-weight: 600;
		font-family: var(--mono, ui-monospace, monospace);
	}

	.keys dd {
		margin: 0;
		color: var(--text-muted);
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
