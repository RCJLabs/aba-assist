<script lang="ts">
	import Seo from '$lib/components/Seo.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { outlineForCredential, questionCredentials, termIndex } from '$lib/content/load.js';
	import { CREDENTIAL_LABELS } from '$lib/content/credentials.js';
	import { announcer } from '$lib/state/announcer.svelte.js';
	import { filters } from '$lib/state/filters.svelte.js';
	import { quiz, type QuizMode } from '$lib/state/quiz.svelte.js';
	import { formatClock, type SimulationPlan } from '$lib/quiz/simulation.js';

	const termName = new Map(termIndex.map((t) => [t.i, t.t]));

	onMount(() => {
		/*
		 * The exam page and the shared filter can preselect the exam and domain. The
		 * filter is hydrated here because this runs before the root layout mounts.
		 *
		 * Precedence, highest first: the URL, because a link asked for it explicitly; then
		 * anything the reader changed on the form before the bundle arrived, because they
		 * asked for it more recently than the filter did; then the saved filter; then the
		 * default. Without the middle term this used to overwrite the reader's choice a
		 * moment after they made it.
		 */
		filters.hydrate();
		// `||` rather than `??`: an unchanged control reads as an empty string, not null,
		// and an empty string is the absence of a choice rather than a choice of nothing.
		const cred =
			page.url.searchParams.get('credential') ||
			picked.credential ||
			filters.refCredential ||
			'RBT';
		const domain = page.url.searchParams.get('domain') || picked.domain || filters.domain;
		quiz.configure({
			credential: questionCredentials.includes(cred)
				? cred
				: (questionCredentials[0] ?? 'RBT'),
			domain: domain || 'all'
		});
		// Needs storage, so it can only happen here — the page is prerendered and the
		// server has no history to read. The block below stays absent until it lands.
		void quiz.loadRetry();
	});

	let setupForm = $state<HTMLFormElement | null>(null);

	/*
	 * Adopt the prerendered form before this component renders over it.
	 *
	 * The page ships as static HTML, so the setup form is on screen and usable while the
	 * bundle is still loading. A choice made in that window is in the DOM and not in the
	 * state, and the template's `value={…}` would then quietly put it back — the reader
	 * picks five questions, the select snaps to ten, and nothing says why.
	 *
	 * This runs in the component's script body, which on hydration is after the
	 * prerendered elements are in the document and before Svelte writes to them. That is
	 * the only moment the reader's choice is readable. On a client-side navigation there
	 * is no such form yet and every read is null, which is a no-op.
	 */
	/** What the reader changed before the bundle arrived, and only that. */
	const picked = browser
		? readChangedSetup()
		: { credential: '', domain: '', count: 0, mode: '' };
	if (browser) applySetup(picked.credential, picked.domain, picked.count, picked.mode);

	/*
	 * A control counts as chosen only when it differs from the markup it was served with.
	 *
	 * Reading the values alone would make an untouched page look like a decision and
	 * override the exam a deep link or the saved filter asked for. `defaultSelected` and
	 * `defaultChecked` reflect the HTML attribute rather than the current state, so they
	 * say what was served no matter what the reader has since done.
	 */
	function readChangedSetup(): {
		credential: string;
		domain: string;
		count: number;
		mode: string;
	} {
		const changedSelect = (id: string) => {
			const el = document.getElementById(id) as HTMLSelectElement | null;
			if (!el) return '';
			const served =
				[...el.options].find((o) => o.defaultSelected)?.value ?? el.options[0]?.value;
			return el.value === served ? '' : el.value;
		};
		const radio = [...document.querySelectorAll<HTMLInputElement>('input[name="mode"]')].find(
			(el) => el.checked && !el.defaultChecked
		);
		return {
			credential: changedSelect('quiz-exam'),
			domain: changedSelect('quiz-domain'),
			count: Number(changedSelect('quiz-count')),
			mode: radio?.value ?? ''
		};
	}

	function applySetup(credential: string, domain: string, count: number, mode: string): void {
		quiz.configure({
			...(questionCredentials.includes(credential) ? { credential } : {}),
			...(domain ? { domain } : {}),
			...(Number.isFinite(count) && count > 0 ? { count } : {}),
			...(mode === 'practice' || mode === 'test' || mode === 'simulation'
				? { mode: mode as QuizMode }
				: {})
		});
	}

	/**
	 * Copy whatever the setup form currently shows into the quiz state, at submit.
	 *
	 * The adoption above covers the load; this covers everything after it, so a change
	 * that never reached a handler for any reason cannot start the wrong run.
	 */
	function adoptForm(): void {
		if (!setupForm) return;
		const data = new FormData(setupForm);
		const credential = String(data.get('credential') ?? '');
		const domain = String(data.get('domain') ?? '');
		const count = Number(data.get('count') ?? NaN);
		const mode = String(data.get('mode') ?? '');
		applySetup(credential, domain, count, mode);
	}

	const domains = $derived(outlineForCredential(quiz.credential)?.domains ?? []);

	/*
	 * When the mode asks for an exam this build has no questions for.
	 *
	 * The selector only offers exams that have a bank, so the setup above quietly swaps in
	 * one that does. Quietly is the problem: somebody who set the app to the assistant
	 * exam would otherwise sit an analyst paper without being told, and conclude the app
	 * has assistant questions. It says so instead.
	 */
	const bankless = $derived(
		filters.refCredential !== null &&
			!questionCredentials.includes(filters.refCredential) &&
			filters.refCredential !== quiz.credential
			? filters.refCredential
			: null
	);
	const item = $derived(quiz.current);

	/*
	 * What the button is about to do, which is not the same in every mode.
	 *
	 * Only practice mode shows a rationale on submit. In the two modes that withhold
	 * feedback the same press records the answer and moves on, and labelling it "Check
	 * answer" promised a check that never came — the reader pressed it expecting the
	 * answer and got the next question. Keyed on whether feedback follows rather than on
	 * whether the run has a simulation plan, which is what let test mode fall through to
	 * the practice wording.
	 */
	/*
	 * Whether the page is allowed to show how the run is going.
	 *
	 * Practice mode gives a verdict on every question, so a bar coloured right and wrong
	 * tells the reader nothing they were not just told. The other two modes withhold
	 * feedback on purpose, and a coloured bar there would hand back the answer key one
	 * segment at a time — so they get answered-or-not and nothing else.
	 */
	const showsVerdicts = $derived(quiz.mode === 'practice');
	const score = $derived(quiz.runningScore);

	const submitLabel = $derived.by(() => {
		if (quiz.mode === 'practice') return 'Check answer';
		return quiz.index + 1 >= quiz.items.length ? 'Finish' : 'Answer and continue';
	});
	const optionById = $derived(
		new Map<string, NonNullable<typeof item>['q']['options'][number]>(
			item?.q.options.map((o) => [o.id, o]) ?? []
		)
	);
	const isMulti = $derived(item?.q.type === 'multi-select');
	const letterOf = (id: string) => id.toUpperCase();

	let verdictEl = $state<HTMLElement | null>(null);
	let stemEl = $state<HTMLElement | null>(null);

	/**
	 * Put the reader where the new thing is.
	 *
	 * Checking an option scrolls it into view, so by the time the answer is submitted the
	 * page is parked somewhere in the middle of the options and the verdict — which is
	 * above the stem — is off the top of the screen. Moving focus scrolls it into view and
	 * tells a screen reader where it went, which a scroll on its own does not.
	 */
	function focusAfterPaint(get: () => HTMLElement | null): void {
		requestAnimationFrame(() => get()?.focus());
	}

	function submit() {
		quiz.submit();
		if (quiz.status === 'feedback') {
			announcer.announce(
				quiz.current?.correct ? 'Correct.' : 'Not correct. Rationale shown.',
				'assertive'
			);
			focusAfterPaint(() => verdictEl);
		}
	}

	async function next() {
		await quiz.next();
		if (quiz.status === 'done') announcer.announce('Session finished. Results shown.');
		else {
			announcer.announce(`Question ${quiz.progress.n} of ${quiz.progress.total}`);
			// Same reason, the other way: the next question starts at its stem, not at
			// wherever the last one's rationales left the page.
			focusAfterPaint(() => stemEl);
		}
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

	/*
	 * The retry queue, and how much of it this run would actually cover.
	 *
	 * The length control applies here as it does to a fresh draw, and the queue is ordered
	 * worst-first, so a reader with forty outstanding and ten selected gets the ten that
	 * have caught them out most. Said out loud below rather than left to be discovered.
	 */
	const outstanding = $derived(quiz.retry?.ids.length ?? 0);
	const retryRun = $derived(Math.min(outstanding, Math.max(1, quiz.count)));

	async function startRetry() {
		adoptForm();
		quiz.configure({ source: 'missed' });
		await quiz.start();
	}
</script>

<Seo
	title="Practice questions"
	description="Original practice questions for the RBT and BCBA exams, weighted to the exam outline, with a rationale for every option."
/>

<h1>Practice questions</h1>

{#if quiz.status === 'setup' || quiz.status === 'loading' || quiz.status === 'empty'}
	<p>
		Every question here is original and every option has a rationale — including the wrong
		ones, because knowing why an answer is wrong is most of what an exam tests. Mixed sessions
		follow the exam's published weights.
	</p>

	<form
		class="setup"
		bind:this={setupForm}
		onsubmit={(e) => {
			e.preventDefault();
			/*
			 * Read the controls before starting, rather than trusting that every change
			 * reached the state.
			 *
			 * The page is prerendered, so the form is on screen and selectable before
			 * Svelte hydrates. A change made in that window updates the DOM and never
			 * reaches `configure`, and the run then uses a length or an exam the reader
			 * did not pick. Reading the form here is one line and closes the window for
			 * every control at once.
			 */
			adoptForm();
			void quiz.start();
		}}
	>
		<div class="field">
			<label for="quiz-exam">Exam</label>
			<select
				id="quiz-exam"
				name="credential"
				value={quiz.credential}
				onchange={(e) => quiz.configure({ credential: e.currentTarget.value })}
			>
				{#each questionCredentials as c (c)}
					<option value={c}>{c} — {CREDENTIAL_LABELS[c] ?? c}</option>
				{/each}
			</select>
			{#if bankless}
				<p class="swapped" role="note" data-bankless={bankless}>
					No {bankless} questions have been written yet, so this is the {quiz.credential} bank. The
					{bankless} outline is narrower, so some of these go past what it asks.
				</p>
			{/if}
		</div>

		<div class="field" hidden={quiz.mode === 'simulation'}>
			<label for="quiz-domain">Content area</label>
			<select
				id="quiz-domain"
				name="domain"
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
				name="count"
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
			{:else}
				<p class="untimed" role="note" data-no-simulation={quiz.credential}>
					No timed simulation for this exam: the outline publishes its question counts but not
					the time allowed, and pacing you against a guessed clock would defeat the point of
					running one.
				</p>
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
			<!--
				Two ways to arrive here, and they need different sentences. Clearing the last
				outstanding question is the good outcome of the feature below, and telling
				somebody who has just done it that no questions are written for their area
				would read as a fault.
			-->
			<p class="warn">
				{#if quiz.source === 'missed'}
					Nothing left to retry — every question you had missed, you have since answered
					correctly. Start a fresh set above.
				{:else}
					No questions are written for that area yet. Choose another, or all areas.
				{/if}
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

	<!--
		Outside the form on purpose. This is a second way to start a session, not a fifth
		control on the first one, and nesting a second submit inside that form would make
		the Enter key ambiguous on every field above it.

		Absent entirely until storage has been read, and absent for a reader who has never
		missed anything — an empty "0 to retry" panel is a permanent reminder of a feature
		that does not apply yet.
	-->
	{#if quiz.retry !== null && (outstanding > 0 || quiz.retry.gone > 0)}
		<section class="retry" aria-labelledby="retry-heading" data-outstanding={outstanding}>
			<h2 id="retry-heading">Questions you have missed</h2>
			{#if outstanding > 0}
				<p>
					<strong>{outstanding}</strong>
					{outstanding === 1 ? 'question has' : 'questions have'} caught you out and
					{outstanding === 1 ? 'has' : 'have'} not been answered correctly since. Sitting one again
					is not the same as re-reading the term behind it: most of what one of these tests is telling
					a plausible option from the right one.
				</p>
				{#if retryRun < outstanding}
					<p class="muted">
						This run takes the {retryRun} that have caught you out most. Ask for more above to cover
						the rest.
					</p>
				{/if}
				<button type="button" class="primary" onclick={startRetry}>
					Retry {retryRun}
					{retryRun === 1 ? 'question' : 'questions'}
				</button>
			{:else}
				<p data-retry-cleared>
					Nothing outstanding. Every question you have missed, you have since answered
					correctly.
				</p>
			{/if}
			{#if quiz.retry.gone > 0}
				<!--
					Said rather than swallowed. The alternative is a number that quietly shrinks
					between sittings, which teaches people not to trust any figure on the page.
				-->
				<p class="muted" data-retry-gone={quiz.retry.gone}>
					{quiz.retry.gone}
					{quiz.retry.gone === 1 ? 'question you missed is' : 'questions you missed are'} not in
					this version of the app, so {quiz.retry.gone === 1 ? 'it is' : 'they are'} not in the count
					above. Questions are rebuilt with every release and one can be withdrawn or rewritten.
				</p>
			{/if}
		</section>
	{/if}
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

		<!--
			One segment per question. `role="progressbar"` carries the position; the
			segments are decoration on top of it, and in practice mode the tally below
			says the same thing in words so the colours are never the only reading.
		-->
		<div
			class="bar"
			role="progressbar"
			aria-valuemin={0}
			aria-valuemax={quiz.items.length}
			aria-valuenow={quiz.answeredCount}
			aria-label="Questions answered"
		>
			{#each quiz.items as it, i (it.q.id)}
				<span
					class="seg"
					data-state={it.correct === null
						? i === quiz.index
							? 'current'
							: 'todo'
						: showsVerdicts
							? it.correct
								? 'right'
								: 'wrong'
							: 'done'}
					aria-hidden="true"
				></span>
			{/each}
		</div>

		<p class="progress">
			Question {quiz.progress.n} of {quiz.progress.total}{#if !quiz.plan}&nbsp;·
				{item.q.taskRef.credential}
				{item.q.taskRef
					.code}{/if}<!--
				Said on every question of a retry run. Without it a reader who recognises the
				third question in a row wonders whether the app is repeating itself.
			-->{#if quiz.source === 'missed'}<span
					class="withheld">&nbsp;· one you missed before</span
				>{/if}
			<!--
				Said on every question rather than once at setup. The setting was chosen a
				screen ago and the consequence lands here, which is where somebody wonders
				why the answer has not appeared.
			-->
			{#if quiz.mode !== 'practice'}<span class="withheld">&nbsp;· answers at the end</span
				>{/if}
		</p>

		{#if showsVerdicts && score.answered > 0}
			<p class="tally" aria-live="polite">
				<span class="chip">{score.correct} of {score.answered} right so far</span>
				{#if score.streak >= 3}<span class="chip streak">{score.streak} in a row</span>{/if}
			</p>
		{/if}

		{#if item.q.negated}
			<p class="callout" role="note">
				Read carefully: this question asks for the option that does <strong>not</strong> fit.
			</p>
		{/if}

		<!--
			The verdict, before the options rather than after them.
			
			It used to sit under the explanation, which is below four per-option rationales
			— so the one thing the reader pressed the button to find out was the last thing
			on the page, several screens down. The detail stays where it was; only the
			answer to "did I get it right" moves up.
		-->
		{#if quiz.status === 'feedback'}
			<p
				class="verdict-top"
				data-correct={item.correct}
				role="status"
				tabindex="-1"
				bind:this={verdictEl}
			>
				<span class="mark" aria-hidden="true">{item.correct ? '✓' : '✗'}</span>
				<strong>{item.correct ? 'Correct.' : 'Not correct.'}</strong>
				<span class="muted">The reasoning for every option is below.</span>
			</p>
		{/if}

		<fieldset>
			<legend tabindex="-1" bind:this={stemEl}>{item.q.stem}</legend>
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
					{submitLabel}
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
	<section class="results" aria-labelledby="results-heading" data-attempt={quiz.saved}>
		<h2 id="results-heading">
			{quiz.results.correct} of {quiz.results.total} correct ({pct(
				quiz.results.correct,
				quiz.results.total
			)}%)
		</h2>
		{#if quiz.source === 'missed'}
			<!--
				The caveat that has to sit next to the figure rather than under the fold. A run
				drawn only from questions already missed is a harder paper than a fresh draw by
				construction, so the percentage above is not comparable with the others and
				nothing in the app treats it as though it were.
			-->
			<p class="muted" data-retry-run>
				These were all questions you had missed before, so this score is not comparable with a
				fresh draw and is left off the trend on
				<a href={resolve('/progress')}>your progress</a>. What it does say is which of them you
				have now put right.
			</p>
		{/if}
		{#if quiz.ranOutOfTime}
			<p class="warn" role="note">
				<strong>Time ran out.</strong> Questions you did not reach are counted wrong, which is what
				happens on the day. Pace is a skill worth practicing separately from content.
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

		<!--
			A bar in each row, beside the figures rather than instead of them. The table
			stays the reading a screen reader gets and the numbers stay exact; the bar is a
			second pass over the same row, so a weak area is visible without reading six
			percentages. Deliberately no overall ring: this app refuses to state a
			readiness score, and a ring is the shape people read one into.
		-->
		<table class="areas">
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
						<th scope="row">
							{letter}. {row.name}
							<span class="track" aria-hidden="true">
								<span class="fill" style="width: {pct(row.correct, row.total)}%"></span>
							</span>
						</th>
						<td>{row.correct} / {row.total}</td>
						<td>{pct(row.correct, row.total)}%</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<!--
			The link that used to be missing. A per-area table with nothing to do about it
			leaves the reader to work out their own next step from six percentages.
		-->
		<p class="next-step">
			<a href={resolve('/plan')}>See what to study next</a> — your areas across every session, with
			an accuracy only where enough has been answered to mean anything.
		</p>

		<p class="next-step">
			<a href={resolve('/progress')}>See how it is going</a> — this sitting against the ones before
			it.
		</p>

		{#if quiz.reinforced > 0}
			<p class="reinforced" role="status" data-reinforced={quiz.reinforced}>
				<strong
					>{quiz.reinforced}
					{quiz.reinforced === 1 ? 'term is' : 'terms are'} now due in your flashcards.</strong
				>
				What you missed here schedules the terms behind it —
				<a href={resolve('/study')}>review them</a>. Nothing was marked as a failed review: the
				cards are due, not graded.
			</p>
		{/if}

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

		<p class="after">
			<button type="button" class="primary" onclick={() => quiz.start()}>
				{quiz.source === 'missed' ? 'Another retry' : 'Another session'}
			</button>
			{#if outstanding > 0 && quiz.source !== 'missed'}
				<!--
					Where the offer is worth most: the reader has just been shown what they got
					wrong and is the most willing they will ever be to sit those again.
				-->
				<button type="button" onclick={startRetry}>
					Retry {retryRun}
					{retryRun === 1 ? 'question' : 'questions'} you have missed
				</button>
			{/if}
			<button type="button" onclick={() => quiz.reset()}>Change settings</button>
		</p>
	</section>
{/if}

<style>
	.retry {
		max-width: 30rem;
		margin-top: 1.5rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius);
		background: var(--surface-raised);
	}
	.retry h2 {
		font-size: 1.05rem;
		margin: 0 0 0.5rem;
	}
	.retry p {
		margin: 0 0 0.6rem;
	}
	.retry button {
		min-height: var(--tap);
	}

	.after {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.after button {
		min-height: var(--tap);
	}

	.untimed {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.swapped {
		margin: 0.4rem 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

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
		/*
		 * `minmax(0, 1fr)`, not the implicit `auto` track. An auto track is sized by its
		 * widest item, and the exam picker is as wide as "RBT — Registered Behavior
		 * Technician", so the whole form measured 476px inside a 320px phone.
		 */
		grid-template-columns: minmax(0, 1fr);
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
	.withheld {
		color: var(--text-muted);
	}

	.progress {
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.bar {
		display: flex;
		gap: 2px;
		height: 6px;
		margin: 0 0 0.5rem;
	}
	.seg {
		flex: 1 1 0;
		min-width: 2px;
		border-radius: 2px;
		background: var(--border);
	}
	.seg[data-state='current'] {
		background: var(--text-muted);
	}
	.seg[data-state='done'] {
		background: var(--text-muted);
		opacity: 0.55;
	}
	.seg[data-state='right'] {
		background: var(--accent);
	}
	.seg[data-state='wrong'] {
		background: var(--stop-border);
	}

	.tally {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin: 0 0 0.75rem;
	}
	.tally .chip {
		display: inline-block;
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 0.05rem 0.55rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.tally .chip.streak {
		border-color: var(--accent);
		color: var(--text);
	}

	.verdict-top {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem;
		margin: 0 0 0.75rem;
		padding: 0.55rem 0.8rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface);
		animation: verdict-in 200ms ease-out;
	}
	.verdict-top:focus-visible,
	.verdict-top:focus {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.verdict-top[data-correct='true'] {
		border-color: var(--accent);
	}
	.verdict-top[data-correct='false'] {
		border-color: var(--stop-border);
	}
	.verdict-top .mark {
		font-size: 1.1rem;
		line-height: 1;
	}
	.verdict-top .muted {
		font-size: 0.85rem;
	}
	@keyframes verdict-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.verdict-top {
			animation: none;
		}
	}

	/* A bar under each area name, reading the same number as the cells beside it. */
	.areas th[scope='row'] {
		min-width: 9rem;
	}
	.areas .track {
		display: block;
		height: 0.4rem;
		margin-top: 0.3rem;
		border-radius: 999px;
		background: var(--surface);
		overflow: hidden;
	}
	.areas .fill {
		display: block;
		height: 100%;
		background: var(--accent);
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
	.reinforced {
		border: 1px solid var(--border);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 0.6rem 0.75rem;
		font-size: 0.9rem;
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
