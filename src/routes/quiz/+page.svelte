<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { outlineForCredential, questionCredentials, termIndex } from '$lib/content/load.js';
	import { CREDENTIAL_LABELS } from '$lib/content/corpus.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { filters } from '$lib/state/filters.svelte.js';
	import { quiz, type QuizMode } from '$lib/state/quiz.svelte.js';
	import { formatClock, type SimulationPlan } from '$lib/quiz/simulation.js';

	const termName = new Map(termIndex.map((t) => [t.i, t.t]));

	onMount(() => {
		// The exam page and the shared filter can preselect the exam and domain.
		const cred = page.url.searchParams.get('credential') ?? filters.refCredential ?? 'RBT';
		const domain = page.url.searchParams.get('domain') ?? filters.domain;
		quiz.configure({
			credential: questionCredentials.includes(cred)
				? cred
				: (questionCredentials[0] ?? 'RBT'),
			domain: domain || 'all'
		});
	});

	const domains = $derived(outlineForCredential(quiz.credential)?.domains ?? []);
	const item = $derived(quiz.current);
	const optionById = $derived(
		new Map<string, NonNullable<typeof item>['q']['options'][number]>(
			item?.q.options.map((o) => [o.id, o]) ?? []
		)
	);
	const isMulti = $derived(item?.q.type === 'multi-select');
	const letterOf = (id: string) => id.toUpperCase();

	function submit() {
		quiz.submit();
		if (quiz.status === 'feedback') {
			announcer.announce(
				quiz.current?.correct ? 'Correct.' : 'Not correct. Rationale shown.',
				'assertive'
			);
		}
	}

	async function next() {
		await quiz.next();
		if (quiz.status === 'done') announcer.announce('Session finished. Results shown.');
		else announcer.announce(`Question ${quiz.progress.n} of ${quiz.progress.total}`);
	}

	const pct = (c: number, t: number) => (t === 0 ? 0 : Math.round((100 * c) / t));

	// What a simulation would look like for the selected exam, recomputed when it changes.
	let plan = $state<SimulationPlan | null>(null);
	$effect(() => {
		const credential = quiz.credential;
		void credential;
		void quiz.previewPlan().then((p) => (plan = p));
	});

	/*
	 * The countdown is announced at thresholds, never on every tick.
	 *
	 * A live region that updates each second is unusable with a screen reader, and one
	 * that never speaks leaves a blind candidate with no idea how long is left. Half an
	 * hour, ten minutes, five and one are the points where people actually change what
	 * they are doing.
	 */
	$effect(() => {
		quiz.onWarning = (seconds) => {
			const label =
				seconds >= 60 ? `${Math.round(seconds / 60)} minutes` : `${seconds} seconds`;
			announcer.announce(`${label} remaining.`, 'assertive');
		};
		return () => {
			quiz.onWarning = null;
		};
	});

	const remaining = $derived(quiz.secondsRemaining);
	const lowOnTime = $derived(quiz.plan !== null && remaining <= 300);
</script>

<svelte:head>
	<title>Practice questions — ABA Assist</title>
	<meta
		name="description"
		content="Original practice questions for the RBT and BCBA exams, weighted to the exam outline, with a rationale for every option."
	/>
</svelte:head>

<h1>Practice questions</h1>

