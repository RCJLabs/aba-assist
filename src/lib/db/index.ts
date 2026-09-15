/**
 * Local storage for everything the reader does: flashcard scheduling, review history,
 * quiz attempts, and content-review decisions. IndexedDB, through `idb`.
 *
 * Rules that keep this layer safe:
 *
 * - It accepts and returns plain objects only. Svelte 5 `$state` values are Proxies, and
 *   `structuredClone` (which IndexedDB uses) throws on a Proxy — so callers snapshot
 *   before writing. The lint rule that keeps components out of `$db` exists to make that
 *   boundary real.
 * - There is no client data here and no field that could hold any. Cards are keyed by
 *   glossary term id; attempts hold question ids and counts.
 * - Migrations are an append-only ladder. `DB_VERSION` is the ladder's length, so adding
 *   a migration is the only way to bump the version, and every existing install walks
 *   the same steps in the same order.
 */
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { CardRecord, ReviewRecord } from './scheduler.js';

export interface QuizAttempt {
	id: string;
	credential: string;
	/** A domain letter, or "all". */
	domain: string;
	startedAt: number;
	finishedAt: number;
	total: number;
	correct: number;
	perDomain: Record<string, { total: number; correct: number }>;
	/** Question ids answered incorrectly, for "review what I missed". */
	missed: string[];
}

/**
 * One reviewer's verdict on one content item.
 *
 * Kept on the device rather than sent anywhere: there is no backend, and a verdict is
 * only meaningful once it reaches the content files in git. The review page exports
 * these, and `apply-review` writes them into the frontmatter.
 */
export interface ReviewDecision {
	/** Content id — a term slug, a question id, an outline id. */
	id: string;
	kind: ReviewableKind;
	decision: 'approved' | 'needs-change';
	/** Required for `needs-change`: what is wrong. */
	note: string;
	decidedAt: number;
}

export type ReviewableKind =
	'term' | 'scenario' | 'question' | 'ethics-topic' | 'ethics-code' | 'credential' | 'outline';

/**
 * Someone a user supervises, or the organisation they work for.
 *
 * Note what is absent. There is no `name`, no `dob`, no `address` — not because writing
 * one in would be discouraged, but because there is nowhere to put it. `code` is
 * constrained by `SUPERVISEE_CODE` to at most three letters and a number, which cannot
 * spell a name. That is the whole PHI strategy: make the unsafe thing unrepresentable,
 * and treat the note linter as the second line rather than the first.
 */
export interface Supervisee {
	id: string;
	/** A code like "S-04". Validated against SUPERVISEE_CODE before it gets here. */
	code: string;
	role: 'RBT' | 'BCaBA' | 'trainee';
	active: boolean;
	createdAt: number;
}

/** A place of work, so the 5% rule can be computed per organisation as the code requires. */
export interface Workplace {
	id: string;
	label: string;
	active: boolean;
	createdAt: number;
}

export type ContactFormat = 'individual' | 'small-group';
export type ContactModality = 'in-person' | 'live-video';

/** One supervision contact. */
export interface SupervisionEntry {
	id: string;
	/** YYYY-MM-DD. A string, not a Date: this is a calendar day, not an instant. */
	date: string;
	minutes: number;
	format: ContactFormat;
	modality: ContactModality;
	/** Whether the supervisor observed work with a client during this contact. */
	observed: boolean;
	workplaceId: string;
	/** Set when logging supervision you gave; null when logging supervision you received. */
	superviseeId: string | null;
	/** The one free-text field in the tracker, and the one the PHI linter watches. */
	note: string;
}

/**
 * Hours of service delivery in one calendar month at one workplace.
 *
 * The denominator of the 5% rule, and the number nobody has to hand — so it is entered
 * once a month rather than derived from anything.
 */
