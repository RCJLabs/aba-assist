/**
 * The safety lexicons, as plain regular expressions.
 *
 * Split out of `scenario.ts` for the same reason the categories are split out of
 * `term.ts`: the review queue needs them to decide how closely an item has to be read,
 * and importing them from the schema barrel would ship Zod to the browser to run a
 * regular expression.
 */

/**
 * Risk language. If any of this appears in a `guidance` scenario the build fails and
 * tells the author to convert it to `escalation-only`. This is the backstop for a
 * missing `riskFlags` entry.
 */
export const RISK_LEXICON =
	/\b(restrain\w*|seclusion|seclude\w*|time-?out room|self-?injur\w*|SIB|head-?bang\w*|bleed\w*|seizure|unconscious|abuse|bruise|welt|choking|choke|swallow\w*|weapon|knife|gun|911|988|suicid\w*|overdose|strangl\w*)\b/i;

/**
 * Procedural verbs that must never appear in escalation content. An escalation card
 * says who to call and what to document — never how to physically manage a person.
 */
export const RESTRICTED_PROCEDURE_LEXICON =
	/\b(block|blocking|hold (?:them|him|her|the client)|holding|restrain\w*|apply pressure|guide (?:them|him|her)|physically (?:manage|intervene|redirect)|pin|wrap|escort|prone|supine|grab|pull|takedown|floor hold)\b/i;

/**
 * Language that puts a practitioner's hands on a learner.
 *
 * Narrower than `RESTRICTED_PROCEDURE_LEXICON`, and for a different job. That one bans
 * words from escalation content, so it is deliberately broad and catches "block" in
 * "ten-second blocks". This one decides how closely a glossary entry has to be read, so a
 * false positive costs a reviewer's evening and it only matches phrasings that can mean
 * nothing but physical contact with a person — "physical guidance", "hand-over-hand",
 * "response blocking".
 *
 * Physical prompting is legitimate content and this does not reject it. It moves the
 * entry out of the sampled tier, so that no entry describing contact with a learner ships
 * on a sample of its neighbours.
 */
export const PHYSICAL_CONTACT_LEXICON =
	/\b(physical(?:ly)? (?:contact|interrupt\w*|block\w*|manag\w*|guid\w*|hold\w*|restrain\w*|intervene|redirect\w*)|physical (?:guidance|management|prompt\w*)|hands-on (?:training|contact)|response block\w*|response interrupt\w*|hand[- ]over[- ]hand)\b/i;

/** Language that would place the app in a clinician\'s role. */
export const CLINICAL_DECISION_LEXICON =
	/\b(diagnose|diagnosis of|prescrib\w*|dosage|titrat\w*|\d+\s?mg)\b/i;