{#if quiz.status === 'setup' || quiz.status === 'loading' || quiz.status === 'empty'}
	<p>
		Every question here is original and every option has a rationale — including the wrong
		ones, because knowing why an answer is wrong is most of what an exam tests. Mixed sessions
		follow the exam's published weights.
	</p>

	<form
		class="setup"
		onsubmit={(e) => {
			e.preventDefault();
			void quiz.start();
		}}
	>
		<div class="field">
			<label for="quiz-exam">Exam</label>
			<select
				id="quiz-exam"
				value={quiz.credential}
				onchange={(e) => quiz.configure({ credential: e.currentTarget.value })}
			>
				{#each questionCredentials as c (c)}
					<option value={c}>{c} — {CREDENTIAL_LABELS[c] ?? c}</option>
				{/each}
			</select>
		</div>

		<div class="field" hidden={quiz.mode === 'simulation'}>
			<label for="quiz-domain">Content area</label>
			<select
				id="quiz-domain"
				value={quiz.domain}
				onchange={(e) => quiz.configure({ domain: e.currentTarget.value })}
			>
				<option value="all">All areas, weighted like the exam</option>
				{#each domains as d (d.letter)}
					<option value={d.letter}>{d.letter}. {d.name}</option>
				{/each}
			</select>
		</div>

		<div class="field" hidden={quiz.mode === 'simulation'}>
			<label for="quiz-count">Number of questions</label>
			<select
				id="quiz-count"
				value={String(quiz.count)}
				onchange={(e) => quiz.configure({ count: Number(e.currentTarget.value) })}
			>
				<option value="5">5</option>
				<option value="10">10</option>
				<option value="20">20</option>
				<option value="40">40</option>
				<option value="1000">All available</option>
			</select>
		</div>

		<fieldset class="mode">
			<legend>Feedback</legend>
			<label class="option">
				<input
					type="radio"
					name="mode"
					value="practice"
					checked={quiz.mode === 'practice'}
					onchange={() => quiz.configure({ mode: 'practice' as QuizMode })}
				/>
				<span>After each question</span>
			</label>
			<label class="option">
				<input
					type="radio"
					name="mode"
					value="test"
					checked={quiz.mode === 'test'}
					onchange={() => quiz.configure({ mode: 'test' as QuizMode })}
				/>
				<span>At the end, like the exam</span>
			</label>
			{#if plan}
				<label class="option">
					<input
						type="radio"
						name="mode"
						value="simulation"
						checked={quiz.mode === 'simulation'}
						onchange={() => quiz.configure({ mode: 'simulation' as QuizMode })}
					/>
					<span>Full exam simulation, against the clock</span>
				</label>
			{/if}
		</fieldset>

		{#if quiz.mode === 'simulation' && plan}
			<div class="plan" role="note">
				<h2>What this run is</h2>
				<dl>
					<div>
						<dt>Questions</dt>
						<dd>{plan.questions}</dd>
					</div>
					<div>
						<dt>Time</dt>
						<dd>{plan.minutes} min</dd>
					</div>
					<div>
						<dt>Per question</dt>
						<dd>{plan.secondsPerQuestion}s</dd>
					</div>
				</dl>
				{#if plan.isFullLength}
					<p>
						Full length: {plan.fullLength.totalItems} questions in {plan.fullLength.minutes}
						minutes, every area, weighted like the exam.
					</p>
				{:else}
					<!--
						Said plainly rather than buried. Padding a short bank by repeating
						questions would make the number above a lie, and inventing questions to
						fill the gap is exactly how the incumbent apps earned their reviews.
					-->
					<p>
						<strong>This is not full length.</strong> The real paper is
						{plan.fullLength.totalItems} questions in {plan.fullLength.minutes} minutes. This build
						has {plan.questions}
						{quiz.credential} questions written, so the run is {plan.shortfall} short — but it keeps
						the exam's pace of {plan.secondsPerQuestion} seconds a question, which is the part worth
						rehearsing.
					</p>
				{/if}
				<p class="muted">
					No feedback until the end, no going back once time is up, and the clock runs from
					your device's time — leaving the page does not pause it.
				</p>
			</div>
		{/if}

		<p class="muted" aria-live="polite">
			{quiz.available}
			{quiz.available === 1 ? 'question' : 'questions'} available for this selection.
		</p>
		{#if quiz.status === 'empty'}
			<p class="warn">
				No questions are written for that area yet. Choose another, or all areas.
			</p>
		{/if}

		<button
			type="submit"
			class="primary"
			disabled={quiz.status === 'loading' || quiz.available === 0}
		>
			{quiz.status === 'loading'
				? 'Loading…'
				: quiz.mode === 'simulation'
					? 'Start the clock'
					: 'Start'}
		</button>
	</form>
{:else if (quiz.status === 'question' || quiz.status === 'feedback') && item}
	<form
		class="question"
		onsubmit={(e) => {
			e.preventDefault();
			submit();
		}}
	>
		{#if quiz.plan}
			<div class="exambar" class:low={lowOnTime}>
				<!--
					`role="timer"` with aria-live off: the visible clock updates every second,
					which a screen reader must not read aloud. Thresholds are announced instead.
				-->
				<span class="clock" role="timer" aria-live="off">
					<span class="visually-hidden">Time remaining</span>
					{formatClock(remaining)}
				</span>
				<span class="counts">
					{quiz.answeredCount} answered · {quiz.progress.n} of {quiz.progress.total}
					{#if quiz.flaggedCount > 0}· {quiz.flaggedCount} flagged{/if}
				</span>
			</div>
		{/if}

		<p class="progress">
			Question {quiz.progress.n} of {quiz.progress.total}{#if !quiz.plan}
				· {item.q.taskRef.credential}
				{item.q.taskRef.code}{/if}
		</p>

		{#if item.q.negated}
			<p class="callout" role="note">
				Read carefully: this question asks for the option that does <strong>not</strong> fit.
			</p>
		{/if}

		<fieldset>
			<legend>{item.q.stem}</legend>
			{#if isMulti}<p class="muted">Select every option that applies.</p>{/if}
			<ul class="options">
				{#each item.order as id (id)}
					{@const o = optionById.get(id)}
					{#if o}
						{@const chosen =
							quiz.status === 'feedback'
								? item.selected.includes(id)
								: quiz.selected.includes(id)}
						<li
							class:correct={quiz.status === 'feedback' && o.isCorrect}
							class:wrong={quiz.status === 'feedback' && chosen && !o.isCorrect}
						>
							<label class="option">
								<input
									type={isMulti ? 'checkbox' : 'radio'}
									name="answer"
									value={id}
									checked={chosen}
									disabled={quiz.status === 'feedback'}
									onchange={() => quiz.toggle(id)}
								/>
								<span class="letter" aria-hidden="true">{letterOf(id)}</span>
								<span class="text">{o.text}</span>
							</label>
							{#if quiz.status === 'feedback'}
								<p class="rationale">
									<strong
										>{o.isCorrect
											? 'Correct'
											: chosen
												? 'Your answer — not correct'
												: 'Not correct'}.</strong
									>
									{o.rationale}
								</p>
							{/if}
						</li>
					{/if}
				{/each}
			</ul>
		</fieldset>

		{#if quiz.status === 'question'}
			<div class="actions">
				<button type="submit" class="primary" disabled={quiz.selected.length === 0}>
					{(quiz.mode === 'test' || quiz.mode === 'simulation') &&
					quiz.index + 1 >= quiz.items.length
						? 'Finish'
						: quiz.plan
							? 'Answer and continue'
							: 'Check answer'}
				</button>
				{#if quiz.plan}
					<!-- What the real exam gives you: leave it, mark it, come back. -->
					<button
						type="button"
						onclick={() => quiz.toggleFlag()}
						aria-pressed={!!quiz.flagged[item.q.id]}
					>
						{quiz.flagged[item.q.id] ? 'Unflag' : 'Flag for review'}
					</button>
					<button type="button" onclick={() => quiz.skip()}>Skip</button>
				{/if}
			</div>

			{#if quiz.plan}
				<nav class="navigator" aria-label="Questions">
					<ol>
						{#each quiz.items as it, i (it.q.id)}
							<li>
								<button
									type="button"
									class="jump"
									data-state={it.correct !== null
										? 'answered'
										: quiz.flagged[it.q.id]
											? 'flagged'
											: 'unanswered'}
									aria-current={i === quiz.index ? 'true' : undefined}
									onclick={() => quiz.goTo(i)}
								>
									<span class="visually-hidden">
										Question {i + 1},
										{it.correct !== null ? 'answered' : 'not answered'}{quiz.flagged[it.q.id]
											? ', flagged'
											: ''}
									</span>
									<span aria-hidden="true">{i + 1}{quiz.flagged[it.q.id] ? '*' : ''}</span>
								</button>
							</li>
						{/each}
					</ol>
				</nav>
			{/if}
		{:else}
			<div class="explanation" role="region" aria-label="Explanation">
				<p class="verdict">{item.correct ? 'Correct.' : 'Not correct.'}</p>
				<p>{item.q.explanation}</p>
				{#if item.q.termRefs.length}
					<p class="terms">
						Related terms:
						{#each item.q.termRefs as id (id)}
							{#if termName.has(id)}
								<a href={resolve('/glossary/[slug]', { slug: id })}>{termName.get(id)}</a>
							{/if}
						{/each}
					</p>
				{/if}
			</div>
			<button type="button" class="primary" onclick={next}>
				{quiz.index + 1 >= quiz.items.length ? 'See results' : 'Next question'}
			</button>
		{/if}

		<p>
			<button type="button" onclick={() => quiz.reset()}>
				{quiz.plan ? 'Abandon this run' : 'Quit'}
			</button>
			{#if quiz.plan}
				<button type="button" onclick={() => quiz.finish()}>Finish early</button>
			{/if}
		</p>
	</form>
{:else if quiz.status === 'done' && quiz.results}
	<section class="results" aria-labelledby="results-heading">
		<h2 id="results-heading">
			{quiz.results.correct} of {quiz.results.total} correct ({pct(
				quiz.results.correct,
				quiz.results.total
			)}%)
		</h2>
		{#if quiz.ranOutOfTime}
			<p class="warn" role="note">
				<strong>Time ran out.</strong> Questions you did not reach are counted wrong, which is what
				happens on the day. Pace is a skill worth practising separately from content.
			</p>
		{/if}
		{#if quiz.plan}
			<p class="muted">
				{quiz.plan.questions} questions in {quiz.plan.minutes} minutes, at the exam's pace of
				{quiz.plan.secondsPerQuestion} seconds a question.{#if !quiz.plan.isFullLength}
					The real paper is {quiz.plan.fullLength.totalItems} questions in {quiz.plan
						.fullLength.minutes} minutes.{/if}
			</p>
		{/if}
		<p class="muted">
			A practice score is not a prediction of an exam result; the real exam draws from a much
			larger bank. Use the areas below to decide what to study next.
		</p>

		<table>
			<caption class="visually-hidden">Results by content area</caption>
			<thead>
				<tr
					><th scope="col">Area</th><th scope="col">Correct</th><th scope="col">Percent</th
					></tr
				>
			</thead>
			<tbody>
				{#each Object.entries(quiz.results.perDomain).sort() as [letter, row] (letter)}
					<tr>
						<th scope="row">{letter}. {row.name}</th>
						<td>{row.correct} / {row.total}</td>
						<td>{pct(row.correct, row.total)}%</td>
					</tr>
				{/each}
			</tbody>
		</table>

		{#if quiz.results.missed.length > 0}
			<h3>Questions you missed</h3>
			<ol class="missed">
				{#each quiz.results.missed as m (m.q.id)}
					<li>
						<p>{m.q.stem}</p>
						<p class="rationale">
							<strong>Correct:</strong>
							{m.q.options
								.filter((o) => o.isCorrect)
								.map((o) => o.text)
								.join('; ')}
						</p>
						<p class="muted">{m.q.explanation}</p>
						{#if m.q.termRefs.length}
							<p class="terms">
								{#each m.q.termRefs as id (id)}
									{#if termName.has(id)}
										<a href={resolve('/glossary/[slug]', { slug: id })}>{termName.get(id)}</a>
									{/if}
								{/each}
							</p>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}

		<p>
			<button type="button" class="primary" onclick={() => quiz.start()}
				>Another session</button
			>
			<button type="button" onclick={() => quiz.reset()}>Change settings</button>
		</p>
	</section>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.warn,
	.callout {
		background: var(--caution-bg);
		border: 1px solid var(--caution-border);
		color: var(--caution-text);
		padding: 0.6rem 0.8rem;
		border-radius: var(--radius);
	}
	.setup {
		display: grid;
		gap: 0.75rem;
		max-width: 30rem;
	}
	.setup .field,
	.setup .mode {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.setup .field label,
	.setup .mode legend {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}
	select {
		font: inherit;
		font-weight: 400;
		color: var(--text);
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
	}
	fieldset {
		border: none;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	legend {
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--text);
		padding: 0;
		margin-bottom: 0.5rem;
	}
	.plan {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem 1rem;
		background: var(--surface-raised);
		margin-bottom: 1rem;
	}
	.plan h2 {
		font-size: 1rem;
		margin: 0 0 0.5rem;
	}
	.plan dl {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin: 0 0 0.5rem;
	}
	.plan dt {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.plan dd {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
	}
	.exambar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		align-items: baseline;
		justify-content: space-between;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.5rem 0.75rem;
		background: var(--surface);
		margin-bottom: 0.75rem;
	}
	/* Never colour alone: the clock itself is the signal, and the label says so. */
	.exambar.low {
		border-color: var(--stop-border);
	}
	.exambar.low .clock {
		color: var(--stop-text);
	}
	.clock {
		font-size: 1.35rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.counts {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.navigator ol {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin: 0.75rem 0 0;
		padding: 0;
	}
	.jump {
		min-width: var(--tap);
		min-height: var(--tap);
		font-variant-numeric: tabular-nums;
	}
	.jump[data-state='answered'] {
		background: var(--accent);
		color: var(--accent-text);
	}
	.jump[data-state='flagged'] {
		border-color: var(--caution-border);
		background: var(--caution-bg);
		color: var(--caution-text);
	}
	.jump[aria-current='true'] {
		outline: 3px solid var(--focus);
		outline-offset: 1px;
	}

	.mode {
		gap: 0.4rem;
	}
	.mode legend {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}
	.option {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		min-height: var(--tap);
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface-raised);
		cursor: pointer;
		font-weight: 400;
		color: var(--text);
		font-size: 1rem;
	}
	.option input {
		margin-top: 0.3rem;
		width: 1.15rem;
		height: 1.15rem;
		flex: none;
	}
	.option:has(input:checked) {
		border-color: var(--accent);
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.option:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}
	.primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		justify-self: start;
	}
	.primary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.progress {
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.options {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.5rem;
		margin: 0 0 1rem;
	}
	.letter {
		font-weight: 700;
		color: var(--text-muted);
		flex: none;
	}
	.text {
		max-width: 68ch;
	}
	/* Feedback states carry text ("Correct" / "Not correct"), never colour alone. */
	.options li.correct .option {
		border-color: var(--accent);
		border-width: 2px;
	}
	.options li.wrong .option {
		border-color: var(--stop-border);
		border-width: 2px;
	}
	.rationale {
		font-size: 0.9rem;
		margin: 0.35rem 0 0 0.25rem;
		color: var(--text-muted);
	}
	.explanation {
		background: var(--surface);
		border-left: 4px solid var(--accent);
		padding: 0.6rem 0.9rem;
		border-radius: 0 var(--radius) var(--radius) 0;
		margin-bottom: 1rem;
	}
	.verdict {
		font-weight: 700;
		margin-top: 0;
	}
	.terms a {
		display: inline-flex;
		align-items: center;
		min-height: var(--tap);
		padding: 0.25rem 0.6rem;
		margin: 0.15rem 0.35rem 0.15rem 0;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.85rem;
		text-decoration: none;
	}
	.results h2 {
		font-size: 1.3rem;
	}
	.results h3 {
		font-size: 1.05rem;
		margin-top: 1.5rem;
	}
	table {
		border-collapse: collapse;
		width: 100%;
		max-width: 34rem;
		font-size: 0.95rem;
	}
	th,
	td {
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--border);
	}
	th[scope='row'] {
		font-weight: 500;
	}
	.missed {
		padding-left: 1.2rem;
	}
	.missed > li {
		margin-bottom: 1rem;
	}
	.missed p {
		margin: 0.25rem 0;
	}
</style>
