import { z } from 'zod';

/**
 * THE COPYRIGHT GUARD.
 *
 * Spread into every content schema. The verbatim fields are typed `z.null()`, not
 * `z.string().optional()`, so authoring `officialText: "..."` is a PARSE ERROR rather
 * than a lint warning. There is no code path in this repo that can produce a non-null
 * value, because the type is `null`.
 *
 * Why this matters here specifically: the BACB's terms of use grant only a limited
 * personal viewing licence and prohibit reproduction or redistribution, and the same is
 * true of the standard textbooks. Rendering code shows `officialUrl` — we link to the
 * authoritative document so users read the real wording at its source.
 *
 * `officialTitle` is guarded too: a standard's heading is the rights-holder's text just
 * as much as its body is. We write our own label instead.
 */
export const OfficialTextGuard = {
	/** Verbatim text from the rights-holder. ALWAYS null. Link, never copy. */
	officialText: z.null().default(null),
	/** Verbatim heading from the rights-holder. ALWAYS null. Write our own label. */
	officialTitle: z.null().default(null),
	/** Deep link to the authoritative document. */
	officialUrl: z.url().nullable().default(null)
} as const;

/**
 * Every content schema is strict, so an unknown key fails the build. That is what
 * catches a hand-added `officialText2:` or a typo'd field that would otherwise be
 * silently dropped.
 */
export function strictContent<S extends z.ZodRawShape>(shape: S) {
	return z.strictObject({ ...shape, ...OfficialTextGuard });
}

/**
 * Identifier for a person under supervision.
 *
 * THE PHI GUARD. There is deliberately no `name`, `dob`, or `address` field anywhere in
 * the supervision model — a code like "S-04" is the only identity a supervisee has, and
 * this pattern cannot express a person's name. Same philosophy as the copyright guard:
 * make the wrong thing impossible to say rather than merely discouraged.
 */
export const SuperviseeCode = z
	.string()
	.regex(
		/^[A-Z]{1,3}[-_ ]?\d{1,4}$/,
		'use a non-identifying code such as "S-04" — never a client or supervisee name'
	);

/** Patterns that suggest a user typed identifying information into a free-text field. */
export const PHI_PATTERNS: readonly { readonly label: string; readonly re: RegExp }[] = [
	{ label: 'possible Social Security number', re: /\b\d{3}-\d{2}-\d{4}\b/ },
	{ label: 'possible date of birth', re: /\b(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/ },
	{ label: 'possible date of birth', re: /\b\d{1,2}\/\d{1,2}\/(?:19|20)\d{2}\b/ },
	{ label: 'possible full name', re: /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/ },
	{ label: 'possible phone number', re: /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/ }
];

/** Non-blocking check used by the supervision note field in the UI. */
export function findPhiHints(text: string): string[] {
	const hits = new Set<string>();
	for (const { label, re } of PHI_PATTERNS) if (re.test(text)) hits.add(label);
	return [...hits];
}
