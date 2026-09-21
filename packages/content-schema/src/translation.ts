import { z } from 'zod';
import { strictContent } from './guards.js';
import { Provenance, Review, Slug } from './primitives.js';

/**
 * HOW A TRANSLATION IS STORED.
 *
 * Settled before the English corpus is approved rather than after, because the expensive
 * part is not adding a field — a defaulted field costs nothing. The expensive part is
 * that an approval is a claim about a specific piece of prose, and the shape chosen here
 * decides whether an English approval can mean "this file is reviewed" or only "part of
 * this file is reviewed". Once two hundred and fifty-nine entries carry approvals, that
 * answer is very hard to change.
 *
 * The decision: a translation is a separate file holding ONLY the translatable prose,
 * pinned to the exact version of the entry it renders. Structure is inherited from the
 * source entry and cannot be restated here.
 *
 * ## Why not a field on the term
 *
 * Review status is per file in every mechanism this repository already has.
 * `checkReviewStatus` takes one review block, the review queue lists one row per entry,
 * `apply-review` writes one status per file, and CODEOWNERS routes by path. A nested
 * translation would need a second review ladder living inside a file, and nothing in the
 * pipeline reads reviews that way — so the cost of avoiding a second file is building a
 * second review system. Beyond that, every translation added later would edit a file that
 * is already approved, and a Spanish reviewer would be reading a diff inside a file that
 * is mostly English.
 *
 * ## Why not a parallel tree of whole entries
 *
 * `content/es/terms/*.md` holding complete `Term` documents is the tempting shape and it
 * is the wrong one: it duplicates everything that is not language. `category`, `taskRefs`,
 * `ethicsRefs`, `contrastWith`, `seeAlso`, `searchBoost` and `citations` are facts about
 * the concept, not about the English sentence describing it. Duplicated, they can
 * disagree — and this corpus validates exactly those fields across entries (contrast pairs
 * must be symmetric, `seeAlso` must resolve, aliases must not collide, task codes must
 * exist in the outline). A second tree would either run all of that again over a graph
 * that can silently diverge, or skip it. A `seeAlso` that resolves in English and dangles
 * in Spanish is a new class of broken link invented for nothing.
 *
 * So: structure is inherited, prose is translated, and a translation file has no field in
 * which a structural fact could be written. Same move as `officialText: z.null()` — make
 * the wrong thing unsayable rather than merely discouraged.
 */

/**
 * Languages this corpus can be translated into.
 *
 * An enum rather than a BCP 47 pattern, because adding a language is not a data entry
 * decision. Several build checks are English-only (see `LANGUAGE_CHECKS` below), and a
 * language added without deciding what replaces them would ship prose that looks checked
 * and is not. The enum is the extension point: adding a member forces an edit here, where
 * that table lives.
 */
export const TRANSLATION_LANGUAGES = ['es'] as const;
export const TranslationLanguage = z.enum(TRANSLATION_LANGUAGES);
export type TranslationLanguage = z.infer<typeof TranslationLanguage>;

export const LANGUAGE_LABELS: Record<TranslationLanguage, string> = {
	es: 'Español'
};

/**
 * What the build can and cannot check, per language. Recorded rather than implied.
 *
 * Two of the editorial gates on English prose are English by construction and would be
 * worse than useless elsewhere. `HOUSE_SPELLINGS` maps British spellings to American ones;
 * run over Spanish it fires on nothing, which is not a pass, it is an absence dressed as
 * one. `fleschKincaidGrade` counts English syllables, and it is a HARD gate on
 * `definition.plain` — pointed at Spanish it returns a number with no meaning and then
 * blocks or approves on it.
 *
 * The consequence is the important part, and it runs the opposite way to intuition: a
 * translation receives FEWER automated checks than the entry it renders, so it needs MORE
 * human reading, not less. That is why `SampledApproval` is deliberately absent from the
 * schema below — a sampled draw is a defensible way to approve ordinary English
 * definitions that a dozen other rules have already been over, and an indefensible way to
 * approve prose that none of those rules can read.
 */
export interface LanguageChecks {
	/** House-style spelling map exists for this language. */
	houseStyle: boolean;
	/** A readability formula calibrated for this language exists. */
	readability: boolean;
	/** The risk and restricted-verb lexicons exist in this language. */
	riskLexicon: boolean;
}

export const LANGUAGE_CHECKS: Record<TranslationLanguage, LanguageChecks> = {
	es: { houseStyle: false, readability: false, riskLexicon: false }
};

/**
 * Only terms, and the reason is safety rather than scope.
 *
 * Situations, ethics topics and escalation cards are guarded by lexicons that read their
 * prose for procedural instruction and crisis language — the machinery that makes writing
 * a restraint procedure into an escalation card a build failure. Those lexicons are
 * English. Translating a safety entry into a language whose lexicon does not exist would
 * route the whole guard, and the result would be an unguarded escalation card that the
 * build reported as clean.
 *
 * So the schema refuses it. `kind` is a literal, not an enum, and widening it is a
 * deliberate edit that sits next to this paragraph. Glossary definitions carry no
 * procedure, which is what makes them the safe thing to start with.
 */
export const TranslatableKind = z.literal('term');

/**
 * Prose expands when translated — Spanish typically runs a fifth to a quarter longer than
 * the English it renders. Reusing the English ceilings would fail correct translations, so
 * every maximum is widened by this factor. Minimums are not scaled: they exist to catch a
 * stub, and a faithful translation that comes out shorter is a good translation.
 */