export interface ServiceMonth {
	/** `${workplaceId}:${YYYY-MM}`, so entering the same month twice updates it. */
	id: string;
	/** YYYY-MM. */
	month: string;
	workplaceId: string;
	hours: number;
}

/** A recertification cycle: the window units have to be earned inside. */
export interface Cycle {
	id: string;
	credential: 'RBT' | 'BCBA' | 'BCaBA';
	/** YYYY-MM-DD. */
	startDate: string;
	endDate: string;
	/** Analysts only: whether this cycle triggers the supervision-unit minimum. */
	supervisedOthers: boolean;
}

export type UnitTopic = 'general' | 'ethics' | 'supervision';
export type UnitKind =
	'learning' | 'teaching' | 'scholarship' | 'in-service' | 'university-course';

/** One professional-development entry: a PDU for a technician, a CEU for an analyst. */
export interface DevelopmentUnit {
	id: string;
	cycleId: string;
	/** YYYY-MM-DD. */
	date: string;
	units: number;
	kind: UnitKind;
	topic: UnitTopic;
	/** The event's own title, and who ran it. Neither is about a client. */
	title: string;
	provider: string;
}

interface AbaDB extends DBSchema {
	cards: {
		key: string;
		value: CardRecord;
		indexes: { 'by-due': number };
	};
	reviewLog: {
		key: number;
		value: ReviewRecord & { id?: number };
		indexes: { 'by-card': string; 'by-time': number };
	};
	quizAttempts: {
		key: string;
		value: QuizAttempt;
		indexes: { 'by-finished': number };
	};
	reviewDecisions: {
		key: string;
		value: ReviewDecision;
		indexes: { 'by-kind': string };
	};
	supervisees: {
		key: string;
		value: Supervisee;
		indexes: { 'by-code': string };
	};
	workplaces: {
		key: string;
		value: Workplace;
	};
	supervisionEntries: {
		key: string;
		value: SupervisionEntry;
		indexes: { 'by-date': string; 'by-supervisee': string };
	};
	serviceMonths: {
		key: string;
		value: ServiceMonth;
		indexes: { 'by-month': string };
	};
	cycles: {
		key: string;
		value: Cycle;
	};
	developmentUnits: {
		key: string;
		value: DevelopmentUnit;
		indexes: { 'by-cycle': string; 'by-date': string };
	};
}

type StoreName =
	| 'cards'
	| 'reviewLog'
	| 'quizAttempts'
	| 'reviewDecisions'
	| 'supervisees'
	| 'workplaces'
	| 'supervisionEntries'
	| 'serviceMonths'
	| 'cycles'
	| 'developmentUnits';

type Migration = (
	db: IDBPDatabase<AbaDB>,
	tx: IDBPTransaction<AbaDB, StoreName[], 'versionchange'>
) => void;

const MIGRATIONS: Migration[] = [
	// v1 — flashcards, review log, quiz attempts.
	(db) => {
		const cards = db.createObjectStore('cards', { keyPath: 'id' });
		cards.createIndex('by-due', 'due');

		const log = db.createObjectStore('reviewLog', { keyPath: 'id', autoIncrement: true });
		log.createIndex('by-card', 'cardId');
		log.createIndex('by-time', 'reviewedAt');

		const attempts = db.createObjectStore('quizAttempts', { keyPath: 'id' });
		attempts.createIndex('by-finished', 'finishedAt');
	},

	// v2 — content-review decisions, for the reviewer working through the queue.
	(db) => {
		const decisions = db.createObjectStore('reviewDecisions', { keyPath: 'id' });
		decisions.createIndex('by-kind', 'kind');
	},

	// v3 — supervision and professional-development tracking.
	(db) => {
		const supervisees = db.createObjectStore('supervisees', { keyPath: 'id' });
		supervisees.createIndex('by-code', 'code', { unique: true });

		db.createObjectStore('workplaces', { keyPath: 'id' });

		const supervision = db.createObjectStore('supervisionEntries', { keyPath: 'id' });
		supervision.createIndex('by-date', 'date');
		supervision.createIndex('by-supervisee', 'superviseeId');

		const months = db.createObjectStore('serviceMonths', { keyPath: 'id' });
		months.createIndex('by-month', 'month');

		db.createObjectStore('cycles', { keyPath: 'id' });

		const units = db.createObjectStore('developmentUnits', { keyPath: 'id' });
		units.createIndex('by-cycle', 'cycleId');
		units.createIndex('by-date', 'date');
	}
];

