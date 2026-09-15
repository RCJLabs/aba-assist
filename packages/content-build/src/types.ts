import type { Channel } from '@aba/content-schema';

export type Severity = 'error' | 'warning';

export interface Issue {
	severity: Severity;
	/** Stable rule id, e.g. "rights/verbatim-guard". Used in tests and in CI output. */
	rule: string;
	message: string;
	file?: string;
	line?: number;
	col?: number;
}

export interface CompileOptions {
	root: string;
	channel: Channel;
	outDir: string;
	/** When false, validate only — do not write anything. */
	emit?: boolean;
	/**
	 * How many approved terms a release needs. Defaults to `RELEASE_MINIMUM_TERMS`, which
	 * is the real gate; this exists so tests can exercise the threshold both ways without
	 * writing a hundred and fifty fixtures to prove one branch.
	 */
	minimumTerms?: number;
}

export interface EmittedAsset {
	/** Logical name, e.g. "terms.index". */
	name: string;
	/** Path within the client bundle, e.g. "data/ab12cd/terms.index.json". */
	fileName: string;
	source: string;
	/**
	 * True only for assets the app fetches over the network at runtime (gated Pro packs).
	 * Free content is imported as a module and ships as a hashed bundle chunk, so emitting
	 * it as a standalone file too would duplicate the entire corpus in the precache.
	 */
	fetchedAtRuntime: boolean;
}

export interface CompileResult {
	ok: boolean;
	channel: Channel;
	contentVersion: string;
	errors: Issue[];
	warnings: Issue[];
	counts: Record<string, number>;
	assets: EmittedAsset[];
}

export function error(rule: string, message: string, file?: string, line?: number): Issue {
	return { severity: 'error', rule, message, file, line };
}

export function warning(rule: string, message: string, file?: string, line?: number): Issue {
	return { severity: 'warning', rule, message, file, line };
}
