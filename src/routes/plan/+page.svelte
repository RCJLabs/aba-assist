<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { plan } from '$lib/state/plan.svelte.js';
	import { filters, CREDENTIAL_OPTIONS } from '$lib/state/filters.svelte.js';
	import type { Action } from '$lib/study/plan.js';

	onMount(() => void plan.load());

	const uid = $props.id();
	const pct = (n: number) => `${Math.round(n * 100)}%`;

	async function take(a: Action) {
		plan.focus(a.letter);
		if (a.kind === 'drill' || a.kind === 'answer-more') await goto(resolve('/quiz'));
		else if (a.kind === 'simulate') await goto(resolve('/quiz'));
		else await goto(resolve('/study'));
	}

	async function setCredential(value: string) {
		filters.set({ credential: value as 'all' | 'RBT' | 'BCBA' | 'BCaBA' });
		await plan.load();
	}
</script>

<svelte:head>
	<title>What to study next — ABA Assist</title>
	<meta
		name="description"
		content="Your practice history read as a set of next actions, with an accuracy reported only where enough has been answered to mean anything."
	/>
</svelte:head>

<h1>What to study next</h1>

<p class="lede">
	Built from the questions you have already answered and the cards you have already seen.
	Nothing here is sent anywhere, and nothing new is recorded to produce it.
</p>

<div data-plan-status={plan.status} hidden></div>

{#if plan.status === 'unavailable'}
	<p class="warn">
		This needs local storage and the browser has blocked it, so there is no practice history to
		plan from.
	</p>
{:else if plan.status !== 'ready'}
	<p class="hint">Reading your history…</p>
{:else}
	<div class="field">
		<label for="{uid}-cred">Planning for</label>
		<select
			id="{uid}-cred"
			value={filters.credential}
			onchange={(e) => setCredential(e.currentTarget.value)}
		>
			{#each CREDENTIAL_OPTIONS as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>
	</div>

	{#if plan.attempts === 0}
		<section class="empty">
			<h2>Nothing to go on yet</h2>
			<p>
				Answer some practice questions and this fills in. It needs about as many answers in
				each area as the real paper asks there before it will report a number for that area.
			</p>
			<a class="button primary" href={resolve('/quiz')}>Start practising</a>
		</section>
	{:else}
		<section class="summary">
			<h2>Where you stand</h2>
			{#if plan.summary.overall === null}
				<p>
					<strong>{plan.summary.measured} of {plan.summary.total} areas</strong>
					{plan.summary.measured === 1 ? 'has' : 'have'} enough answers to report on, across {plan
						.summary.answered}
					{plan.summary.answered === 1 ? 'answer' : 'answers'}. There is no overall figure
					until every area has been sampled — an average over whichever areas you happened to
					practise says more about your choice of practice than about what you know.
				</p>
			{:else}
				<p>
					<strong>{pct(plan.summary.overall)}</strong> across {plan.summary.answered} answers, with
					every area sampled.
				</p>
			{/if}
			<p class="caveat">
				This is your accuracy on <em>this app's</em> questions. It is not a score, not a prediction,
				and not a probability of passing: a bank written by one author is not a calibrated instrument,
				and nothing here has been validated against the real exam.
			</p>
		</section>

		<section>
			<h2>Do this next</h2>
			{#if plan.next.length === 0}
				<p class="hint">
					Nothing is weak, nothing is due and every area has been sampled. Keep the cards
					ticking over and sit a simulation when you want the pace.
				</p>
			{:else}
				<ol class="actions">
					{#each plan.next as a (a.kind + (a.letter ?? ''))}
						<li>
							<div>
								<strong>{a.title}</strong>
								<span class="detail">{a.detail}</span>
							</div>
							<button type="button" onclick={() => take(a)}>
								{#if a.kind === 'review-due'}Review{:else if a.kind === 'learn-terms'}Learn{:else if a.kind === 'simulate'}Simulate{:else}Practise{/if}
							</button>
						</li>
					{/each}
				</ol>
			{/if}
		</section>

		<section>
			<h2>By area</h2>
			<ul class="areas">
				{#each plan.stats as s (s.letter)}
					<li data-measured={s.accuracy !== null}>
						<div class="area-head">
							<strong>{s.letter} · {s.name}</strong>
							<span class="weight">{s.weight ?? '?'}% of the paper</span>
						</div>
						{#if s.accuracy === null}
							<p class="detail">
								{#if s.answered === 0}
									Nothing answered here yet.
								{:else}
									{s.answered} answered — {s.needed} more before this app will state a percentage.
								{/if}
							</p>
						{:else}
							<div
								class="bar"
								role="progressbar"
								aria-valuenow={Math.round(s.accuracy * 100)}
								aria-valuemin="0"
								aria-valuemax="100"
								aria-label="{s.name} accuracy"
							>
								<span style="width: {Math.round(s.accuracy * 100)}%"></span>
							</div>
							<p class="detail">
								{pct(s.accuracy)} of {s.answered} answered{#if s.unstudiedTerms.length > 0}
									· {s.unstudiedTerms.length} terms here not studied yet{/if}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<style>
	h1 {
		font-size: 1.5rem;
	}
	.lede,
	.hint,
	.detail,
	.caveat {
		color: var(--text-muted);
		font-size: 0.95rem;
	}
	section {
		margin: 1.5rem 0;
	}
	h2 {
		font-size: 1.15rem;
	}
	.field {
		display: grid;
		gap: 0.25rem;
		max-width: 20rem;
	}
	label {
		font-weight: 600;
		font-size: 0.9rem;
	}
	select {
		font: inherit;
		padding: 0.6rem;
		min-height: var(--tap);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
	}
	.summary,
	.empty {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.25rem 1rem 1rem;
		background: var(--surface-raised);
	}
	.caveat {
		border-top: 1px solid var(--border);
		padding-top: 0.6rem;
		font-size: 0.9rem;
	}
	.actions,
	.areas {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.actions li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		border: 1px solid var(--border);
		border-left: 4px solid var(--accent);
		border-radius: var(--radius);
		padding: 0.6rem 0.9rem;
	}
	.actions .detail {
		display: block;
	}
	.actions button {
		min-height: var(--tap);
		padding: 0 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.areas li {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem 0.9rem;
	}
	/* Never colour alone: an unmeasured area says so in words. */
	.areas li[data-measured='false'] {
		border-style: dashed;
	}
	.area-head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: space-between;
		align-items: baseline;
	}
	.weight {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.bar {
		height: 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface);
		margin: 0.4rem 0 0.25rem;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.areas .detail,
	.actions .detail {
		margin: 0.15rem 0 0;
	}
	.warn {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		border-radius: var(--radius);
		padding: 0.75rem;
	}
</style>
