/**
 * Local storage for everything the reader does: flashcard scheduling, review history,
 * quiz attempts. IndexedDB, through `idb`.
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
}

type Migration = (
	db: IDBPDatabase<AbaDB>,
	tx: IDBPTransaction<AbaDB, ('cards' | 'reviewLog' | 'quizAttempts')[], 'versionchange'>
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
}> {
	const db = await openAbaDB();
	const [cards, reviewLog, quizAttempts] = await Promise.all([
		db.getAll('cards'),
		db.getAll('reviewLog'),
		db.getAll('quizAttempts')
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
		quizAttempts
	};
}

export async function clearAll(): Promise<void> {
	const db = await openAbaDB();
	const tx = db.transaction(['cards', 'reviewLog', 'quizAttempts'], 'readwrite');
	await Promise.all([
		tx.objectStore('cards').clear(),
		tx.objectStore('reviewLog').clear(),
		tx.objectStore('quizAttempts').clear()
	]);
	await tx.done;
}
