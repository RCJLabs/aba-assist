<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import PhiNote from '$lib/components/PhiNote.svelte';
	import PrintButton from '$lib/components/PrintButton.svelte';
	import PrintHeader from '$lib/components/PrintHeader.svelte';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { tracker } from '$lib/state/tracker.svelte.js';
	import {
		TOPICS,
		TOPIC_LABELS,
		WAITING_TOO_LONG_DAYS,
		agenda,
		daysWaiting,
		summarise,
		type QuestionTopic
	} from '$lib/tracker/agenda.js';

	const uid = $props.id();

	let topic = $state<QuestionTopic>('the-plan');
	let superviseeId = $state<string>('');
	let question = $state('');
	let saving = $state(false);

	onMount(() => {
		void tracker.load();
	});

	/*
	 * Resolved once on mount rather than per render. Everything on this page is measured in
	 * whole days, and a clock that advanced mid-session would silently reorder the list
	 * under somebody's finger.
	 */
	const now = Date.now();

	const groups = $derived(agenda(tracker.questions, tracker.supervisees));
	const stats = $derived(summarise(tracker.questions, now));
	const answered = $derived(
		tracker.questions
			.filter((q) => q.answeredAt !== null)
			.sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0))
	);
	const canSave = $derived(question.trim().length > 2 && !saving);
	const codeOf = (id: string | null) =>
		id === null ? null : (tracker.supervisees.find((s) => s.id === id)?.code ?? null);

	async function park(event: SubmitEvent) {
		event.preventDefault();
		if (!canSave) return;
		saving = true;
		await tracker.addQuestion({
			superviseeId: superviseeId === '' ? null : superviseeId,
			topic,
			question
		});
		// Only the text clears. The topic and the supervisee are almost always the same for
		// the next one, and re-picking them is most of the cost of parking a question at all.
		question = '';
		saving = false;
		announcer.announce('Parked for the next meeting.', 'assertive');
	}

	async function close(id: string, done: boolean) {
		await tracker.setAnswered(id, done);
		announcer.announce(done ? 'Marked as asked.' : 'Back on the agenda.');
	}

	const waitLabel = (raisedAt: number) => {
		const d = daysWaiting({ raisedAt } as never, now);
		if (d === 0) return 'today';
		return d === 1 ? '1 day' : `${d} days`;
	};
</script>

<Seo
	title="Questions for supervision"
	description="Park the question the moment it comes up, and take a written agenda to your next supervision meeting. Stays on your device, and holds no client information by construction."
/>

<PrintHeader
	title="Questions for supervision"
	subject={stats.open === 1 ? '1 open question' : `${stats.open} open questions`}
/>

<nav aria-label="Breadcrumb" class="crumbs"><a href={resolve('/tools')}>Tools</a></nav>

<h1>Questions for supervision</h1>

<p class="lede">
	The thing you meant to ask, written down in the ten seconds you have before the next trial.
	Supervision is thinner than it used to be — there are more technicians per analyst every year
	— so the question that cannot be answered in the moment has to survive until the meeting, and
	arriving with a list is the difference between covering it and covering whatever came to
	mind.
</p>

