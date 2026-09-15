import { z } from 'zod';
import { Channel, Slug } from './primitives.js';
import { TermCategory } from './term.js';

/**
 * The lightweight index shipped to every client. Short keys because this file is
 * fetched on the glossary route and again by the search layer; at ~600 terms the
 * difference between `term` and `t` across every record is not noise.
 *
 * Deliberately excludes full definitions — those live in per-category buckets.
 */
export const TermIndexEntry = z.strictObject({
	i: Slug, // id
	t: z.string(), // term
	a: z.array(z.string()), // aliases
	c: TermCategory, // category
	g: z.string(), // gloss
	b: z.number(), // search boost
	/** Outline refs as "RBT:C" or "BCBA:G.5" — what the exam and domain filters key on. */
	r: z.array(z.string()),
	/** Whether the term opts into flashcards. */
	f: z.boolean()
});
export type TermIndexEntry = z.infer<typeof TermIndexEntry>;

/**
 * What kind of thing a search result is.
 *
 * Kept separate from the term index rather than folded into it: `TermIndexEntry` is read
 * by the glossary, the flashcard decks and every term-name lookup in the app, and none of
 * those want a situation or an exam task in the list.
 */
export const SearchKind = z.enum([
	'term',
	'scenario',
	'ethics-topic',
	'practice-guide',
	'graph',
	'task'
]);
export type SearchKind = z.infer<typeof SearchKind>;

/**
 * One searchable thing, of any kind.
 *
 * The home screen is a search box, so anything a reader might type has to be in here. A
 * technician typing "gift" wants the ethics topic as much as the glossary entry, and one
 * typing "my client bit me" wants the situation — neither of which existed in an index
 * that only knew about terms.
 *
 * Deliberately display-only: enough to rank a row and render it, never the body text. The
 * body is indexed for matching and then thrown away, because this file is parsed on every
 * cold start and a corpus-sized index is not.
 */
export const SearchIndexEntry = z.strictObject({
	/** Content id, unique within its kind. */
	i: Slug,
	k: SearchKind,
	/** Title shown on the row. */
	t: z.string(),
	a: z.array(z.string()),
	/** Short label for the row: "Principles", "Situation", "Ethics", "RBT task". */
	l: z.string(),
	g: z.string(),
	/** Term category, for the category filter. Null for every other kind. */
	c: TermCategory.nullable(),
	/** Ranking weight: the author's boost, scaled by how answer-shaped the kind is. */
	b: z.number(),
	/** Outline refs as "RBT:C" or "BCBA:G.5" — what the exam and domain filters key on. */
	r: z.array(z.string()),
	/** Owning document, where the row is not its own page. An outline id, for a task. */
	p: z.string().nullable()
});
export type SearchIndexEntry = z.infer<typeof SearchIndexEntry>;

export const AssetEntry = z.strictObject({
	url: z.string(),
	sha256: z.string(),
	bytes: z.number().int().nonnegative(),
	/** True only for assets fetched over the network at runtime (gated Pro packs). */
	fetchedAtRuntime: z.boolean()
});

export const ContentManifest = z.strictObject({
	/** Hash over every content input. Surfaced in-app so staleness is visible. */
	contentVersion: z.string(),
	builtAt: z.string(),
	channel: Channel,
	counts: z.record(z.string(), z.number()),
	assets: z.record(z.string(), AssetEntry)
});
export type ContentManifest = z.infer<typeof ContentManifest>;