export const LENGTH_EXPANSION = 1.3;
const wider = (n: number): number => Math.round(n * LENGTH_EXPANSION);

/**
 * A rendered example.
 *
 * `setting` is absent on purpose: it is an enum, which makes it structure, and it is
 * inherited from the example this one renders. Examples are matched to their source by
 * POSITION, and the compiler requires the counts to match — a translation with an extra
 * example is not a translation, it is new content that nobody reviewed as one.
 */
const TranslatedExample = z.strictObject({
	text: z.string().min(15).max(wider(400)),
	why: z.string().max(wider(300)).optional()
});

/**
 * What the translator is asserting. Deliberately NOT the author's `Attestation`.
 *
 * `Attestation.originalProse` is `z.literal(true)` — "I wrote this myself, in my own
 * words". For a translation that is false by definition, and a schema that asks somebody
 * to assert it teaches them that the attestation block is a formality to be clicked
 * through. The claims below are the ones a translator can actually make.
 *
 * `noNewClaims` is the safety-relevant one. This app's whole posture is that it explains
 * what things mean and refuses to say what to do, and a translation that helpfully expands
 * a definition into advice would walk straight past every lexicon — which, in this
 * language, is not running anyway. The compiler enforces the structural half of that claim
 * by matching example counts; this is the half only a person can make.
 */
export const TranslationAttestation = z.strictObject({
	/** "This says what the source says — no more, no less." */
	faithfulRendering: z.literal(true),
	/** "This introduces no guidance, procedure or recommendation the source does not make." */
	noNewClaims: z.literal(true),
	/** Machine translation is a normal starting point; hiding it is not. */
	aiAssisted: z.boolean().default(false),
	/** Judgement calls worth recording: a term of art with no settled equivalent, and so on. */
	translatorNote: z.string().min(10).max(500)
});
export type TranslationAttestation = z.infer<typeof TranslationAttestation>;

/**
 * The entry this renders, at the version it was rendered from.
 *
 * The pin is what makes drift a build rule instead of a hope. `provenance.version` already
 * exists on every entry and is already maintained, so this costs nothing new; a content
 * hash was the alternative and would turn every whitespace fix into a false alarm.
 *
 * When the English moves ahead, the translation is stale — and stale is handled the way
 * unapproved is handled, by shipping less rather than shipping wrong.
 */
export const Translates = z.strictObject({
	kind: TranslatableKind,
	id: Slug,
	/** Must equal the source entry's `provenance.version` exactly. */
	version: z.number().int().min(1)
});

export const Translation = strictContent({
	lang: TranslationLanguage,
	translates: Translates,

	term: z.string().min(1).max(wider(80)),
	aliases: z.array(z.string()).default([]),
	abbreviation: z.string().max(wider(12)).nullable().default(null),

	definition: z.strictObject({
		technical: z.string().min(40).max(wider(700)),
		plain: z.string().min(20).max(wider(400)),
		/**
		 * Ships in the search row, where the slot is fixed. Widened like everything else,
		 * because a gloss truncated into inaccuracy is worse than one that wraps.
		 */
		gloss: z.string().min(10).max(wider(90))
	}),

	examples: z.array(TranslatedExample).min(1).max(4),
	nonExamples: z.array(TranslatedExample).min(1).max(4),

	/**
	 * Flashcard overrides only. `enabled` is absent: whether a term is a card at all is a
	 * property of the term, not of the language somebody reads it in.
	 */
	flashcard: z
		.strictObject({
			front: z.string().max(wider(160)).nullable().default(null),
			back: z.string().max(wider(400)).nullable().default(null),
			mnemonic: z.string().max(wider(200)).nullable().default(null)
		})
		.default({ front: null, back: null, mnemonic: null }),

	/**
	 * Its own ladder, entirely independent of the source entry's.
	 *
	 * Independent in both directions, and both directions matter. Approving the English
	 * does not approve a rendering of it that the approver may not be able to read.
	 * Approving a translation does not approve the English — and the compiler additionally
	 * refuses to ship an approved translation of an entry that is itself withheld, because
	 * translating unreviewed content does not review it.
	 *
	 * `SampledApproval` is absent. See `LANGUAGE_CHECKS`: every translation is read.
	 */
	review: Review,
	attestation: TranslationAttestation,
	/**
	 * The translation's own provenance. Note that `provenance.version` here counts
	 * revisions of THIS RENDERING, and is a different number from `translates.version`,
	 * which names the revision of the English entry being rendered. Re-reading a stale
	 * translation against a changed entry moves both: the pin forward to the entry's
	 * current version, and this one up by one, because the Spanish prose changed too.
	 */
	provenance: Provenance
});
export type Translation = z.infer<typeof Translation>;

/** Where a language's files live, relative to the content root. */
export function translationDir(lang: TranslationLanguage): string {
	return `translations/${lang}/terms`;
}

/**
 * Asset suffix for a language's compiled output.
 *
 * One index per language rather than one index holding both, which is the search half of
 * this decision. Three reasons, in order of weight: a merged index doubles a lazily
 * fetched download for a reader who uses one language; `prefix` and `fuzzy: 0.2` matching
 * across two languages at once produces cross-language false hits that `boostDocument`
 * cannot cleanly suppress without storing a language on every document and paying for it
 * on every keystroke; and the translated corpus will be much smaller than the English one
 * for a long time, so merging would scatter a few Spanish results through a field of
 * English ones instead of letting the app say plainly how much is available.
 */
export function languageSuffix(lang: TranslationLanguage): string {
	return `.${lang}`;
}