{#if tracker.status === 'unavailable'}
	<p class="note" role="status">
		This device is not letting the app store anything, so a parked question would be lost the
		moment you left the page. That is usually a private window or blocked site storage.
	</p>
{:else}
	<section aria-labelledby="{uid}-park">
		<h2 id="{uid}-park" class="section-head">Park a question</h2>
		<form onsubmit={park}>
			<div class="row">
				<div class="field">
					<label for="{uid}-topic">About</label>
					<select id="{uid}-topic" bind:value={topic}>
						{#each TOPICS as t (t)}
							<option value={t}>{TOPIC_LABELS[t]}</option>
						{/each}
					</select>
				</div>

				<div class="field">
					<label for="{uid}-who">Who it concerns</label>
					<select id="{uid}-who" bind:value={superviseeId}>
						<option value="">My own question</option>
						{#each tracker.supervisees as s (s.id)}
							<option value={s.id}>{s.code}</option>
						{/each}
					</select>
				</div>
			</div>

			<PhiNote
				id="{uid}-q"
				bind:value={question}
				label="The question"
				rows={2}
				placeholder="What do I do when the prompt level in the plan is not the one that works?"
			/>

			<button type="submit" class="primary" disabled={!canSave}>Park it</button>
		</form>
	</section>

	<section class="record" aria-labelledby="{uid}-agenda">
		<h2 id="{uid}-agenda" class="section-head">The agenda</h2>

		{#if stats.open === 0}
			<p class="hint" data-agenda="empty">
				Nothing parked. When something comes up mid-session that you cannot answer, this is
				where it goes.
			</p>
		{:else}
			<p class="figures">
				<strong data-open={stats.open}>{stats.open}</strong>
				{stats.open === 1 ? 'question' : 'questions'} waiting · oldest
				<strong>{stats.oldestDays === 0 ? 'today' : `${stats.oldestDays} days`}</strong>
				{#if stats.overdue > 0}
					·
					<span data-overdue={stats.overdue}>
						{stats.overdue} past {WAITING_TOO_LONG_DAYS} days
					</span>
				{/if}
			</p>

			{#each groups as group (group.code ?? 'mine')}
				<h3 class="who">{group.code ?? 'My own questions'}</h3>
				<ul class="questions">
					{#each group.questions as q (q.id)}
						<li data-waited={daysWaiting(q, now)}>
							<p class="q">{q.question}</p>
							<p class="meta">
								{TOPIC_LABELS[q.topic]} · parked {waitLabel(q.raisedAt)} ago
							</p>
							<button type="button" onclick={() => void close(q.id, true)}> Asked it </button>
						</li>
					{/each}
				</ul>
			{/each}

			<p class="actions">
				<PrintButton label="Print this agenda or save it as a PDF" />
			</p>
			<p class="hint">
				Take it into the meeting and work down it. Oldest first, always — a question that has
				waited three weeks is the one that keeps getting bumped, not the one that stopped
				mattering.
			</p>
		{/if}
	</section>

	{#if answered.length > 0}
		<section aria-labelledby="{uid}-done">
			<h2 id="{uid}-done" class="section-head">Already asked</h2>
			<ul class="questions done">
				{#each answered.slice(0, 20) as q (q.id)}
					<li>
						<p class="q">{q.question}</p>
						<p class="meta">
							{TOPIC_LABELS[q.topic]}{#if codeOf(q.superviseeId)}
								· {codeOf(q.superviseeId)}{/if}
						</p>
						<button type="button" onclick={() => void close(q.id, false)}>
							Put it back
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<p class="crumbs">
	The hours themselves live in the <a href={resolve('/tools/supervision')}>supervision log</a>.
</p>

<p class="note" role="note">
	Stays on this device. There is nowhere here to put a client's name — the only identifier is a
	supervisee code, and the one free-text line is checked for the things that identify somebody.
</p>

<style>
	.lede {
		color: var(--text-muted);
		max-width: 62ch;
	}

	.crumbs {
		color: var(--text-muted);
		font-size: 0.92em;
	}

	form {
		max-width: 44rem;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.field {
		display: grid;
		gap: 0.25rem;
		flex: 1 1 11rem;
		margin-bottom: 0.5rem;
	}

	button {
		min-height: var(--tap);
	}

	.figures {
		font-size: 1.05rem;
	}

	.figures [data-overdue] {
		color: var(--caution-text);
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		border-radius: var(--radius);
		padding: 0.1rem 0.4rem;
	}

	.who {
		font-size: 1.05rem;
		margin: 1.1rem 0 0.35rem;
	}

	.questions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
		max-width: 44rem;
	}

	.questions li {
		display: grid;
		gap: 0.25rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--hair);
		border-left-width: 4px;
		border-radius: var(--radius);
		background: var(--surface-raised);
	}

	/*
	 * A thicker edge on anything past a fortnight, and the figure above says so in words.
	 * Never the colour on its own: the same rule the rest of the app follows for anything
	 * that means "look at this one".
	 */
	.questions li[data-waited]:not([data-waited='0']) {
		border-left-color: var(--border);
	}

	.q {
		margin: 0;
		font-weight: 600;
	}

	.meta {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9em;
	}

	.questions.done .q {
		font-weight: 400;
		color: var(--text-muted);
	}

	.questions button {
		justify-self: start;
		margin-top: 0.15rem;
	}

	.hint {
		color: var(--text-muted);
		font-size: 0.92em;
		max-width: 62ch;
	}

	.actions {
		margin-top: 1rem;
	}

	/*
	 * On paper this is a meeting agenda and nothing else. The form has nothing to say once
	 * printed, and "already asked" is last meeting's business.
	 */
	@media print {
		.crumbs,
		.lede,
		h1,
		section:not(.record) {
			display: none;
		}
	}
</style>
