<script lang="ts">
	/**
	 * What makes a printed tracker a document rather than a screenshot.
	 *
	 * A supervision summary handed across a desk has to say what it is, whose it is and
	 * when it was run — otherwise it is a page of numbers that could be anybody's, from any
	 * month, and a supervisor filing it has no way to tell two apart.
	 *
	 * Print-only, deliberately. On screen every one of these facts is already established
	 * by the page's own heading and controls, and a second banner repeating them is the
	 * redundancy this app has removed everywhere else.
	 *
	 * `subject` is a supervisee code or a cycle, never a name. The app has nowhere to put a
	 * name by construction, and that has to stay true on the one artifact that leaves the
	 * device.
	 */
	interface Props {
		title: string;
		/** A code, a cycle, a date range — whatever identifies this particular record. */
		subject?: string | null;
	}

	const { title, subject = null }: Props = $props();

	// Resolved once at render. A clock that ticked would be a live document, which is the
	// opposite of what a printed record is for.
	const printedAt = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'long',
		timeStyle: 'short'
	}).format(new Date());
</script>

<div class="printed" aria-hidden="true">
	<h2>{title}</h2>
	{#if subject}<p class="subject">{subject}</p>{/if}
	<p class="meta">
		Printed {printedAt} from ABA Assist. Kept on the device it was printed from; not sent anywhere,
		and not a record held by anybody else.
	</p>
</div>

<style>
	/*
	 * `display: none` outside print rather than a visually-hidden class: this is not
	 * alternative text for anybody, it is a different medium's furniture. It is also
	 * `aria-hidden`, so a screen reader on the page never reads a date stamp for a document
	 * that has not been printed.
	 */
	.printed {
		display: none;
	}

	@media print {
		/*
		 * No rule of its own. Every page this sits on opens with a `.section-head`, which
		 * draws one immediately below — and in the first PDF the two stacked into a doubled
		 * line with a gap in it. The space does the separating instead.
		 */
		.printed {
			display: block;
			margin-bottom: 1.75rem;
		}

		h2 {
			margin: 0;
			font-size: 1.15rem;
		}

		.subject {
			margin: 0.15rem 0 0;
			font-weight: 600;
		}

		.meta {
			margin: 0.35rem 0 0;
			font-size: 0.75rem;
			color: #333;
		}
	}
</style>
