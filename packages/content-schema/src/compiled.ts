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
	b: z.number() // search boost
});
export type TermIndexEntry = z.infer<typeof TermIndexEntry>;

export const AssetEntry = z.strictObject({
	url: z.string(),
	sha256: z.string(),
	bytes: z.number().int().nonnegative(),
	/** Drives the service-worker precache include list. */
	precache: z.boolean()
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