export const DB_NAME = 'aba-assist';
export const DB_VERSION = MIGRATIONS.length;

let handle: Promise<IDBPDatabase<AbaDB>> | null = null;

export function openAbaDB(): Promise<IDBPDatabase<AbaDB>> {
	if (!handle) {
		handle = openDB<AbaDB>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion, _newVersion, tx) {
				for (let v = oldVersion; v < MIGRATIONS.length; v++) MIGRATIONS[v]!(db, tx);
			},
			blocking() {
				// Another tab is upgrading. Close so it can proceed; the next call reopens.
				void handle?.then((db) => db.close());
				handle = null;
			}
		});
	}
	return handle;
}

/** For tests and for "clear my data": drops the cached handle so the next call reopens. */
export function resetDbHandle(): void {
	handle = null;
}

// ------------------------------------------------------------------- cards

export async function getAllCards(): Promise<CardRecord[]> {
	const db = await openAbaDB();
	return db.getAll('cards');
}

export async function getCard(id: string): Promise<CardRecord | undefined> {
	const db = await openAbaDB();
	return db.get('cards', id);
}

export async function putCard(card: CardRecord): Promise<void> {
	const db = await openAbaDB();
	await db.put('cards', card);
}

/** Store the rescheduled card and its log entry atomically. */
export async function recordReview(card: CardRecord, review: ReviewRecord): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction(['cards', 'reviewLog'], 'readwrite');
	await Promise.all([
		tx.objectStore('cards').put(card),
		tx.objectStore('reviewLog').add(review)
	]);
	await tx.done;
}

export async function countReviews(): Promise<number> {
	const db = await openAbaDB();
	return db.count('reviewLog');
}

export async function deleteCards(ids: string[]): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction('cards', 'readwrite');
	await Promise.all(ids.map((id) => tx.store.delete(id)));
	await tx.done;
}

// ------------------------------------------------------- review decisions

export async function getDecisions(): Promise<ReviewDecision[]> {
	const db = await openAbaDB();
	return db.getAll('reviewDecisions');
}

export async function putDecision(decision: ReviewDecision): Promise<void> {
	const db = await openAbaDB();
	await db.put('reviewDecisions', decision);
}

export async function clearDecision(id: string): Promise<void> {
	const db = await openAbaDB();
	await db.delete('reviewDecisions', id);
}

export async function clearDecisions(): Promise<void> {
	const db = await openAbaDB();
	await db.clear('reviewDecisions');
}

// ----------------------------------------------------------------- tracker

/*
 * Generic accessors rather than six near-identical triples. Every tracker store is keyed
 * by `id` and read whole — these are tens of rows, not thousands — so the only thing that
 * varies is the store name, and the type parameter keeps that honest at the call site.
 */
type TrackerStore =
	| 'supervisees'
	| 'workplaces'
	| 'supervisionEntries'
	| 'serviceMonths'
	| 'cycles'
	| 'developmentUnits';

export async function getAll<S extends TrackerStore>(store: S): Promise<AbaDB[S]['value'][]> {
	const db = await openAbaDB();
	return db.getAll(store);
}

export async function put<S extends TrackerStore>(
	store: S,
	value: AbaDB[S]['value']
): Promise<void> {
	const db = await openAbaDB();
	await db.put(store, value);
}

export async function remove(store: TrackerStore, id: string): Promise<void> {
	const db = await openAbaDB();
	await db.delete(store, id);
}

/**
 * Delete a supervisee and every contact logged against them, in one transaction.
 *
 * Halfway through would leave contacts pointing at nobody, which the monthly summary
 * would then quietly drop from its totals — a compliance number that silently got smaller.
 */
export async function removeSupervisee(id: string): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction(['supervisees', 'supervisionEntries'], 'readwrite');
	const entries = await tx
		.objectStore('supervisionEntries')
		.index('by-supervisee')
		.getAllKeys(id);
	await Promise.all([
		tx.objectStore('supervisees').delete(id),
		...entries.map((key) => tx.objectStore('supervisionEntries').delete(key))
	]);
	await tx.done;
}

/** Same reasoning for a cycle and the units earned inside it. */
export async function removeCycle(id: string): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction(['cycles', 'developmentUnits'], 'readwrite');
	const units = await tx.objectStore('developmentUnits').index('by-cycle').getAllKeys(id);
	await Promise.all([
		tx.objectStore('cycles').delete(id),
		...units.map((key) => tx.objectStore('developmentUnits').delete(key))
	]);
	await tx.done;
}

// ---------------------------------------------------------------- attempts

export async function putAttempt(attempt: QuizAttempt): Promise<void> {
	const db = await openAbaDB();
	await db.put('quizAttempts', attempt);
}

export async function recentAttempts(limit = 20): Promise<QuizAttempt[]> {
	const db = await openAbaDB();
	const out: QuizAttempt[] = [];
	let cursor = await db
		.transaction('quizAttempts')
		.store.index('by-finished')
		.openCursor(null, 'prev');
	while (cursor && out.length < limit) {
		out.push(cursor.value);
		cursor = await cursor.continue();
	}
	return out;
}

// ------------------------------------------------------------------ export

/** Everything, as one JSON-serialisable object. The free-tier answer to "I got a new phone". */
export async function exportAll(): Promise<{
	version: number;
	exportedAt: number;
	cards: CardRecord[];
	reviewLog: ReviewRecord[];
	quizAttempts: QuizAttempt[];
	reviewDecisions: ReviewDecision[];
	supervisees: Supervisee[];
	workplaces: Workplace[];
	supervisionEntries: SupervisionEntry[];
	serviceMonths: ServiceMonth[];
	cycles: Cycle[];
	developmentUnits: DevelopmentUnit[];
}> {
	const db = await openAbaDB();
	const [
		cards,
		reviewLog,
		quizAttempts,
		reviewDecisions,
		supervisees,
		workplaces,
		supervisionEntries,
		serviceMonths,
		cycles,
		developmentUnits
	] = await Promise.all([
		db.getAll('cards'),
		db.getAll('reviewLog'),
		db.getAll('quizAttempts'),
		db.getAll('reviewDecisions'),
		db.getAll('supervisees'),
		db.getAll('workplaces'),
		db.getAll('supervisionEntries'),
		db.getAll('serviceMonths'),
		db.getAll('cycles'),
		db.getAll('developmentUnits')
	]);
	return {
		version: DB_VERSION,
		exportedAt: Date.now(),
		cards,
		reviewLog: reviewLog.map((r) => {
			const { id, ...rest } = r;
			void id;
			return rest;
		}),
		quizAttempts,
		reviewDecisions,
		supervisees,
		workplaces,
		supervisionEntries,
		serviceMonths,
		cycles,
		developmentUnits
	};
}

export async function clearAll(): Promise<void> {
	const db = await openAbaDB();
	const stores: StoreName[] = [
		'cards',
		'reviewLog',
		'quizAttempts',
		'reviewDecisions',
		'supervisees',
		'workplaces',
		'supervisionEntries',
		'serviceMonths',
		'cycles',
		'developmentUnits'
	];
	const tx = db.transaction(stores, 'readwrite');
	await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
	await tx.done;
}
